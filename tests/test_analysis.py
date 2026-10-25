from pathlib import Path

import pandas as pd
import pytest

from carburants import analysis, extract, transform

FIXTURE = Path(__file__).parent / "fixtures" / "sample.json"
NOW = pd.Timestamp("2026-10-25T08:00:00", tz="UTC")
COMEDIE = analysis.DEFAULT_ORIGIN


@pytest.fixture
def tables():
    stations, events = transform.normalize(extract.read_records(FIXTURE), snapshot_ts=NOW)
    return events, stations


def test_haversine_known_distance():
    # Montpellier -> Nîmes, environ 49 km à vol d'oiseau.
    d = analysis.haversine_km(43.6084, 3.8796, 43.8367, 4.3601)
    assert 44 < float(d) < 50


def test_latest_prices_keeps_most_recent():
    ev = pd.DataFrame(
        {
            "station_id": ["1", "1"],
            "fuel": ["e10", "e10"],
            "price": [1.80, 1.90],
            "price_updated_at": pd.to_datetime(["2026-10-01", "2026-10-20"], utc=True),
            "first_seen_at": pd.Timestamp("2026-10-25", tz="UTC"),
        }
    )
    assert analysis.latest_prices(ev)["price"].tolist() == [1.90]


def test_rank_orders_by_total_cost(tables):
    events, stations = tables
    ranked = analysis.rank_stations(events, stations, "sp95", origin=COMEDIE, now=NOW, radius_km=40)
    assert ranked["total_eur"].is_monotonic_increasing
    assert len(ranked) == 3
    assert {"distance_km", "detour_eur", "gain_vs_plus_proche_eur"} <= set(ranked.columns)


def test_far_cheap_station_can_lose_to_near_one(tables):
    events, stations = tables
    # Détour très coûteux : la station la plus proche doit passer devant la moins chère.
    ranked = analysis.rank_stations(
        events, stations, "sp95", origin=COMEDIE, now=NOW, radius_km=60,
        consumption_l_per_100km=40, tank_litres=5,
    )
    assert ranked.iloc[0]["distance_km"] == ranked["distance_km"].min()


def test_radius_and_age_filters(tables):
    events, stations = tables
    assert analysis.rank_stations(events, stations, "sp95", origin=COMEDIE, now=NOW, radius_km=1).empty
    old = analysis.rank_stations(events, stations, "sp95", origin=COMEDIE,
                                 now=NOW + pd.Timedelta(days=60), radius_km=60)
    assert old.empty


def test_fuel_coverage(tables):
    events, _ = tables
    cov = analysis.fuel_coverage(events, NOW, max_age_days=30)
    assert cov["gazole"] == 3 and cov["sp98"] == 2
