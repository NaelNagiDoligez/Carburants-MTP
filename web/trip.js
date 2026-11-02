// Trajet : les stations le long d'un itinéraire, détour et coût compris. Fonctions pures (testées).
import { haversineKm, isOutOfStock } from "./rank.js";

const KM_PER_DEG_LAT = 111.32;
const DETOUR_FACTOR = 1.4; // aller-retour hors de la route : distance à vol d'oiseau x 2 x 1,4 (sorties, ronds-points)

/** Points [lon, lat] de l'itinéraire -> repère local en km, avec le kilomètre cumulé de chaque point. */
export function prepareRoute(coords) {
  const lat0 = coords.reduce((s, c) => s + c[1], 0) / coords.length;
  const kx = KM_PER_DEG_LAT * Math.cos((lat0 * Math.PI) / 180);
  const pts = coords.map(([lon, lat]) => ({ x: lon * kx, y: lat * KM_PER_DEG_LAT }));
  const cum = [0];
  for (let i = 1; i < coords.length; i++) cum.push(cum[i - 1] + haversineKm({ lat: coords[i - 1][1], lon: coords[i - 1][0] }, { lat: coords[i][1], lon: coords[i][0] }));
  const lons = coords.map((c) => c[0]), lats = coords.map((c) => c[1]);
  return { pts, cum, kx, length: cum[cum.length - 1], bbox: [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)] };
}

/** Distance d'un point à l'itinéraire (km) et kilomètre auquel on le croise. */
export function locateOnRoute(route, lat, lon) {
  const px = lon * route.kx, py = lat * KM_PER_DEG_LAT;
  let best = { off: Infinity, at: 0 };
  for (let i = 1; i < route.pts.length; i++) {
    const a = route.pts[i - 1], b = route.pts[i];
    const dx = b.x - a.x, dy = b.y - a.y, len2 = dx * dx + dy * dy;
    const t = len2 ? Math.max(0, Math.min(1, ((px - a.x) * dx + (py - a.y) * dy) / len2)) : 0;
    const off = Math.hypot(px - (a.x + t * dx), py - (a.y + t * dy));
    if (off < best.off) best = { off, at: route.cum[i - 1] + t * (route.cum[i] - route.cum[i - 1]) };
  }
  return best;
}

/**
 * Stations à moins de `corridorKm` de la route, classées par coût total (plein + détour).
 * rangeKm : autonomie restante ; les stations au-delà sont signalées et passent après.
 */
export function stationsAlongRoute(stations, fuel, route, { corridorKm = 2, litres = 14, conso = 5, rangeKm = null, now = new Date(), maxAgeDays = 14 } = {}) {
  const [w, s, e, n] = route.bbox;
  const pad = corridorKm / KM_PER_DEG_LAT + 0.01;
  const out = [];
  for (const st of stations) {
    const pr = st.prices?.[fuel];
    if (!pr || isOutOfStock(st, fuel)) continue;
    if (st.lat < s - pad || st.lat > n + pad || st.lon < w - pad * 1.5 || st.lon > e + pad * 1.5) continue;
    const { off, at } = locateOnRoute(route, st.lat, st.lon);
    if (off > corridorKm) continue;
    const [price, updated] = pr;
    if ((now - new Date(updated)) / 86400000 > maxAgeDays) continue;
    const detourKm = 2 * off * DETOUR_FACTOR;
    const detourEur = (detourKm * conso) / 100 * price;
    out.push({
      station: st, price, updatedAt: new Date(updated), offKm: off, atKm: at, detourKm,
      fillEur: price * litres, detourEur, total: price * litres + detourEur,
      unreachable: rangeKm != null && at + off > rangeKm * 0.9,
    });
  }
  out.sort((a, b) => a.unreachable - b.unreachable || a.total - b.total || a.atKm - b.atKm);
  return out;
}

/**
 * Jusqu'où l'itinéraire reste dans la zone couverte par les prix (les départements chargés) : kilomètre du dernier
 * point de la route qui a une station du jeu de données à moins de `gapKm`.
 */
export function coveredUntilKm(coords, route, stations, gapKm = 12) {
  const step = Math.max(1, Math.floor(coords.length / 150));
  let last = 0;
  for (let i = 0; i < coords.length; i += step) {
    const p = { lat: coords[i][1], lon: coords[i][0] };
    if (stations.some((st) => Math.abs(st.lat - p.lat) < 0.2 && haversineKm(p, st) <= gapKm)) last = route.cum[i];
  }
  const end = { lat: coords.at(-1)[1], lon: coords.at(-1)[0] };
  if (stations.some((st) => haversineKm(end, st) <= gapKm)) last = route.length;
  return last;
}

/** Réduit une liste de points à au plus `max` (pour le tracé). */
export function thin(coords, max = 400) {
  if (coords.length <= max) return coords;
  const step = (coords.length - 1) / (max - 1);
  return Array.from({ length: max }, (_, i) => coords[Math.round(i * step)]);
}
