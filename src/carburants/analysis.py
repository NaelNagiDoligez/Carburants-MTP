"""Analyse : où faire le plein, en tenant compte du détour.

Principe : le prix affiché ne suffit pas. Une station 4 centimes moins chère mais à 12 km
coûte plus cher que la station du coin une fois le carburant du détour compté.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from . import load

# Place de la Comédie, Montpellier (point de départ par défaut).
DEFAULT_ORIGIN = (43.6084, 3.8796)
EARTH_RADIUS_KM = 6371.0088


def haversine_km(lat1, lon1, lat2, lon2):
    """Distance à vol d'oiseau en km (accepte des tableaux numpy)."""
    lat1, lon1, lat2, lon2 = map(np.radians, (lat1, lon1, lat2, lon2))
    a = np.sin((lat2 - lat1) / 2) ** 2 + np.cos(lat1) * np.cos(lat2) * np.sin((lon2 - lon1) / 2) ** 2
    return 2 * EARTH_RADIUS_KM * np.arcsin(np.sqrt(a))


def latest_prices(events: pd.DataFrame) -> pd.DataFrame:
    """Dernier prix connu par (station, carburant)."""
    if events.empty:
        return events
    idx = events.groupby(["station_id", "fuel"])["price_updated_at"].idxmax()
    return events.loc[idx].reset_index(drop=True)


def rank_stations(
    events: pd.DataFrame,
    stations: pd.DataFrame,
    fuel: str,
    origin: tuple[float, float] = DEFAULT_ORIGIN,
    now: pd.Timestamp | None = None,
    radius_km: float = 15.0,
    max_age_days: float = 14.0,
    tank_litres: float = 12.0,
    consumption_l_per_100km: float = 5.0,
    road_factor: float = 1.3,
) -> pd.DataFrame:
    """Classe les stations par coût total d'un plein, détour compris.

    road_factor convertit la distance à vol d'oiseau en distance routière approximative.
    Colonnes ajoutées : distance_km, plein_eur (prix du carburant), detour_eur, total_eur,
    gain_vs_plus_proche_eur (positif = moins cher que la station la plus proche).
    """
    now = now if now is not None else pd.Timestamp.now(tz="UTC")
    last = latest_prices(events)
    last = last[last["fuel"] == fuel]
    df = last.merge(stations, on="station_id", how="inner")
    df = df[df["latitude"].notna() & df["longitude"].notna()].copy()
    if df.empty:
        return df.assign(distance_km=[], plein_eur=[], detour_eur=[], total_eur=[])

    df["age_days"] = (now - df["price_updated_at"]).dt.total_seconds() / 86400
    df = df[df["age_days"] <= max_age_days]

    df["distance_km"] = haversine_km(origin[0], origin[1], df["latitude"], df["longitude"]) * road_factor
    df = df[df["distance_km"] <= radius_km].copy()
    if df.empty:
        return df.assign(plein_eur=[], detour_eur=[], total_eur=[])

    df["plein_eur"] = df["price"] * tank_litres
    # Aller-retour depuis le point de départ, carburant payé au prix de la station.
    df["detour_eur"] = 2 * df["distance_km"] * consumption_l_per_100km / 100 * df["price"]
    df["total_eur"] = df["plein_eur"] + df["detour_eur"]
    df = df.sort_values("total_eur").reset_index(drop=True)

    nearest_total = df.loc[df["distance_km"].idxmin(), "total_eur"]
    df["gain_vs_plus_proche_eur"] = nearest_total - df["total_eur"]
    return df


def load_tables(data_dir) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Charge (events, stations) depuis le dossier de données."""
    return load.read_events(data_dir), load.read_stations(data_dir)


def fuel_coverage(events: pd.DataFrame, now: pd.Timestamp, max_age_days: float = 14.0) -> pd.Series:
    """Nombre de stations ayant un prix récent, par carburant."""
    last = latest_prices(events)
    age = (now - last["price_updated_at"]).dt.total_seconds() / 86400
    return last[age <= max_age_days].groupby("fuel")["station_id"].nunique().sort_values(ascending=False)
