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


def test_build_where():
    assert extract.build_where(["34", "30"]) == 'dep_code in ("34", "30")'
    assert extract.build_where([]) is None


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
