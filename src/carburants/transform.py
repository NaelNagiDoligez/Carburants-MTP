"""Transformation : flux « large » (une colonne par carburant) -> tables propres.

Sorties :
  stations : une ligne par station (dimension).
  events   : une ligne par (station, carburant, date de mise à jour du prix) (faits).
"""

from __future__ import annotations

import pandas as pd

from . import config

EVENT_COLUMNS = ["station_id", "fuel", "price", "price_updated_at", "first_seen_at"]
STATION_OUT_COLUMNS = list(config.STATION_COLUMNS.values())


class SchemaError(ValueError):
    """Le flux ne contient pas les colonnes attendues (schéma modifié par le producteur ?)."""


def _check_schema(df: pd.DataFrame) -> None:
    expected = set(config.STATION_COLUMNS)
    price_cols = {f"{f}_prix" for f in config.FUELS}
    maj_cols = {f"{f}_maj" for f in config.FUELS}
    missing = (expected | price_cols | maj_cols) - set(df.columns)
    if missing:
        raise SchemaError(
            "Colonnes absentes du flux : "
            f"{sorted(missing)}. Colonnes disponibles : {sorted(df.columns)}. "
            "Adapter config.py (FUELS / STATION_COLUMNS)."
        )


def _fix_coordinate(series: pd.Series, limit: float) -> pd.Series:
    """Certains exports donnent des degrés, d'autres des degrés x 100000."""
    s = pd.to_numeric(series, errors="coerce")
    return s.where(s.abs() <= limit, s / 100_000)


def normalize(records: list[dict], snapshot_ts: pd.Timestamp) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Retourne (stations, events). snapshot_ts doit être tz-aware UTC."""
    if not records:
        raise ValueError("Le flux est vide : aucune station reçue.")
    raw = pd.DataFrame.from_records(records)
    _check_schema(raw)

    stations = raw[list(config.STATION_COLUMNS)].rename(columns=config.STATION_COLUMNS).copy()
    stations["station_id"] = stations["station_id"].astype(str)
    stations["latitude"] = _fix_coordinate(stations["latitude"], 90)
    stations["longitude"] = _fix_coordinate(stations["longitude"], 180)
    stations = stations.drop_duplicates("station_id", keep="last").reset_index(drop=True)

    parts = []
    for fuel in config.FUELS:
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
