from pathlib import Path

import pandas as pd
import pytest

from carburants import extract, load, quality, transform

FIXTURE = Path(__file__).parent / "fixtures" / "sample.json"
NOW = pd.Timestamp("2026-10-25T08:00:00", tz="UTC")


@pytest.fixture
def tables():
    records = extract.read_records(FIXTURE)
    return transform.normalize(records, snapshot_ts=NOW)


def test_department_filter(tables):
    records = extract.read_records(FIXTURE)
    stations, _ = transform.normalize(records, snapshot_ts=NOW, departments=["34"])
    assert set(stations["station_id"]) == {"34000001", "34000002"}


def test_department_filter_falls_back_on_postal_code():
    records = [
        {"id": 1, "cp": "34070", "sp95_prix": 1.8, "sp95_maj": "2026-10-25T06:00:00+00:00"},
        {"id": 2, "cp": "75001", "sp95_prix": 1.9, "sp95_maj": "2026-10-25T06:00:00+00:00"},
    ]
    stations, events = transform.normalize(records, snapshot_ts=NOW, departments=["34"])
    assert list(stations["station_id"]) == ["1"]
    assert list(events["fuel"]) == ["sp95"]


def test_minimal_schema_is_accepted():
    records = [{"id": 1, "e10_prix": 1.7, "e10_maj": "2026-10-25T06:00:00+00:00"}]
    stations, events = transform.normalize(records, snapshot_ts=NOW)
    assert len(events) == 1 and len(stations) == 1



def test_normalize_shapes(tables):
    stations, events = tables
    assert len(stations) == 3
    # 4 + 4 + 4 prix non nuls dans le fixture
    assert len(events) == 12
    assert set(events.columns) == set(transform.EVENT_COLUMNS)
    assert events["price_updated_at"].dt.tz is not None


def test_coordinates_in_degrees(tables):
    stations, _ = tables
    row = stations[stations["station_id"] == "34000002"].iloc[0]
    assert row["latitude"] == pytest.approx(43.661)
    assert row["longitude"] == pytest.approx(3.993)


def test_schema_error_lists_available_columns():
    with pytest.raises(transform.SchemaError, match="Colonnes disponibles"):
        transform.normalize([{"id": 1}], snapshot_ts=NOW)
    with pytest.raises(transform.SchemaError, match="Colonne `id` absente"):
        transform.normalize([{"foo": 1}], snapshot_ts=NOW)


def test_load_is_idempotent(tables, tmp_path):
    _, events = tables
    first = load.upsert_events(events, tmp_path)
    second = load.upsert_events(events, tmp_path)
    assert first == 12
    assert second == 0
    assert len(load.read_events(tmp_path)) == 12


def test_load_keeps_original_first_seen(tables, tmp_path):
    _, events = tables
    load.upsert_events(events, tmp_path)
    later = events.copy()
    later["first_seen_at"] = NOW + pd.Timedelta(hours=6)
    load.upsert_events(later, tmp_path)
    stored = load.read_events(tmp_path)
    assert (stored["first_seen_at"] == NOW).all()


def test_quality_ok(tables):
    _, events = tables
    assert quality.check_events(events, now=NOW) == []


def test_quality_detects_bad_price(tables):
    _, events = tables
    events = events.copy()
    events.loc[0, "price"] = 18.9  # virgule décalée
    issues = quality.check_events(events, now=NOW)
    assert quality.has_errors(issues)
    assert any(i.check == "price_range" for i in issues)


def test_quality_detects_frozen_feed(tables):
    _, events = tables
    issues = quality.check_events(events, now=NOW + pd.Timedelta(days=10))
    assert any(i.check == "freshness" for i in issues)


def test_quality_detects_row_drop(tables):
    _, events = tables
    issues = quality.check_events(events, now=NOW, previous_row_count=100)
    assert any(i.check == "row_drop" for i in issues)


def test_quality_tolerates_a_few_bad_prices_but_not_many(tables):
    _, events = tables
    many = pd.concat([events] * 60, ignore_index=True)  # 1 prix faux sur plusieurs centaines : avertissement seulement
    many.loc[0, "price"] = 0.019
    issues = quality.check_events(many, now=NOW)
    assert not quality.has_errors(issues)
    assert any(i.check == "price_range" and i.level == "warning" for i in issues)
    assert int(quality.out_of_range_mask(many).sum()) == 1


def test_ruptures_are_read_per_fuel_and_exported():
    from carburants import export

    records = extract.read_records(FIXTURE)
    records[0]["gazole_rupture_type"] = "temporaire"
    records[0]["gazole_rupture_debut"] = "2026-10-24T08:00:00+00:00"
    records[0]["sp98_rupture_type"] = "definitive"
    records[0]["sp98_rupture_debut"] = None
    for r in records[1:]:
        r["gazole_rupture_type"] = None
        r["gazole_rupture_debut"] = None
    stations, events = transform.normalize(records, snapshot_ts=NOW)
    first = stations[stations["station_id"] == str(records[0]["id"])].iloc[0]
    assert first["ruptures"] == "gazole:temporaire:2026-10-24T08:00:00Z;sp98:definitive:"
    assert stations["ruptures"].notna().sum() == 1
    assert export.parse_ruptures(first["ruptures"]) == {"gazole": ["temporaire", "2026-10-24T08:00:00Z"], "sp98": ["definitive", None]}
    payload = export.build_payload(events, stations, now=NOW, collected_at="2026-10-25T06:30:00+00:00")
    assert payload["collected_at"] == "2026-10-25T06:30:00Z"
    item = next(s for s in payload["stations"] if s["id"] == str(records[0]["id"]))
    assert item["rupt"]["gazole"] == ["temporaire", "2026-10-24T08:00:00Z"]


def test_stations_file_is_stable_and_status_is_separate(tables, tmp_path):
    stations, _ = tables
    stations = stations.assign(indisponibles="E85")
    load.write_stations(stations, tmp_path)
    path = tmp_path / "stations.parquet"
    before = path.read_bytes()
    # Relevé suivant : ordre différent, disponibilité différente, une station absente du flux.
    again = stations.iloc[::-1].iloc[:-1].assign(indisponibles="E85, GPLc")
    load.write_stations(again, tmp_path)
    assert path.read_bytes() == before  # la dimension n'a pas bougé : aucune nouvelle version dans git
    assert "indisponibles" not in pd.read_parquet(path).columns
    merged = load.read_stations(tmp_path)
    assert len(merged) == len(stations)  # la station absente du flux est gardée
    assert (merged["indisponibles"].dropna() == "E85, GPLc").all()


def test_real_feed_department_column_is_used():
    records = extract.read_records(FIXTURE)
    for r in records:
        r["code_departement"] = r.pop("dep_code")
    stations, _ = transform.normalize(records, snapshot_ts=NOW, departments=["34"])
    assert set(stations["dep_code"]) == {"34"}
