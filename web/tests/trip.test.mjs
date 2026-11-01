import { test } from "node:test";
import assert from "node:assert/strict";
import { prepareRoute, locateOnRoute, stationsAlongRoute, coveredUntilKm } from "../trip.js";

const NOW = new Date("2026-11-01T08:00:00Z");
const P = (p) => [p, "2026-11-01T06:00:00Z"];
// Montpellier -> nord, ligne droite de ~33 km le long du méridien 3,88
const coords = [[3.88, 43.61], [3.88, 43.75], [3.88, 43.91]];
const route = prepareRoute(coords);

test("longueur et position sur l'itinéraire", () => {
  assert.ok(route.length > 32 && route.length < 35, `longueur ${route.length}`);
  const { off, at } = locateOnRoute(route, 43.75, 3.89); // ~0,8 km à l'est, au km ~15,6
  assert.ok(off > 0.7 && off < 0.9, `écart ${off}`);
  assert.ok(at > 15 && at < 16.5, `km ${at}`);
});

test("couloir, coût du détour, autonomie", () => {
  const stations = [
    { id: "on", lat: 43.70, lon: 3.8805, prices: { sp95: P(2.10) } },
    { id: "off-cheap", lat: 43.80, lon: 3.905, prices: { sp95: P(2.00) } }, // ~2 km à l'écart
    { id: "far", lat: 43.80, lon: 4.0, prices: { sp95: P(1.50) } }, // hors couloir
    { id: "old", lat: 43.70, lon: 3.88, prices: { sp95: [1.0, "2026-09-01T06:00:00Z"] } },
    { id: "late", lat: 43.90, lon: 3.88, prices: { sp95: P(1.90) } },
  ];
  const r = stationsAlongRoute(stations, "sp95", route, { corridorKm: 3, litres: 14, conso: 5, now: NOW });
  const ids = r.map((x) => x.station.id);
  assert.deepEqual(ids.sort(), ["late", "off-cheap", "on"]);
  const off = r.find((x) => x.station.id === "off-cheap");
  assert.ok(off.detourKm > 5 && off.detourKm < 6, `détour ${off.detourKm}`);
  assert.ok(Math.abs(off.total - (2.0 * 14 + (off.detourKm * 5) / 100 * 2.0)) < 1e-9);
  const limited = stationsAlongRoute(stations, "sp95", route, { corridorKm: 3, rangeKm: 30, now: NOW });
  assert.equal(limited.find((x) => x.station.id === "late").unreachable, true);
  assert.equal(limited.at(-1).station.id, "late", "hors autonomie : en dernier");
});

test("zone couverte par les prix : jusqu'à la dernière station proche", () => {
  const st = [{ lat: 43.61, lon: 3.88 }, { lat: 43.75, lon: 3.88 }];
  const until = coveredUntilKm(coords, route, st, 5);
  assert.ok(until > 15 && until < 21, `km ${until}`); // dernier point à moins de 5 km : vers 43,75-43,79
  assert.equal(coveredUntilKm(coords, route, [...st, { lat: 43.91, lon: 3.88 }], 5), route.length);
});
