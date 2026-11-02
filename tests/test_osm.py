import time

import pandas as pd

from carburants import export, osm

OSM_ELEMENTS = {
    "elements": [
        {"type": "node", "id": 1, "lat": 43.7000, "lon": 3.8500, "tags": {"amenity": "fuel", "brand": "Carrefour Market", "name": "Station Carrefour"}},
        {"type": "way", "id": 2, "center": {"lat": 43.7100, "lon": 3.8600}, "tags": {"amenity": "fuel", "name": "Station Test"}},
        {"type": "node", "id": 3, "lat": 43.7100, "lon": 3.8601, "tags": {"amenity": "fuel"}},
        {"type": "node", "id": 4, "tags": {"amenity": "fuel"}},  # sans position : ignoré
    ]
}


def test_parse_elements_handles_nodes_ways_and_missing_position():
    out = osm.parse_elements(OSM_ELEMENTS)
    assert [o["osm_id"] for o in out] == ["node/1", "way/2", "node/3"]
    assert out[0]["brand"] == "Carrefour Market"
    assert out[1]["lat"] == 43.71 and out[1]["brand"] is None and out[1]["name"] == "Station Test"


def test_snap_moves_to_the_real_station_and_names_it():
    # point du flux au milieu de la route, ~60 m de la station OSM
    stations = [{"id": "A", "lat": 43.70045, "lon": 3.8505}]
    out = osm.snap(stations, osm.parse_elements(OSM_ELEMENTS))
    assert out["A"]["lat"] == 43.7 and out["A"]["lon"] == 3.85
    assert out["A"]["nom"] == "Carrefour Market"


def test_snap_ignores_far_stations_and_never_reuses_an_osm_station():
    elems = osm.parse_elements(OSM_ELEMENTS)
    stations = [
        {"id": "far", "lat": 43.80, "lon": 3.85},        # à plus de 150 m de tout
        {"id": "near", "lat": 43.71, "lon": 3.8600},     # tout près de way/2
        {"id": "other", "lat": 43.71005, "lon": 3.86008},  # aussi près, mais way/2 est déjà pris -> node/3
    ]
    out = osm.snap(stations, elems)
    assert "far" not in out
    assert out["near"]["osm_id"] == "way/2"
    assert out["other"]["osm_id"] == "node/3"


def test_cache_staleness():
    assert osm.is_stale(None)
    assert osm.is_stale({"fetched_at": time.time() - 8 * 86400})
    assert not osm.is_stale({"fetched_at": time.time() - 3600})


def test_export_uses_snapped_position_and_name():
    now = pd.Timestamp("2026-11-01T12:00:00Z")
    events = pd.DataFrame({
        "station_id": ["A"], "fuel": ["sp95"], "price": [1.9], "price_updated_at": [now - pd.Timedelta(hours=2)],
        "snapshot_ts": [now],
    })
    stations = pd.DataFrame({
        "station_id": ["A"], "latitude": [43.70045], "longitude": [3.8505], "ville": ["Saint-Clément"], "adresse": ["Route de Ganges"], "cp": ["34980"],
    })
    elems = osm.parse_elements(OSM_ELEMENTS)
    with_osm = export.build_payload(events, stations, now=now, osm_stations=elems)["stations"][0]
    without = export.build_payload(events, stations, now=now)["stations"][0]
    assert with_osm["lat"] == 43.7 and with_osm["snap"] == 1 and with_osm["nom"] == "Carrefour Market"
    assert "snap" not in without and without["lat"] == 43.70045


def test_refresh_fetches_stale_departments_only(tmp_path, monkeypatch):
    calls = []
    monkeypatch.setattr(osm, "fetch", lambda bbox, session=None: calls.append(bbox) or [{"osm_id": f"node/{len(calls)}", "lat": bbox[0], "lon": bbox[1], "name": None, "brand": None}])
    monkeypatch.setattr(osm, "PAUSE_S", 0)
    pts = [{"dep": "34", "lat": 43.6, "lon": 3.8}, {"dep": "34", "lat": 43.7, "lon": 3.9}, {"dep": "30", "lat": 44.0, "lon": 4.1}]
    path = tmp_path / "osm.json"
    osm.refresh(path, pts, max_regions=1)
    assert len(calls) == 1  # un département par passage ici
    osm.refresh(path, pts, max_regions=5)
    assert len(calls) == 2  # le second département seulement : le premier est à jour
    cache = osm.read_cache(path)
    assert set(cache["regions"]) == {"34", "30"} and len(cache["stations"]) == 2
    osm.refresh(path, pts)
    assert len(calls) == 2


def test_legacy_cache_counts_as_herault_and_gard():
    cache = {"fetched_at": time.time(), "stations": [{"osm_id": "node/1", "lat": 1, "lon": 1}]}
    assert not osm.is_stale(cache, dep="34") and not osm.is_stale(cache, dep="30") and osm.is_stale(cache, dep="75")


def test_bboxes_per_department():
    b = osm.bboxes([{"dep": "34", "lat": 43.0, "lon": 3.0}, {"dep": "34", "lat": 44.0, "lon": 4.0}])
    assert b["34"] == (42.95, 2.95, 44.05, 4.05)
