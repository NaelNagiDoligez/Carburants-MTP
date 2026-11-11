"""Positions et noms des stations, depuis OpenStreetMap (© contributeurs OpenStreetMap, licence ODbL).

Le flux officiel donne une adresse et des coordonnées approximatives (souvent le milieu de la route).
OpenStreetMap connaît la station elle-même : on rapproche chaque station du flux de la station OSM
la plus proche (400 m maximum, une station OSM ne sert qu'une fois), ce qui donne la vraie position
et, à moins de 150 m, l'enseigne. Si OSM est injoignable, rien ne casse : le site garde les coordonnées du flux.
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
MAX_SNAP_M = 400.0
NAME_MAX_M = 150.0  # au-delà, on reprend la position mais pas l'enseigne : ce peut être la station d'en face
REFRESH_DAYS = 7
MAX_REGIONS_PER_RUN = 12  # départements interrogés par passage : la France entière se remplit en quelques passages
PAUSE_S = 4.0
BBOX_MARGIN = 0.05  # degrés autour des stations d'un département


def _query(bbox: tuple[float, float, float, float]) -> str:
    s, w, n, e = bbox
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


def fetch(bbox: tuple[float, float, float, float], session: requests.Session | None = None) -> list[dict]:
    http = session or requests.Session()
    last_error: Exception | None = None
    for url in OVERPASS_URLS:
        try:
            res = http.post(url, data={"data": _query(bbox)}, timeout=120, headers={"User-Agent": "carburants-mtp (projet perso, GitHub Actions)"})
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
    cell = 0.02  # degrés, plus large que max_m : on ne compare qu'aux voisines
    grid: dict[tuple[int, int], list[dict]] = {}
    for o in osm:
        grid.setdefault((math.floor(o["lat"] / cell), math.floor(o["lon"] / cell)), []).append(o)
    for s in stations:
        ci, cj = math.floor(s["lat"] / cell), math.floor(s["lon"] / cell)
        for di in (-1, 0, 1):
            for dj in (-1, 0, 1):
                for o in grid.get((ci + di, cj + dj), ()):
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
        out[sid] = {"lat": o["lat"], "lon": o["lon"], "nom": display_name(o) if d <= NAME_MAX_M else None, "osm_id": oid, "dist_m": round(d)}
    return out


def read_cache(path: Path) -> dict | None:
    try:
        return json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None


def _regions(cache: dict | None) -> dict:
    """Cache par département : {dep: {"fetched_at", "stations"}}. Ancien format (un seul bloc) -> Hérault et Gard."""
    if not cache:
        return {}
    if "regions" in cache:
        return cache["regions"]
    if "stations" in cache and "fetched_at" in cache:
        return {dep: {"fetched_at": cache["fetched_at"], "stations": cache["stations"], "legacy": True} for dep in ("34", "30")}
    return {}


def is_stale(cache: dict | None, now: float | None = None, dep: str | None = None) -> bool:
    if dep is not None:
        entry = _regions(cache).get(dep)
        return not entry or ((now or time.time()) - entry["fetched_at"]) > REFRESH_DAYS * 86400
    if not cache or "fetched_at" not in cache:
        return True
    return ((now or time.time()) - cache["fetched_at"]) > REFRESH_DAYS * 86400


def bboxes(stations: list[dict]) -> dict[str, tuple[float, float, float, float]]:
    """stations : [{dep, lat, lon}] -> boîte (sud, ouest, nord, est) par département."""
    out: dict[str, list[float]] = {}
    for s in stations:
        if not s.get("dep"):
            continue
        b = out.setdefault(s["dep"], [s["lat"], s["lon"], s["lat"], s["lon"]])
        b[0], b[1] = min(b[0], s["lat"]), min(b[1], s["lon"])
        b[2], b[3] = max(b[2], s["lat"]), max(b[3], s["lon"])
    m = BBOX_MARGIN
    return {d: (round(b[0] - m, 3), round(b[1] - m, 3), round(b[2] + m, 3), round(b[3] + m, 3)) for d, b in out.items()}


def flatten(regions: dict) -> list[dict]:
    seen, out = set(), []
    for r in regions.values():
        for o in r["stations"]:
            if o["osm_id"] not in seen:
                seen.add(o["osm_id"])
                out.append(o)
    return out


def refresh(path: Path, stations: list[dict] | None = None, force: bool = False, max_regions: int = MAX_REGIONS_PER_RUN) -> int:
    """Met à jour le cache OSM, département par département (les plus anciens d'abord, `max_regions` par passage).

    Ne fait jamais échouer le workflow : un département injoignable est simplement retenté au passage suivant.
    """
    path = Path(path)
    cache = read_cache(path)
    regions = _regions(cache)
    boxes = bboxes(stations or [])
    todo = [d for d in boxes if force or is_stale(cache, dep=d)]
    todo.sort(key=lambda d: regions.get(d, {}).get("fetched_at", 0))
    if not todo:
        print("[osm] cache à jour, rien à faire.")
        return 0
    done = failed = 0
    for dep in todo[:max_regions]:
        try:
            found = fetch(boxes[dep])
        except RuntimeError as exc:
            failed += 1
            print(f"[osm] {dep} ignoré : {exc}")
            if failed >= 2:
                break
            continue
        if len(found) < 1:  # réponse vide : on garde l'ancien contenu
            print(f"[osm] {dep} : réponse vide, cache conservé.")
            continue
        regions[dep] = {"fetched_at": time.time(), "stations": found}
        done += 1
        time.sleep(PAUSE_S)
    if done:
        path.parent.mkdir(parents=True, exist_ok=True)
        payload = {"fetched_at": time.time(), "regions": regions, "stations": flatten(regions)}
        path.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"[osm] {done} département(s) mis à jour, {len(todo) - done} restant(s) à rafraîchir.")
    return 0
