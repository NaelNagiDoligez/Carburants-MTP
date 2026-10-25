import json
from pathlib import Path

import pandas as pd

from carburants import export, extract, transform

FIXTURE = Path(__file__).parent / "fixtures" / "sample.json"
NOW = pd.Timestamp("2026-10-25T08:00:00", tz="UTC")


def _payload(max_age_days=14.0):
    stations, events = transform.normalize(extract.read_records(FIXTURE), snapshot_ts=NOW)
    return export.build_payload(events, stations, now=NOW, max_age_days=max_age_days)


def test_payload_structure():
    p = _payload()
    assert p["version"] == 1
    assert p["generated_at"] == "2026-10-25T08:00:00Z"
    assert len(p["stations"]) == 3
    s = next(x for x in p["stations"] if x["id"] == "34000001")
    assert s["prices"]["sp95"] == [1.829, "2026-10-25T06:12:00Z"]
    assert -90 <= s["lat"] <= 90


def test_fuel_summary_and_age_filter():
    p = _payload(max_age_days=3)
    # Le GPLc du fixture date du 20/10 : exclu avec 3 jours max.
    assert "gplc" not in p["fuels"]
    assert p["fuels"]["sp95"] == {"label": "SP95", "stations": 3, "median": 1.799}


def test_write_payload_is_valid_json(tmp_path):
    path = export.write_payload(_payload(), tmp_path / "web" / "latest.json")
    assert json.loads(path.read_text(encoding="utf-8"))["stations"]


def test_optional_columns_exported_when_present():
    records = extract.read_records(FIXTURE)
    records[0]["horaires_automate_24_24"] = "Oui"
    records[0]["carburants_indisponibles"] = ["E85", "GPLc"]
    stations, events = transform.normalize(records, snapshot_ts=NOW)
    p = export.build_payload(events, stations, now=NOW)
    s = next(x for x in p["stations"] if x["id"] == "34000001")
    assert s["automate_24_24"] == "Oui"
    assert s["indisponibles"] == "E85, GPLc"
    other = next(x for x in p["stations"] if x["id"] == "34000002")
    assert "automate_24_24" not in other
