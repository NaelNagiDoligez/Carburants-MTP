"""Chargement : stockage Parquet partitionné par mois, écriture idempotente.

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


def write_stations(stations: pd.DataFrame, data_dir: Path) -> None:
    Path(data_dir).mkdir(parents=True, exist_ok=True)
    stations.to_parquet(Path(data_dir) / "stations.parquet", index=False)
