"""Ligne de commande : python -m carburants run | stats"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import pandas as pd

from . import analysis, config, export, extract, load, quality, transform


def run(from_file: Path | None, data_dir: Path) -> int:
    now = pd.Timestamp.now(tz="UTC")
    records = extract.read_records(from_file) if from_file else extract.fetch_records()
    print(f"[extract] {len(records)} stations reçues")
    print(f"[extract] colonnes du flux : {sorted(records[0])}")

    stations, events = transform.normalize(
        records, snapshot_ts=now, departments=config.DEPARTMENTS
    )
    print(f"[transform] {len(stations)} stations, {len(events)} prix")

    state_path = Path(data_dir) / "_last_run.json"
    previous = None
    if state_path.exists():
        previous = json.loads(state_path.read_text()).get("row_count")

    issues = quality.check_events(events, now=now, previous_row_count=previous)
    for i in issues:
        print(f"[quality:{i.level}] {i.check}: {i.message}")
    if quality.has_errors(issues):
        print("[quality] erreurs bloquantes : rien n'est écrit.")
        return 1

    new_rows = load.upsert_events(events, data_dir)
    load.write_stations(stations, data_dir)
    state_path.write_text(json.dumps({"row_count": len(events), "at": now.isoformat()}))
    print(f"[load] {new_rows} nouveaux événements de prix")
    return 0


def stats(data_dir: Path) -> int:
    events = load.read_events(data_dir)
    if events.empty:
        print("Aucune donnée pour l'instant.")
        return 0
    print(f"{len(events)} événements, du {events['price_updated_at'].min()} "
          f"au {events['price_updated_at'].max()}")
    print(events.groupby("fuel")["price"].agg(["count", "mean", "min", "max"]).round(3))
    return 0


def export_cmd(data_dir: Path, out: Path) -> int:
    events, stations = analysis.load_tables(data_dir)
    if events.empty or stations.empty:
        print("Aucune donnée à exporter.")
        return 1
    payload = export.build_payload(events, stations, now=pd.Timestamp.now(tz="UTC"))
    path = export.write_payload(payload, out)
    print(f"[export] {len(payload['stations'])} stations -> {path} ({path.stat().st_size // 1024} Ko)")
    return 0


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(prog="carburants")
    sub = p.add_subparsers(dest="cmd", required=True)
    r = sub.add_parser("run", help="Télécharge, contrôle et stocke un snapshot")
    r.add_argument("--from-file", type=Path, help="JSON local au lieu de l'API (tests)")
    r.add_argument("--data-dir", type=Path, default=config.DATA_DIR)
    s = sub.add_parser("stats", help="Résumé de l'historique stocké")
    s.add_argument("--data-dir", type=Path, default=config.DATA_DIR)
    e = sub.add_parser("export", help="Écrit latest.json pour le site mobile")
    e.add_argument("--data-dir", type=Path, default=config.DATA_DIR)
    e.add_argument("--out", type=Path, default=Path("web/data/latest.json"))
    args = p.parse_args(argv)
    if args.cmd == "run":
        return run(args.from_file, args.data_dir)
    if args.cmd == "export":
        return export_cmd(args.data_dir, args.out)
    return stats(args.data_dir)


if __name__ == "__main__":
    sys.exit(main())
