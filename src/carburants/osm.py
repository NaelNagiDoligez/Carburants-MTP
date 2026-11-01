"""Positions et noms des stations, depuis OpenStreetMap (© contributeurs OpenStreetMap, licence ODbL).

Le flux officiel donne une adresse et des coordonnées approximatives (souvent le milieu de la route).
OpenStreetMap connaît la station elle-même : on rapproche chaque station du flux de la station OSM
la plus proche (150 m maximum, une station OSM ne sert qu'une fois), ce qui donne la vraie position
et, souvent, l'enseigne. Si OSM est injoignable, rien ne casse : le site garde les coordonnées du flux.
"""

from __future__ import annotations

import json
import math
import time
from pathlib import Path

import requests

OVERPASS_URLS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
]
# Sud, ouest, nord, est : couvre l'Hérault et le Gard.
BBOX = (43.20, 2.85, 44.45, 4.95)
MAX_SNAP_M = 150.0
REFRESH_DAYS = 7


def _query() -> str:
    s, w, n, e = BBOX
    box = f"{s},{w},{n},{e}"
    return f'[out:json][timeout:90];(node["amenity"="fuel"]({box});way["amenity"="fuel"]({box}););out center tags;'


def parse_elements(payload: dict) -> list[dict]:
    """Réponse Overpass -> liste de stations {osm_id, lat, lon, name, brand}."""
    out = []
    for el in payload.get("elements", []):
        lat = el.get("lat", (el.get("center") or {}).get("lat"))
        lon = el.get("lon", (el.get("center") or {}).get("lon"))
        if lat is None or lon is None:
            continue
        tags = el.get("tags") or {}
        out.append({
            "osm_id": f"{el.get('type', 'node')}/{el.get('id')}",
            "lat": float(lat),
            "lon": float(lon),
            "name": (tags.get("name") or "").strip() or None,
            "brand": (tags.get("brand") or tags.get("operator") or "").strip() or None,
        })
    return out


def fetch(session: requests.Session | None = None) -> list[dict]:
    http = session or requests.Session()
    last_error: Exception | None = None
    for url in OVERPASS_URLS:
        try:
            res = http.post(url, data={"data": _query()}, timeout=120, headers={"User-Agent": "carburants-mtp (projet perso, GitHub Actions)"})
            res.raise_for_status()
            return parse_elements(res.json())
        except (requests.RequestException, ValueError) as exc:
            last_error = exc
    raise RuntimeError(f"Overpass injoignable : {last_error}")


def distance_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    rad = math.radians
    h = math.sin(rad(lat2 - lat1) / 2) ** 2 + math.cos(rad(lat1)) * math.cos(rad(lat2)) * math.sin(rad(lon2 - lon1) / 2) ** 2
    return 2 * 6371008.8 * math.asin(math.sqrt(h))


def display_name(osm: dict) -> str | None:
    """L'enseigne si on la connaît, sinon le nom OSM."""
    return osm.get("brand") or osm.get("name")


def snap(stations: list[dict], osm: list[dict], max_m: float = MAX_SNAP_M) -> dict[str, dict]:
    """Rapproche stations du flux et stations OSM : plus petites distances d'abord, chaque côté une seule fois.

    stations : [{id, lat, lon}] ; retourne {id: {lat, lon, nom, osm_id, dist_m}}.
    """
    pairs = []
    for s in stations:
        for o in osm:
            # prefiltre grossier (~0,002° = ~220 m) avant le calcul exact
            if abs(s["lat"] - o["lat"]) > 0.002 or abs(s["lon"] - o["lon"]) > 0.003:
                continue
            d = distance_m(s["lat"], s["lon"], o["lat"], o["lon"])
            if d <= max_m:
                pairs.append((d, s["id"], o["osm_id"]))
    pairs.sort()
    by_osm = {o["osm_id"]: o for o in osm}
    used_station: set[str] = set()
    used_osm: set[str] = set()
    out: dict[str, dict] = {}
    for d, sid, oid in pairs:
        if sid in used_station or oid in used_osm:
            continue
        used_station.add(sid)
        used_osm.add(oid)
        o = by_osm[oid]
        out[sid] = {"lat": o["lat"], "lon": o["lon"], "nom": display_name(o), "osm_id": oid, "dist_m": round(d)}
    return out


def read_cache(path: Path) -> dict | None:
    try:
        return json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None


def is_stale(cache: dict | None, now: float | None = None) -> bool:
    if not cache or "fetched_at" not in cache:
        return True
    return ((now or time.time()) - cache["fetched_at"]) > REFRESH_DAYS * 86400


def refresh(path: Path, force: bool = False) -> int:
    """Met à jour le cache OSM s'il a plus d'une semaine. Ne fait jamais échouer le workflow."""
    path = Path(path)
    if not force and not is_stale(read_cache(path)):
        print("[osm] cache à jour, rien à faire.")
        return 0
    try:
        stations = fetch()
    except RuntimeError as exc:
        print(f"[osm] ignoré : {exc}")
        return 0
    if len(stations) < 20:  # réponse suspecte : on garde l'ancien cache
        print(f"[osm] seulement {len(stations)} stations reçues : cache conservé.")
        return 0
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps({"fetched_at": time.time(), "stations": stations}, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"[osm] {len(stations)} stations OSM enregistrées -> {path}")
    return 0
