"""Transformation : flux « large » (une colonne par carburant) -> tables propres.

Sorties :
  stations : une ligne par station (dimension).
  events   : une ligne par (station, carburant, date de mise à jour du prix) (faits).

Le schéma du flux n'a pas pu être vérifié à l'écriture : seules la colonne `id` et au moins
un couple `<carburant>_prix` / `<carburant>_maj` sont indispensables. Le reste est optionnel.
"""

from __future__ import annotations

import pandas as pd

from . import config

EVENT_COLUMNS = ["station_id", "fuel", "price", "price_updated_at", "first_seen_at"]
STATION_OUT_COLUMNS = list(config.STATION_COLUMNS.values())


class SchemaError(ValueError):
    """Le flux ne contient pas les colonnes attendues (schéma modifié par le producteur ?)."""


def _available_fuels(df: pd.DataFrame) -> list[str]:
    if "id" not in df.columns:
        raise SchemaError(f"Colonne `id` absente. Colonnes disponibles : {sorted(df.columns)}.")
    fuels = [f for f in config.FUELS if f"{f}_prix" in df.columns and f"{f}_maj" in df.columns]
    if not fuels:
        raise SchemaError(
            "Aucune colonne <carburant>_prix / <carburant>_maj trouvée. "
            f"Colonnes disponibles : {sorted(df.columns)}. Adapter config.py (FUELS)."
        )
    return fuels


def _department_mask(df: pd.DataFrame, departments: list[str]) -> pd.Series:
    """Filtre local : code département si présent, sinon deux premiers chiffres du code postal."""
    if "dep_code" in df.columns:
        dep = df["dep_code"].astype(str).str.strip().str.zfill(2)
    elif "cp" in df.columns:
        dep = df["cp"].astype(str).str.strip().str.zfill(5).str[:2]
    else:
        raise SchemaError(
            "Impossible de filtrer par département : ni `dep_code` ni `cp`. "
            f"Colonnes disponibles : {sorted(df.columns)}."
        )
    return dep.isin([d.zfill(2) for d in departments])


def _fix_coordinate(series: pd.Series, limit: float) -> pd.Series:
    """Certains exports donnent des degrés, d'autres des degrés x 100000."""
    s = pd.to_numeric(series, errors="coerce")
    return s.where(s.abs() <= limit, s / 100_000)


def normalize(
    records: list[dict],
    snapshot_ts: pd.Timestamp,
    departments: list[str] | None = None,
) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Retourne (stations, events). snapshot_ts doit être tz-aware UTC."""
    if not records:
        raise ValueError("Le flux est vide : aucune station reçue.")
    raw = pd.DataFrame.from_records(records)
    fuels = _available_fuels(raw)

    if departments:
        raw = raw[_department_mask(raw, departments)]
        if raw.empty:
            raise ValueError(f"Aucune station trouvée pour les départements {departments}.")

    stations = pd.DataFrame(index=raw.index)
    for src, dst in config.STATION_COLUMNS.items():
        stations[dst] = raw[src] if src in raw.columns else None
    stations["station_id"] = stations["station_id"].astype(str)
    stations["latitude"] = _fix_coordinate(stations["latitude"], 90)
    stations["longitude"] = _fix_coordinate(stations["longitude"], 180)
    stations = stations.drop_duplicates("station_id", keep="last").reset_index(drop=True)

    parts = []
    for fuel in fuels:
        part = pd.DataFrame(
            {
                "station_id": raw["id"].astype(str),
                "fuel": fuel,
                "price": pd.to_numeric(raw[f"{fuel}_prix"], errors="coerce"),
                "price_updated_at": pd.to_datetime(raw[f"{fuel}_maj"], errors="coerce", utc=True),
            }
        )
        parts.append(part.dropna(subset=["price", "price_updated_at"]))
    events = pd.concat(parts, ignore_index=True)
    events["first_seen_at"] = snapshot_ts
    events = events.drop_duplicates(["station_id", "fuel", "price_updated_at"])
    return stations, events[EVENT_COLUMNS].reset_index(drop=True)
