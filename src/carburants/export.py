"""Export : produit de données compact consommé par le site mobile (web/).

Format de latest.json (version 1) :
{
  "version": 1,
  "generated_at": "...Z",          # date de l'export
  "last_price_at": "...Z",         # prix le plus récent du jeu
  "max_age_days": 14,              # les prix plus anciens sont exclus
  "fuels": {"e10": {"label": "SP95-E10", "stations": 207, "median": 2.119}, ...},
  "stations": [
    {"id": "34000001", "ville": "...", "adresse": "...", "cp": "34070",
     "lat": 43.59, "lon": 3.84, "prices": {"e10": [1.99, "2026-10-25T06:12:00Z"], ...}}
  ]
}
"""

from __future__ import annotations

import json
from pathlib import Path

import pandas as pd

from . import analysis, config, geo
from . import osm as osm_mod

FUEL_LABELS = {
    "e10": "SP95-E10",
    "sp95": "SP95",
    "sp98": "SP98",
    "gazole": "Gazole",
    "e85": "E85",
    "gplc": "GPLc",
}


def _iso(ts: pd.Timestamp) -> str:
    return ts.tz_convert("UTC").strftime("%Y-%m-%dT%H:%M:%SZ")


def _clean(value):
    return None if pd.isna(value) else str(value).strip()


def build_payload(
    events: pd.DataFrame,
    stations: pd.DataFrame,
    now: pd.Timestamp,
    max_age_days: float = 14.0,
    osm_stations: list[dict] | None = None,
) -> dict:
    last = analysis.latest_prices(events)
    age = (now - last["price_updated_at"]).dt.total_seconds() / 86400
    last = last[age <= max_age_days]

    st = stations.dropna(subset=["latitude", "longitude"]).set_index("station_id")
    last = last[last["station_id"].isin(st.index)]

    snapped = {}
    if osm_stations:
        snapped = osm_mod.snap(
            [{"id": str(sid), "lat": float(st.loc[sid, "latitude"]), "lon": float(st.loc[sid, "longitude"])}
             for sid in last["station_id"].unique()],
            osm_stations,
        )

    out_stations = []
    for sid, group in last.groupby("station_id"):
        row = st.loc[sid]
        prices = {
            r.fuel: [round(float(r.price), 3), _iso(r.price_updated_at)]
            for r in group.itertuples()
        }
        item = {
            "id": str(sid),
            "ville": _clean(row["ville"]),
            "adresse": _clean(row["adresse"]),
            "cp": _clean(row["cp"]),
            "dep": geo.dep_of(row.get("dep_code"), row["cp"]),
            "lat": round(float(row["latitude"]), 5),
            "lon": round(float(row["longitude"]), 5),
            "prices": prices,
        }
        snap = snapped.get(str(sid))
        if snap:  # position réelle de la station (OSM) à la place du point du flux
            item["lat"], item["lon"] = round(snap["lat"], 5), round(snap["lon"], 5)
            item["snap"] = 1
            if snap["nom"]:
                item["nom"] = snap["nom"]
        for key in config.OPTIONAL_STATION_COLUMNS.values():
            if key in row.index and _clean(row[key]):
                item[key] = _clean(row[key])
        out_stations.append(item)

    fuels = {}
    for fuel, label in FUEL_LABELS.items():
        sub = last[last["fuel"] == fuel]
        if sub.empty:
            continue
        fuels[fuel] = {
            "label": label,
            "stations": int(sub["station_id"].nunique()),
            "median": round(float(sub["price"].median()), 3),
        }

    return {
        "version": 1,
        "generated_at": _iso(now),
        "last_price_at": _iso(last["price_updated_at"].max()) if len(last) else None,
        "max_age_days": max_age_days,
        "fuels": fuels,
        "stations": out_stations,
    }


def write_payload(payload: dict, out: Path) -> Path:
    out = Path(out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    return out


def fuels_summary(stations: list[dict]) -> dict:
    """Même résumé que build_payload, calculé sur une liste de stations (fichier d'un département)."""
    out = {}
    for fuel, label in FUEL_LABELS.items():
        prices = sorted(s["prices"][fuel][0] for s in stations if fuel in s["prices"])
        if not prices:
            continue
        mid = len(prices) // 2
        median = prices[mid] if len(prices) % 2 else (prices[mid - 1] + prices[mid]) / 2
        out[fuel] = {"label": label, "stations": len(prices), "median": round(median, 3)}
    return out


def write_departments(payload: dict, out_dir: Path) -> dict:
    """Un fichier par département (ses stations + la marge de frontière), la grille position -> département et un index."""
    out_dir = Path(out_dir)
    stations = [s for s in payload["stations"] if s.get("dep")]
    points = [(s["id"], s["lat"], s["lon"], s["dep"]) for s in stations]
    margin = geo.fringe(points)
    by_dep: dict[str, list[dict]] = {}
    for s in stations:
        by_dep.setdefault(s["dep"], []).append(s)
    by_id = {s["id"]: s for s in stations}
    index = {}
    for dep, own in by_dep.items():
        extra = [by_id[i] for i in sorted(margin.get(dep, ()))]
        part = own + extra
        doc = {
            "version": 2,
            "dep": dep,
            "generated_at": payload["generated_at"],
            "last_price_at": payload["last_price_at"],
            "max_age_days": payload["max_age_days"],
            "fuels": fuels_summary(part),
            "stations": part,
        }
        path = write_payload(doc, out_dir / "dept" / f"{dep}.json")
        index[dep] = {"stations": len(own), "with_margin": len(part), "kb": path.stat().st_size // 1024}
    write_payload(geo.build_grid(points), out_dir / "grid.json")
    manifest = {
        "version": 2,
        "generated_at": payload["generated_at"],
        "last_price_at": payload["last_price_at"],
        "stations": len(stations),
        "departments": index,
    }
    write_payload(manifest, out_dir / "index.json")
    return manifest
