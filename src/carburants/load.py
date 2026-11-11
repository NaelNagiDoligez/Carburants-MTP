"""Chargement : stockage Parquet partitionné par jour, écriture idempotente.

data/stations.parquet                dimension, réécrite à chaque run
data/price_events/YYYY-MM-DD.parquet faits, append-only dédupliqués sur
                                     (station_id, fuel, price_updated_at).
                                     Un fichier par jour : à l'échelle de la France, réécrire un fichier
                                     mensuel à chaque relevé ferait gonfler l'historique git.
"""

from __future__ import annotations

from pathlib import Path

import pandas as pd

from .transform import EVENT_COLUMNS

KEY = ["station_id", "fuel", "price_updated_at"]


def events_dir(data_dir: Path) -> Path:
    return Path(data_dir) / "price_events"


def read_events(data_dir: Path) -> pd.DataFrame:
    files = sorted(events_dir(data_dir).glob("*.parquet"))
    if not files:
        return pd.DataFrame(columns=EVENT_COLUMNS)
    return pd.concat((pd.read_parquet(f) for f in files), ignore_index=True)


def migrate_months(data_dir: Path) -> int:
    """Anciens fichiers YYYY-MM.parquet -> un fichier par jour (une seule fois). Retourne le nombre de fichiers convertis."""
    out = events_dir(data_dir)
    old = [f for f in sorted(out.glob("*.parquet")) if len(f.stem) == 7]
    for f in old:
        df = pd.read_parquet(f)
        for key, chunk in df.groupby(df["price_updated_at"].dt.strftime("%Y-%m-%d")):
            path = out / f"{key}.parquet"
            if path.exists():
                chunk = pd.concat([pd.read_parquet(path), chunk], ignore_index=True).drop_duplicates(KEY, keep="first")
            chunk.sort_values(KEY).to_parquet(path, index=False)
        f.unlink()
    return len(old)


def upsert_events(events: pd.DataFrame, data_dir: Path) -> int:
    """Ajoute uniquement les événements jamais vus. Retourne le nombre de lignes nouvelles."""
    out = events_dir(data_dir)
    out.mkdir(parents=True, exist_ok=True)
    migrate_months(data_dir)
    new_total = 0
    day = events["price_updated_at"].dt.strftime("%Y-%m-%d")
    for key, chunk in events.groupby(day):
        path = out / f"{key}.parquet"
        if path.exists():
            existing = pd.read_parquet(path)
            merged = pd.concat([existing, chunk], ignore_index=True)
            merged = merged.drop_duplicates(KEY, keep="first")  # garde le first_seen_at d'origine
            new_total += len(merged) - len(existing)
        else:
            merged = chunk.drop_duplicates(KEY, keep="first")
            new_total += len(merged)
        merged.sort_values(KEY).to_parquet(path, index=False)
    return new_total


def _write_if_changed(df: pd.DataFrame, path: Path) -> bool:
    """N'écrit que si le contenu diffère : un fichier identique ne doit pas créer une nouvelle version dans git."""
    if path.exists():
        try:
            old = pd.read_parquet(path)
            if list(old.columns) == list(df.columns) and len(old) == len(df) and old.astype(object).where(old.notna(), None).equals(df.astype(object).where(df.notna(), None)):
                return False
        except (OSError, ValueError) as exc:  # fichier illisible : on le remplace
            print(f"[load] {path.name} illisible ({exc}) : réécrit.")
    # Sans compression ni dictionnaire : deux versions successives restent presque identiques octet pour octet,
    # et git n'en stocke que la différence (un Parquet compressé change en entier pour quelques lignes modifiées).
    df.to_parquet(path, index=False, compression=None, use_dictionary=False)
    return True


def write_stations(stations: pd.DataFrame, data_dir: Path) -> None:
    """stations.parquet : la dimension stable (adresse, position, horaires…), triée, réécrite seulement si elle change.
    station_status.parquet : ce qui bouge à chaque relevé (carburants indisponibles, ruptures).

    Une station absente du relevé du jour reste dans la dimension : ses derniers prix restent exploitables.
    """
    from . import config

    data_dir = Path(data_dir)
    data_dir.mkdir(parents=True, exist_ok=True)
    volatile = [c for c in config.VOLATILE_STATION_COLUMNS if c in stations.columns]
    stable = stations.drop(columns=volatile)
    path = data_dir / "stations.parquet"
    if path.exists():
        try:
            old = pd.read_parquet(path)
            old = old[[c for c in old.columns if c not in config.VOLATILE_STATION_COLUMNS]]
            gone = old[~old["station_id"].astype(str).isin(set(stable["station_id"]))]
            if len(gone):
                stable = pd.concat([stable, gone], ignore_index=True)
        except (OSError, ValueError, KeyError) as exc:
            print(f"[load] ancienne dimension illisible ({exc}) : repartie du relevé du jour.")
    stable = stable.sort_values("station_id").reset_index(drop=True)
    _write_if_changed(stable, path)
    status = stations[["station_id", *volatile]].copy()
    for c in config.VOLATILE_STATION_COLUMNS:
        if c not in status.columns:
            status[c] = None
    status = status[status[config.VOLATILE_STATION_COLUMNS].notna().any(axis=1)]
    status = status.sort_values("station_id").reset_index(drop=True)
    _write_if_changed(status, data_dir / "station_status.parquet")


def read_stations(data_dir: Path) -> pd.DataFrame:
    """Dimension + statut du dernier relevé, réunis (les anciens fichiers, tout-en-un, se lisent pareil)."""
    data_dir = Path(data_dir)
    path = data_dir / "stations.parquet"
    if not path.exists():
        return pd.DataFrame()
    stations = pd.read_parquet(path)
    status_path = data_dir / "station_status.parquet"
    if status_path.exists():
        status = pd.read_parquet(status_path)
        stations = stations.drop(columns=[c for c in status.columns if c != "station_id" and c in stations.columns])
        stations = stations.merge(status, on="station_id", how="left")
    return stations
