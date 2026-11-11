import { test } from "node:test";
import assert from "node:assert/strict";
import { haversineKm, rankStations } from "../rank.js";

const NOW = new Date("2026-10-25T08:00:00Z");
const COMEDIE = { lat: 43.6084, lon: 3.8796 };
const stations = [
  { id: "near", lat: 43.61, lon: 3.88, prices: { e10: [2.1, "2026-10-25T06:00:00Z"] } },
  { id: "cheap-far", lat: 43.75, lon: 3.88, prices: { e10: [1.95, "2026-10-25T06:00:00Z"] } },
  { id: "old", lat: 43.61, lon: 3.881, prices: { e10: [1.5, "2026-09-01T06:00:00Z"] } },
  { id: "no-e10", lat: 43.61, lon: 3.88, prices: { sp98: [2.2, "2026-10-25T06:00:00Z"] } },
];

test("haversine Montpellier -> Nîmes ~ 45-50 km", () => {
  const d = haversineKm(COMEDIE, { lat: 43.8367, lon: 4.3601 });
  assert.ok(d > 44 && d < 50, `distance ${d}`);
});

test("filtre carburant, ancienneté et rayon", () => {
  const r = rankStations(stations, "e10", COMEDIE, { litres: 14, conso: 4.5, radiusKm: 40, now: NOW });
  assert.deepEqual(r.map((x) => x.station.id).sort(), ["cheap-far", "near"]);
  const small = rankStations(stations, "e10", COMEDIE, { litres: 14, conso: 4.5, radiusKm: 5, now: NOW });
  assert.deepEqual(small.map((x) => x.station.id), ["near"]);
});

test("une station moins chère mais loin peut perdre", () => {
  // Petit plein + grosse conso : le détour coûte plus que l'écart de prix.
  const r = rankStations(stations, "e10", COMEDIE, { litres: 5, conso: 15, radiusKm: 40, now: NOW });
  assert.equal(r[0].station.id, "near");
  // Gros plein + faible conso : la moins chère gagne.
  const r2 = rankStations(stations, "e10", COMEDIE, { litres: 60, conso: 3, radiusKm: 40, now: NOW });
  assert.equal(r2[0].station.id, "cheap-far");
  assert.ok(r2[0].gain > 0);
});

test("le calcul correspond à la formule Python (plein + aller-retour)", () => {
  const [r] = rankStations([stations[0]], "e10", COMEDIE, { litres: 12, conso: 5, radiusKm: 40, now: NOW });
  const expected = 2.1 * 12 + ((2 * r.distanceKm * 5) / 100) * 2.1;
  assert.ok(Math.abs(r.total - expected) < 1e-9);
  assert.equal(r.isNearest, true);
});

import { bearingDeg, isOutOfStock } from "../rank.js";

test("cap : nord, est, sud, ouest", () => {
  const o = { lat: 43.6, lon: 3.88 };
  assert.ok(Math.abs(bearingDeg(o, { lat: 43.7, lon: 3.88 }) - 0) < 0.5);
  assert.ok(Math.abs(bearingDeg(o, { lat: 43.6, lon: 4.0 }) - 90) < 0.5);
  assert.ok(Math.abs(bearingDeg(o, { lat: 43.5, lon: 3.88 }) - 180) < 0.5);
  assert.ok(Math.abs(bearingDeg(o, { lat: 43.6, lon: 3.7 }) - 270) < 0.5);
});

test("rupture : reconnaît les noms du flux, sans faux positif", () => {
  const s = { indisponibles: "E85, GPLc, SP95" };
  assert.equal(isOutOfStock(s, "gplc"), true);
  assert.equal(isOutOfStock(s, "sp95"), true);
  assert.equal(isOutOfStock(s, "e10"), false);
  assert.equal(isOutOfStock({}, "e10"), false);
});

test("un prix de plus de 48 h ne passe pas devant un prix récent", () => {
  const now = new Date("2026-11-01T12:00:00Z");
  const mk = (id, price, hoursAgo, lat) => ({ id, lat, lon: 3.88, prices: { e10: [price, new Date(now - hoursAgo * 3600000).toISOString()] } });
  const out = rankStations([mk("vieux", 1.5, 100, 43.61), mk("frais", 1.8, 2, 43.62)], "e10", { lat: 43.6, lon: 3.88 }, { litres: 10, conso: 5, radiusKm: 30, now });
  assert.deepEqual(out.map((r) => r.station.id), ["frais", "vieux"]);
  assert.equal(out[1].stale, true);
});

test("l'autonomie écarte les stations trop loin et les classe en dernier", () => {
  const now = new Date("2026-11-01T12:00:00Z");
  const iso = now.toISOString();
  const near = { id: "proche", lat: 43.62, lon: 3.88, prices: { e10: [1.9, iso] } };
  const far = { id: "loin", lat: 43.75, lon: 3.88, prices: { e10: [1.5, iso] } }; // ~19 km à vol d'oiseau x 1,3
  const out = rankStations([far, near], "e10", { lat: 43.6, lon: 3.88 }, { litres: 10, conso: 5, radiusKm: 40, now, rangeKm: 15 });
  assert.deepEqual(out.map((r) => [r.station.id, r.unreachable]), [["proche", false], ["loin", true]]);
});

test("rupture déclarée dans le flux : écarte le carburant et donne le type et le début", async () => {
  const { isOutOfStock, ruptureOf } = await import("../rank.js");
  const s = { prices: { gazole: [2.1, "2026-11-10T08:00:00Z"] }, rupt: { gazole: ["temporaire", "2026-11-09T06:00:00Z"], sp98: ["definitive", null] } };
  assert.equal(isOutOfStock(s, "gazole"), true);
  assert.equal(isOutOfStock(s, "e10"), false);
  assert.equal(ruptureOf(s, "gazole").type, "temporaire");
  assert.equal(ruptureOf(s, "gazole").since.toISOString(), "2026-11-09T06:00:00.000Z");
  assert.equal(ruptureOf(s, "sp98").since, null);
  assert.equal(ruptureOf(s, "e10"), null);
});
