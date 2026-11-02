import json

import pandas as pd

from carburants import export, geo, load


def test_dep_of_flux_and_postal_code():
    assert geo.dep_of("34", None) == "34"
    assert geo.dep_of("1", None) == "01"
    assert geo.dep_of(None, "20090") == "2A"
    assert geo.dep_of(None, "20200") == "2B"
    assert geo.dep_of(None, "97400") == "974"
    assert geo.dep_of(float("nan"), "06000") == "06"
    assert geo.dep_of(None, None) is None


# Deux départements voisins : A à l'ouest (lon 3.0), B à l'est (lon 3.2, ~16 km) ; C très loin.
PTS = [("a1", 43.6, 3.0, "A"), ("a2", 43.6, 2.9, "A"), ("b1", 43.6, 3.2, "B"), ("c1", 47.0, 3.0, "C")]


def test_fringe_includes_close_neighbours_only():
    f = geo.fringe(PTS, km=35)
    assert f["A"] == {"b1"} and f["B"] == {"a1", "a2"} or f["B"] == {"a1"}
    assert "C" not in f and all("c1" not in v for v in f.values())


def test_grid_maps_cells_to_nearest_department():
    g = geo.build_grid(PTS)
    deps = g["deps"]
    def at(lat, lon):
        c = g["rows"][int((lat - g["lat0"]) / g["step"])][int((lon - g["lon0"]) / g["step"])]
        return deps.get(c)
    assert at(43.6, 2.95) == "A" and at(43.6, 3.2) == "B" and at(47.0, 3.0) == "C"
    assert at(45.0, 3.0) is None  # entre les deux : hors couverture


def test_write_departments(tmp_path):
    def st(i, lat, lon, dep):
        return {"id": i, "lat": lat, "lon": lon, "dep": dep, "prices": {"sp95": [1.8, "2026-10-25T06:00:00Z"]}}
    payload = {"generated_at": "x", "last_price_at": "x", "max_age_days": 14, "stations": [st(*p) for p in PTS]}
    m = export.write_departments(payload, tmp_path)
    assert set(m["departments"]) == {"A", "B", "C"}
    a = json.loads((tmp_path / "dept" / "A.json").read_text())
    assert {s["id"] for s in a["stations"]} == {"a1", "a2", "b1"} and a["fuels"]["sp95"]["stations"] == 3
    assert (tmp_path / "grid.json").exists() and (tmp_path / "index.json").exists()


def test_monthly_files_become_daily(tmp_path):
    out = load.events_dir(tmp_path)
    out.mkdir(parents=True)
    ts = pd.to_datetime(["2026-10-01T08:00:00Z", "2026-10-02T09:00:00Z"], utc=True)
    df = pd.DataFrame({"station_id": ["1", "1"], "fuel": "sp95", "price": [1.8, 1.9], "price_updated_at": ts, "first_seen_at": ts})
    df.to_parquet(out / "2026-10.parquet", index=False)
    assert load.migrate_months(tmp_path) == 1
    assert sorted(f.name for f in out.glob("*.parquet")) == ["2026-10-01.parquet", "2026-10-02.parquet"]
    assert len(load.read_events(tmp_path)) == 2
