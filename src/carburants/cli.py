"""Ligne de commande : python -m carburants run | osm | export | stats"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import pandas as pd

from . import analysis, config, export, extract, geo, history, load, osm, quality, transform


def run(from_file: Path | None, data_dir: Path) -> int:
    now = pd.Timestamp.now(tz="UTC")
    records = extract.read_records(from_file) if from_file else extract.fetch_records()
    print(f"[extract] {len(records)} stations reçues")
    if not records:
        print("[extract] flux vide : rien n'est écrit.")
        return 1
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
    bad = quality.out_of_range_mask(events)
    if bad.any():  # quelques prix invraisemblables (faute de saisie d'une station) : écartés, le reste est gardé
        print(f"[quality] {int(bad.sum())} prix hors bornes écartés : {events[bad].head(5).to_dict('records')}")
        events = events[~bad].reset_index(drop=True)

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
    """Écrit dans `out` (dossier) : dept/<code>.json, grid.json, index.json, hist/<code>.json et history.json (national)."""
    out = Path(out)
    if out.suffix == ".json":  # ancien usage : --out web/data/latest.json
        out = out.parent
    events, stations = analysis.load_tables(data_dir)
    if events.empty or stations.empty:
        print("Aucune donnée à exporter.")
        return 1
    now = pd.Timestamp.now(tz="UTC")
    cache = osm.read_cache(Path(data_dir) / "osm_fuel.json")
    last_run = Path(data_dir) / "_last_run.json"
    collected_at = json.loads(last_run.read_text()).get("at") if last_run.exists() else None
    payload = export.build_payload(
        events, stations, now=now, osm_stations=(cache or {}).get("stations"), collected_at=collected_at
    )
    snapped = sum(1 for s in payload["stations"] if s.get("snap"))
    print(f"[export] {snapped}/{len(payload['stations'])} stations placées via OpenStreetMap")
    manifest = export.write_departments(payload, out)
    big = max(manifest["departments"].items(), key=lambda kv: kv[1]["kb"])
    print(f"[export] {len(manifest['departments'])} départements, {manifest['stations']} stations ; plus gros fichier : {big[0]} ({big[1]['kb']} Ko)")
    # Historique + prévision : par département (courbe de l'appli) et national (page « En coulisses »).
    dep_of = {str(r.station_id): geo.dep_of(getattr(r, "dep_code", None), getattr(r, "cp", None)) for r in stations.itertuples()}
    events = events.assign(_dep=events["station_id"].astype(str).map(dep_of))
    for dep, grp in events.groupby("_dep"):
        h = history.build_history(grp.drop(columns="_dep"), now=now)
        export.write_payload(h, out / "hist" / f"{dep}.json")
    hist = history.build_history(events.drop(columns="_dep"), now=now)
    hist["osm_snapped"] = snapped
    hist["exported_stations"] = len(payload["stations"])
    if last_run.exists():
        hist["last_run"] = json.loads(last_run.read_text())
    hpath = export.write_payload(hist, out / "history.json")
    print(f"[export] historique national + {events['_dep'].nunique()} départements -> {hpath.parent}")
    return 0


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(prog="carburants")
    sub = p.add_subparsers(dest="cmd", required=True)
    r = sub.add_parser("run", help="Télécharge, contrôle et stocke un snapshot")
    r.add_argument("--from-file", type=Path, help="JSON local au lieu de l'API (tests)")
    r.add_argument("--data-dir", type=Path, default=config.DATA_DIR)
    s = sub.add_parser("stats", help="Résumé de l'historique stocké")
    s.add_argument("--data-dir", type=Path, default=config.DATA_DIR)
    e = sub.add_parser("export", help="Écrit les fichiers du site : un par département, grille, index, historique")
    e.add_argument("--data-dir", type=Path, default=config.DATA_DIR)
    e.add_argument("--out", type=Path, default=Path("web/data"), help="dossier de sortie")
    o = sub.add_parser("osm", help="Met à jour les positions OpenStreetMap (au plus une fois par semaine)")
    o.add_argument("--data-dir", type=Path, default=config.DATA_DIR)
    o.add_argument("--force", action="store_true")
    args = p.parse_args(argv)
    if args.cmd == "osm":
        st = load.read_stations(args.data_dir)
        pts = [{"dep": geo.dep_of(getattr(r, "dep_code", None), r.cp), "lat": float(r.latitude), "lon": float(r.longitude)}
               for r in st.itertuples() if pd.notna(r.latitude) and pd.notna(r.longitude)]
        return osm.refresh(Path(args.data_dir) / "osm_fuel.json", pts, force=args.force)
    if args.cmd == "run":
        return run(args.from_file, args.data_dir)
    if args.cmd == "export":
        return export_cmd(args.data_dir, args.out)
    return stats(args.data_dir)


if __name__ == "__main__":
    sys.exit(main())
