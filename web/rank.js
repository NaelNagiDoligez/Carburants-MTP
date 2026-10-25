// Classement des stations par coût total d'un plein, détour compris.
// Même formule que src/carburants/analysis.py (rank_stations), pour que le site et l'analyse concordent.

export const ROAD_FACTOR = 1.3;
const EARTH_RADIUS_KM = 6371.0088;

export function haversineKm(a, b) {
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

/**
 * @param {Array} stations  entrées de latest.json
 * @param {string} fuel     ex. "e10"
 * @param {{lat:number, lon:number}} origin
 * @param {{litres:number, conso:number, radiusKm:number, now?:Date, maxAgeDays?:number}} opts
 * @returns {Array} triées par total croissant, avec `gain` = économie vs la station la plus proche
 */
export function rankStations(stations, fuel, origin, opts) {
  const { litres, conso, radiusKm, now = new Date(), maxAgeDays = 14 } = opts;
  const maxAgeMs = maxAgeDays * 86400000;
  const out = [];
  for (const s of stations) {
    const entry = s.prices && s.prices[fuel];
    if (!entry) continue;
    const [price, updated] = entry;
    const updatedAt = new Date(updated);
    if (now - updatedAt > maxAgeMs) continue;
    const distanceKm = haversineKm(origin, s) * ROAD_FACTOR;
    if (distanceKm > radiusKm) continue;
    const plein = price * litres;
    const detour = ((2 * distanceKm * conso) / 100) * price;
    out.push({ station: s, price, updatedAt, distanceKm, plein, detour, total: plein + detour });
  }
  out.sort((a, b) => a.total - b.total || a.distanceKm - b.distanceKm);
  if (out.length) {
    const nearest = out.reduce((m, r) => (r.distanceKm < m.distanceKm ? r : m), out[0]);
    for (const r of out) {
      r.gain = nearest.total - r.total;
      r.isNearest = r === nearest;
    }
  }
  return out;
}

/** Cap (azimut) en degrés de a vers b, 0 = nord, sens horaire. */
export function bearingDeg(a, b) {
  const rad = (d) => (d * Math.PI) / 180;
  const y = Math.sin(rad(b.lon - a.lon)) * Math.cos(rad(b.lat));
  const x =
    Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) -
    Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(rad(b.lon - a.lon));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

const OUTAGE_NAMES = {
  e10: ["e10", "sp95-e10"],
  sp95: ["sp95"],
  sp98: ["sp98"],
  gazole: ["gazole", "gasoil"],
  e85: ["e85"],
  gplc: ["gplc", "gpl"],
};

/** Vrai si le flux signale ce carburant indisponible dans cette station. */
export function isOutOfStock(station, fuel) {
  if (!station.indisponibles) return false;
  const listed = String(station.indisponibles)
    .toLowerCase()
    .split(/[,;|]/)
    .map((s) => s.trim());
  return (OUTAGE_NAMES[fuel] || [fuel]).some((n) => listed.includes(n));
}
