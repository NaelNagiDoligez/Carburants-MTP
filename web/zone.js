// Zones : l'appli ne charge que le département où l'on se trouve (plus la marge de frontière déjà dans son fichier).
// Pour un trajet, on charge en plus les départements traversés. Tout vient de fichiers statiques :
//   data/grid.json            position -> département (grille de 0,1°, quelques Ko)
//   data/dept/<code>.json     stations et prix d'un département + stations à moins de 35 km de sa frontière
//   data/hist/<code>.json     historique et prévision du département
import { haversineKm } from "./rank.js";

let grid = null;
let gridPromise = null;
/** Stations déjà chargées, par identifiant : un même objet partout (carte, favoris, trajet, signalements d'amis). */
export const known = new Map();
const docs = new Map(); // dep -> { doc, at, offline }

export function loadGrid() {
  gridPromise ||= fetch("data/grid.json")
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
    .then((g) => (grid = g))
    .catch(() => { gridPromise = null; return null; });
  return gridPromise;
}

/** Département d'une position (la case la plus proche couverte, à 3 cases au plus), ou null. */
export function depAt(lat, lon) {
  if (!grid || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const r0 = Math.floor((lat - grid.lat0) / grid.step);
  const c0 = Math.floor((lon - grid.lon0) / grid.step);
  let best = null, bestD = Infinity;
  for (let ring = 0; ring <= 3 && !best; ring++) {
    for (let r = r0 - ring; r <= r0 + ring; r++) {
      for (let c = c0 - ring; c <= c0 + ring; c++) {
        if (ring && Math.abs(r - r0) !== ring && Math.abs(c - c0) !== ring) continue;
        const ch = grid.rows[r]?.[c];
        if (!ch || ch === ".") continue;
        const d = (r - r0) ** 2 + (c - c0) ** 2;
        if (d < bestD) { bestD = d; best = grid.deps[ch]; }
      }
    }
  }
  return best;
}

/** Fichier d'un département. fresh : toujours redemander au réseau ; sinon copie de moins de 10 min acceptée. */
export async function fetchDept(dep, { fresh = false } = {}) {
  const hit = docs.get(dep);
  if (hit && !fresh && Date.now() - hit.at < 600000) return hit;
  const res = await fetch(`data/dept/${encodeURIComponent(dep)}.json`, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const doc = await res.json();
  doc.stations = doc.stations.map((s) => { known.set(s.id, s); return s; });
  const entry = { doc, at: Date.now(), offline: res.headers.get("x-plein-sud-offline") === "1" };
  docs.set(dep, entry);
  return entry;
}

export async function fetchHistory(dep) {
  const res = await fetch(`data/hist/${encodeURIComponent(dep)}.json`, { cache: "no-store" });
  return res.ok ? res.json() : null;
}

/** Départements traversés par un tracé [[lon, lat], …] : un point tous les stepKm, 24 départements au plus. */
export function routeDeps(coords, stepKm = 12) {
  const out = [];
  let acc = stepKm; // on teste aussi le départ
  for (let i = 0; i < coords.length; i++) {
    if (i) acc += haversineKm({ lat: coords[i - 1][1], lon: coords[i - 1][0] }, { lat: coords[i][1], lon: coords[i][0] });
    if (acc >= stepKm || i === coords.length - 1) {
      acc = 0;
      const d = depAt(coords[i][1], coords[i][0]);
      if (d && !out.includes(d)) out.push(d);
    }
  }
  return out.slice(0, 24);
}

/** Stations des départements demandés, sans doublon (les marges se recoupent). */
export function pool(deps) {
  const seen = new Map();
  for (const d of deps) for (const s of docs.get(d)?.doc.stations ?? []) if (!seen.has(s.id)) seen.set(s.id, s);
  return [...seen.values()];
}
