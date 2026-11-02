"""Géographie : code département d'une station, grille « position -> département », marge de frontière.

Le site ne charge que le département où se trouve l'utilisateur. Pour que les stations juste de l'autre
côté d'une frontière ne manquent pas, le fichier de chaque département embarque aussi les stations des
autres départements situées à moins de FRINGE_KM d'une de ses stations (la « marge »).
"""

from __future__ import annotations

import math

import pandas as pd

FRINGE_KM = 35.0
GRID_STEP = 0.1  # degrés (environ 11 km x 8 km)
GRID_MAX_KM = 15.0  # une case plus loin que ça de toute station n'appartient à aucun département


def dep_of(dep_code, cp) -> str | None:
    """Code département : celui du flux s'il existe, sinon déduit du code postal (Corse comprise)."""
    code = None if dep_code is None or (isinstance(dep_code, float) and pd.isna(dep_code)) else str(dep_code).strip().upper()
    if code and code not in {"NAN", "NONE"}:
        return code.zfill(2) if code.isdigit() and len(code) < 3 else code
    cp = None if cp is None or (isinstance(cp, float) and pd.isna(cp)) else str(cp).strip().zfill(5)
    if not cp or not cp.isdigit():
        return None
    if cp.startswith("20"):
        return "2A" if int(cp[:3]) <= 201 else "2B"
    return cp[:3] if cp.startswith("97") else cp[:2]


def _hav(lat1, lon1, lat2, lon2) -> float:
    p = math.pi / 180
    a = math.sin((lat2 - lat1) * p / 2) ** 2 + math.cos(lat1 * p) * math.cos(lat2 * p) * math.sin((lon2 - lon1) * p / 2) ** 2
    return 2 * 6371.0088 * math.asin(math.sqrt(a))


def _buckets(points: list[tuple[str, float, float, str]], size: float) -> dict:
    out: dict = {}
    for p in points:
        out.setdefault((math.floor(p[1] / size), math.floor(p[2] / size)), []).append(p)
    return out


def fringe(points: list[tuple[str, float, float, str]], km: float = FRINGE_KM) -> dict[str, set[str]]:
    """points : (id, lat, lon, dep). Retourne {dep: ids des stations d'autres départements à moins de `km` d'une des siennes}."""
    size = 0.5  # degrés, plus large que la marge (35 km = 0,32° en latitude, 0,45° en longitude à 45°N)
    cells = _buckets(points, size)
    out: dict[str, set[str]] = {}
    for sid, lat, lon, dep in points:
        ci, cj = math.floor(lat / size), math.floor(lon / size)
        seen: set[str] = set()
        for di in (-1, 0, 1):
            for dj in (-1, 0, 1):
                for _, la, lo, d2 in cells.get((ci + di, cj + dj), ()):
                    if d2 == dep or d2 in seen:
                        continue
                    if _hav(lat, lon, la, lo) <= km:
                        seen.add(d2)
        for d2 in seen:
            out.setdefault(d2, set()).add(sid)
    return out


def build_grid(points: list[tuple[str, float, float, str]], step: float = GRID_STEP, max_km: float = GRID_MAX_KM) -> dict:
    """Grille compacte : une lettre par case = département de la station la plus proche (« . » : hors couverture)."""
    deps = sorted({p[3] for p in points})
    pts = [(p[1], p[2], p[3]) for p in points]
    lats = [p[0] for p in pts]
    lons = [p[1] for p in pts]
    lat0 = math.floor(min(lats) / step) * step
    lon0 = math.floor(min(lons) / step) * step
    rows_n = int((max(lats) - lat0) / step) + 2
    cols_n = int((max(lons) - lon0) / step) + 2
    size = 0.3
    cells: dict = {}
    for la, lo, d in pts:
        cells.setdefault((math.floor(la / size), math.floor(lo / size)), []).append((la, lo, d))
    index = {d: chr(0x100 + i) for i, d in enumerate(deps)}  # un caractère par département (il y en a une centaine)
    rows = []
    for r in range(rows_n):
        la = lat0 + (r + 0.5) * step
        line = []
        for c in range(cols_n):
            lo = lon0 + (c + 0.5) * step
            ci, cj = math.floor(la / size), math.floor(lo / size)
            best, best_d = None, max_km
            for di in (-1, 0, 1):
                for dj in (-1, 0, 1):
                    for pla, plo, d in cells.get((ci + di, cj + dj), ()):
                        km = _hav(la, lo, pla, plo)
                        if km < best_d:
                            best, best_d = d, km
            line.append(index[best] if best else ".")
        rows.append("".join(line))
    return {"lat0": round(lat0, 4), "lon0": round(lon0, 4), "step": step, "deps": {v: k for k, v in index.items()}, "rows": rows}
