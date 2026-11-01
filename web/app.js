import * as fr from "./friends.js";
import { rankStations, haversineKm, isOutOfStock, ROAD_FACTOR } from "./rank.js";
import { matchVehicle, catalogNames } from "./catalog.js";
import { prepareRoute, stationsAlongRoute, coveredUntilKm, thin } from "./trip.js";
import { trendSVG, trendWords, fmt3 } from "./chart.js";

// ---------- Constantes ----------
const PLACES = [
  { id: "comedie", label: "Place de la Comédie", short: "la Comédie", lat: 43.6084, lon: 3.8796 },
  { id: "saint-roch", label: "Gare Saint-Roch", short: "Saint-Roch", lat: 43.6032, lon: 3.8809 },
  { id: "odysseum", label: "Odysseum", short: "Odysseum", lat: 43.6046, lon: 3.9186 },
  { id: "triolet", label: "Campus Triolet", short: "Triolet", lat: 43.6318, lon: 3.8613 },
];
// Véhicules de départ : de simples véhicules comme les autres (modifiables, supprimables).
const SEEDS = [
  { id: "mt450", label: "CFMoto 450MT", short: "450MT", litres: 14, conso: 4.5 },
  { id: "scooter", label: "Scooter 125", short: "Scooter", litres: 6, conso: 2.8 },
  { id: "car", label: "Voiture", short: "Voiture", litres: 40, conso: 6.5 },
];
const NAV_APPS = [
  { id: "apple", label: "Plans", detail: "l'appli Plans de l'iPhone" },
  { id: "google", label: "Google Maps", detail: "appli ou site" },
  { id: "waze", label: "Waze", detail: "appli ou site" },
];
const FUEL_ORDER = ["sp95", "e10", "sp98", "gazole", "e85", "gplc"];
// Noms affichés : le flux dit « SP95 », on précise E5 pour la distinguer de l’E10.
const FUEL_NAMES = { sp95: "SP95-E5", e10: "SP95-E10" };
const STORE_KEY = "plein-sud:v3";
const ALTS = 2;
const ALL_MAX = 30;
const MAP_MAX = 15;
const STALE_HOURS = 48;
const DWELL_MS = 3 * 60 * 1000;   // 3 min sur place
const DWELL_IN_M = 50;            // à moins de 50 m d'une station
const DWELL_OUT_M = 90;           // au-delà de 90 m, on considère qu'on est reparti
const REORIGIN_M = 300;           // on ne reclasse qu'après 300 m de déplacement
const DEFAULTS = {
  fuel: "sp95", placeId: "gps", gps: null, profileId: "mt450", vehicles: SEEDS, seeded: true,
  radius: 15, favs: [], log: [], nav: null, fillSeen: {}, theme: "auto", trips: [], tripCorr: 2,
};
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");
const isDark = () => document.documentElement.dataset.theme === "dark";
const EASE_OUT = "cubic-bezier(0.23, 1, 0.32, 1)";
const EASE_IN_OUT = "cubic-bezier(0.77, 0, 0.175, 1)";

// ---------- État ----------
let state = loadState();
let data = null;
let ranked = [];
let view = "rank";
let firstRender = true;
let lastLeadKey = "";
let locating = false;
let showAll = false;
let watchId = null;
let gpsStale = false; // vrai si la position utilisée est l'ancienne, faute de GPS
let vehEditing = null; // null = formulaire fermé, "new" = ajout, sinon l'id édité
let dwell = null;

const litresText = (n) => commaNum(Number(n), Number(n) % 1 ? 1 : 0);
function newVehicleId() { return "v" + Date.now().toString(36); }

function loadState() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE_KEY) || "null") || JSON.parse(localStorage.getItem("plein-sud:v2") || "null");
    if (!raw) return structuredClone(DEFAULTS);
    const merged = { ...structuredClone(DEFAULTS), ...raw };
    // État abîmé (édition à la main, ancienne version) : chaque champ retrouve un type sûr.
    for (const k of ["favs", "log", "trips"]) if (!Array.isArray(merged[k])) merged[k] = [];
    merged.trips = merged.trips.filter((t) => t && Number.isFinite(t.lat) && Number.isFinite(t.lon) && t.label);
    if (!merged.fillSeen || typeof merged.fillSeen !== "object") merged.fillSeen = {};
    if (!Number.isFinite(Number(merged.radius))) merged.radius = DEFAULTS.radius;
    if (merged.gps && !(Number.isFinite(merged.gps.lat) && Number.isFinite(merged.gps.lon))) merged.gps = null;
    if (!Array.isArray(merged.vehicles)) merged.vehicles = [];
    merged.vehicles = merged.vehicles.filter((v) => v && typeof v === "object" && v.id && Number(v.litres) > 0);
    merged.log = merged.log.filter((e) => e && typeof e === "object" && e.id && Number.isFinite(e.gain));
    if (merged.profileId === "custom") { // ancien profil « Personnalisé » -> un vrai véhicule
      const c = raw.custom || {};
      const id = newVehicleId();
      merged.vehicles.push({ id, label: "Mon véhicule", litres: Number(c.litres) || 14, conso: Number(c.conso) || 4.5 });
      merged.profileId = id;
    }
    delete merged.custom;
    if (!raw.seeded) { // les véhicules de départ deviennent les tiens, une seule fois
      const have = new Set(merged.vehicles.map((v) => v.id));
      merged.vehicles = [...structuredClone(SEEDS).filter((v) => !have.has(v.id)), ...merged.vehicles];
      merged.seeded = true;
    }
    if (!merged.vehicles.length) merged.vehicles = structuredClone(SEEDS);
    return merged;
  } catch {
    return structuredClone(DEFAULTS);
  }
}
function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch { /* stockage indisponible */ }
}

// ---------- Formats ----------
const eur = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });
const dec1 = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1, minimumFractionDigits: 1 });
const dateFmt = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" });
const timeFmt = new Intl.DateTimeFormat("fr-FR", { hour: "numeric", minute: "2-digit" });
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const titleCase = (s) => String(s ?? "").toLowerCase()
  .replace(/(^|[\s'’-])(\p{L})/gu, (m, a, b) => a + b.toUpperCase())
  .replace(/(?<=[\s-])(De|Du|Des|La|Le|Les|Sur|En|Et|Lès)(?=[\s-])/g, (w) => w.toLowerCase());
const SMALL = new Set(["de", "du", "des", "la", "le", "les", "d", "l", "et", "à", "au", "aux", "sur", "en", "bis", "ter"]);
const ABBR = { av: "Avenue", ave: "Avenue", bd: "Boulevard", bld: "Boulevard", rte: "Route", che: "Chemin", ch: "Chemin", pl: "Place", imp: "Impasse" };
const KEEP_UPPER = /^(z\.?a\.?c?|z\.?i|z\.?a|cc|cs\d*|rn|rd|d\d+|n\d+|a\d+)$/i;
// Adresses du flux en capitales -> casse lisible : « 459 AV.DE LA JUSTICE » -> « 459 Avenue de la Justice ».
function prettyAddress(raw) {
  const words = String(raw ?? "").replace(/\.(?=\p{L}{2,})/gu, ". ").replace(/\s+/g, " ").trim().split(" ");
  return words.map((w, i) => {
    const bare = w.replace(/\.$/, "").toLowerCase();
    if (ABBR[bare]) return ABBR[bare];
    if (KEEP_UPPER.test(w.replace(/\.$/, ""))) return w.toUpperCase();
    const lw = w.toLowerCase();
    if (i > 0 && SMALL.has(lw.replace(/['’]$/, ""))) return lw;
    return lw.replace(/(^|[-'’])(\p{L})/gu, (m, a, b) => a + b.toUpperCase());
  }).join(" ").replace(/\b([dl])['’]\s?/gi, (m, c) => `${c.toLowerCase()}’`);
}
const streetOf = (s) => (!s.adresse || /^(cs|bp)\s*\d+$/i.test(s.adresse.trim()) ? "" : prettyAddress(s.adresse));
// L'enseigne (OpenStreetMap) quand on la connaît, sinon l'adresse : c'est ce que le conducteur reconnaît.
const stationName = (s) => (s.nom ? (s.nom === s.nom.toUpperCase() ? titleCase(s.nom) : s.nom) : streetOf(s) || titleCase(s.ville));
const stationPlace = (s) => (s.nom ? [streetOf(s), titleCase(s.ville)].filter(Boolean).join(", ") : titleCase(s.ville));
const placeShort = (s) => (s.nom ? streetOf(s) || titleCase(s.ville) : titleCase(s.ville));
// Les pompes affichent 3 décimales, la dernière en petit : 2,11⁹.
function priceHTML(p) {
  const s = p.toFixed(3).replace(".", ",");
  return `${s.slice(0, -1)}<sup>${s.slice(-1)}</sup>`;
}
const priceSpoken = (p) => `${p.toFixed(3).replace(".", ",")} euros le litre`;
const kmText = (d) => (d < 10 ? dec1.format(d) : String(Math.round(d)));
function ago(date) {
  const min = Math.max(0, Math.round((Date.now() - date.getTime()) / 60000));
  if (min < 60) return `il y a ${min} min`;
  const h = Math.round(min / 60);
  return h < 48 ? `il y a ${h} h` : `il y a ${Math.round(h / 24)} j`;
}
const hoursOld = (date) => (Date.now() - date.getTime()) / 3600000;
const parseNum = (v) => {
  const s = String(v ?? "").trim().replace(/\s/g, "").replace(",", ".");
  return /^\d+(\.\d+)?$/.test(s) ? Number(s) : NaN; // refuse « 1e2 », « 0x10 »…
};
// « de Odysseum » -> « d'Odysseum »
const deName = (name) => (/^[aeiouyhéèêâîôû]/i.test(name) ? `d’${name}` : `de ${name}`);
const dayFmt = (d) => dateFmt.format(d).replace(/^1 /, "1er ");
const commaNum = (n, digits) => n.toFixed(digits).replace(".", ",");
const icon = (id, cls = "ic") => `<svg class="${cls}" aria-hidden="true"><use href="#${id}"/></svg>`;

// ---------- Éléments ----------
const $ = (id) => document.getElementById(id);
const els = {
  start: $("start"), startText: $("startText"), fuels: $("fuels"), fresh: $("fresh"), fillScrim: $("fillScrim"), e10Hint: $("e10Hint"), level: $("level"), levelOut: $("levelOut"), levelFull: $("levelFull"), levelUnknown: $("levelUnknown"), logKm: $("logKm"),
  answer: $("answer"), answerBody: $("answerBody"), alts: $("alts"), showAll: $("showAll"), showAllText: $("showAllText"),
  allList: $("allList"), favList: $("favList"), map: $("map"), mapNote: $("mapNote"),
  logTotal: $("logTotal"), logForm: $("logForm"), logStation: $("logStation"), logLitres: $("logLitres"),
  logPrice: $("logPrice"), logPreview: $("logPreview"), logList: $("logList"),
  stationSheet: $("stationSheet"), stationBody: $("stationBody"), navSheet: $("navSheet"), navApps: $("navApps"), navRemember: $("navRemember"),
  settingsSheet: $("settingsSheet"), settingsForm: $("settingsForm"), places: $("places"), profiles: $("profiles"), navPref: $("navPref"),
  vehForm: $("vehForm"), vehName: $("vehName"), vehLitres: $("vehLitres"), vehConso: $("vehConso"), vehFuel: $("vehFuel"), vehHint: $("vehHint"), vehYear: $("vehYear"), vehMatch: $("vehMatch"), vehModels: $("vehModels"),
  vehSave: $("vehSave"), vehCancel: $("vehCancel"), vehDelete: $("vehDelete"), vehEdit: $("vehEdit"), radius: $("radius"), radiusOut: $("radiusOut"),
  useGps: $("useGps"), useGpsText: $("useGpsText"), gpsHint: $("gpsHint"), toast: $("toast"),
  savings: $("savings"), trend: $("trend"), trendBody: $("trendBody"), themePref: $("themePref"), themeHint: $("themeHint"),
  tripForm: $("tripForm"), tripFrom: $("tripFrom"), tripTo: $("tripTo"), tripSugg: $("tripSugg"), tripRecent: $("tripRecent"), tripCorr: $("tripCorr"), tripOut: $("tripOut"), tripMap: $("tripMap"),
  ride: $("ride"), rideRank: $("rideRank"), rideName: $("rideName"), ridePrice: $("ridePrice"), rideMeta: $("rideMeta"), rideGo: $("rideGo"), rideNext: $("rideNext"), rideClose: $("rideClose"),
  fillCard: $("fillCard"), fillText: $("fillText"), fillQuick: $("fillQuick"), fillYes: $("fillYes"), fillNo: $("fillNo"), hapticLabel: $("hapticLabel"),
};

// ---------- Modèle ----------
function origin() {
  if (state.placeId === "gps" && state.gps) return state.gps;
  return PLACES.find((p) => p.id === state.placeId) || PLACES[0];
}
function originLabel() {
  if (state.placeId === "gps") return state.gps ? "ta position" : "la Comédie";
  return (PLACES.find((p) => p.id === state.placeId) || PLACES[0]).short;
}
const LEVEL_TTL = 48 * 3600000; // un niveau noté il y a plus de 48 h n'est plus utilisé
function vehicle() {
  const v = state.vehicles.find((x) => x.id === state.profileId) || state.vehicles[0] || SEEDS[0];
  const known = Number.isFinite(v.level) && Date.now() - (v.levelAt || 0) < LEVEL_TTL;
  return { ...v, short: v.short || v.label, level: known ? v.level : null };
}
const rawVehicle = () => state.vehicles.find((x) => x.id === state.profileId) || state.vehicles[0];
// Litres à mettre : ce qui manque pour remplir le réservoir (au moins 3 L) ; plein assumé si le niveau est inconnu.
function litresToBuy(v = vehicle()) {
  const tank = Number(v.litres) || 1;
  if (v.level == null || v.level >= 0.9) return tank;
  return Math.max(3, Math.round(tank * (1 - v.level) * 10) / 10);
}
const rangeOf = (v = vehicle()) => (v.level == null ? null : Math.round(((v.level * Number(v.litres)) / Math.max(0.1, Number(v.conso))) * 100));
const stationById = (id) => data?.stations.find((s) => s.id === id);
const isFav = (id) => state.favs.includes(id);
const fuelLabel = () => data.fuels[state.fuel]?.label ?? state.fuel;

function computeRanking() {
  const v = vehicle();
  const usable = data.stations.filter((s) => !isOutOfStock(s, state.fuel));
  ranked = rankStations(usable, state.fuel, origin(), { litres: litresToBuy(v), conso: Number(v.conso) || 0, radiusKm: state.radius, rangeKm: rangeOf(v) });
  ranked.forEach((r, i) => { r.rank = i + 1; });
}

// ---------- Rendu ----------
function renderStart() {
  const v = vehicle();
  els.start.classList.toggle("locating", locating);
  const where = state.placeId === "gps" ? (state.gps ? "Ta position" : "Comédie") : (PLACES.find((p) => p.id === state.placeId) || PLACES[0]).short;
  els.startText.textContent = locating ? "Position…"
    : state.placeId === "gps" && state.gps ? (gpsStale ? `Ancienne position, ${v.short}` : `${v.short}, ${state.radius} km`)
    : `${where}, ${v.short}`;
}
function renderFuels() {
  const fuels = FUEL_ORDER.filter((f) => data.fuels[f]);
  if (!fuels.includes(state.fuel)) state.fuel = fuels[0];
  els.fuels.innerHTML = fuels.map((f) => `<button type="button" role="radio" class="fuel" data-fuel="${f}"
      aria-checked="${f === state.fuel}"><b>${esc(data.fuels[f].label)}</b></button>`).join("");
}
function renderFresh() {
  const age = hoursOld(new Date(data.generated_at));
  const old = age > 24;
  els.fresh.hidden = false;
  els.fresh.classList.toggle("warn", old);
  els.fresh.innerHTML = old
    ? `${icon("i-caution")}<span>Prix relevés ${ago(new Date(data.generated_at))} : ils ont pu changer. Tire vers le bas pour actualiser.</span>`
    : `Prix relevés ${ago(new Date(data.generated_at))}`;
  const how = document.querySelector(".how p");
  if (!how) return;
  let note = how.querySelector(".fresh-note");
  if (!note) { note = document.createElement("span"); note.className = "fresh-note"; how.append(" ", note); }
  note.textContent = `Prix officiels relevés ${ago(new Date(data.generated_at))}.`;
}
const navLabel = () => NAV_APPS.find((a) => a.id === state.nav)?.label;

function renderAnswer() {
  if (!ranked.length) {
    const tooOld = hoursOld(new Date(data.generated_at)) > 24 * 14;
    const why = !Object.keys(data.fuels).length ? "Le relevé ne contient aucun prix pour l’instant. Tire vers le bas pour réessayer."
      : tooOld ? "Les prix de ce relevé ont plus de 14 jours. Tire vers le bas pour actualiser."
      : `Pas de ${esc(fuelLabel())} avec un prix récent à moins de ${state.radius} km ${esc(deName(originLabel()))}.`;
    els.answerBody.innerHTML = `<div class="ans-head"><p class="ans-name">Aucune station trouvée</p>
      <p class="ans-ville">${why}</p></div>
      ${!tooOld && state.radius < 40 ? `<button type="button" class="go" data-widen>Chercher jusqu’à ${Math.min(state.radius + 10, 40)} km</button>` : ""}`;
    lastLeadKey = "";
    return;
  }
  const r = ranked[0];
  const s = r.station;
  const stale = hoursOld(r.updatedAt) > STALE_HOURS;
  const saving = r.gain > 0.05 ? `<span class="save">${eur.format(r.gain)} de moins que la plus proche</span>`
    : `<span>${r.isNearest ? "C'est aussi la plus proche" : "Même total que la plus proche"}</span>`;
  const v = vehicle();
  const range = rangeOf(v);
  const age = (stale ? `<br><span class="flag">${icon("i-caution")}prix ${ago(r.updatedAt)}</span>` : "")
    + (r.unreachable ? `<br><span class="flag range low">${icon("i-caution")}hors d’autonomie : environ ${range} km</span>`
      : range != null ? `<br><button type="button" class="flag range${range < 60 ? " low" : ""}" data-open-settings>Autonomie environ ${range} km</button>` : "");
  els.answerBody.innerHTML = `
    <button type="button" class="ans-head plain" data-open="${esc(s.id)}" aria-label="Détails de la station ${esc(stationName(s))}">
      <span class="ans-name">${esc(stationName(s))}</span>
      <span class="ans-ville">${esc(stationPlace(s))}</span>
    </button>
    <p class="ans-price" aria-label="${priceSpoken(r.price)}"><span class="num">${priceHTML(r.price)}</span><span class="unit">€/L</span></p>
    <div class="ans-facts">
      <p class="fact"><b>${kmText(r.distanceKm)} km</b><span>distance</span></p>
      <p class="fact"><b>${eur.format(r.total)}</b><span>plein + détour</span></p>
    </div>
    <button type="button" class="go" data-go="${esc(s.id)}">${icon("i-go")}Y aller${navLabel() ? `<small>${esc(navLabel())}</small>` : ""}</button>
    <div class="ans-foot"><span>${saving}${age}</span>
      <button type="button" class="icon-btn" data-ride aria-label="Mode guidon : grand affichage pour la route">${icon("i-ride")}</button>
      <button type="button" class="icon-btn star-btn" data-fav="${esc(s.id)}" aria-pressed="${isFav(s.id)}" aria-label="${isFav(s.id) ? "Retirer des favoris" : "Ajouter aux favoris"}">${icon("i-star")}</button>
    </div>`;
  renderE10Hint();
  const key = `${s.id}|${state.fuel}`;
  if (!firstRender && key !== lastLeadKey) restitch();
  lastLeadKey = key;
}

// Le SP95-E5 est rare : quand l'E10 est nettement moins cher, on le signale (sans rien imposer).
function renderE10Hint() {
  const hint = els.e10Hint;
  hint.hidden = true;
  if (state.fuel !== "sp95" || !data.fuels.e10) return;
  const v = vehicle();
  const usable = data.stations.filter((s) => !isOutOfStock(s, "e10"));
  const e10 = rankStations(usable, "e10", origin(), { litres: litresToBuy(v), conso: Number(v.conso) || 0, radiusKm: state.radius, rangeKm: rangeOf(v) })[0];
  if (!e10 || e10.unreachable) return;
  const best = ranked[0];
  if (best && !best.unreachable && best.total - e10.total < 0.3) return;
  const diff = best && !best.unreachable ? ` : ${eur.format(best.total - e10.total)} de moins` : "";
  hint.innerHTML = `En E10, ${commaNum(e10.price, 3)} €/L à ${kmText(e10.distanceKm)} km${diff}<small>Voir en E10, si ton véhicule l’accepte</small>`;
  hint.hidden = false;
}

// Signature : le bouquet se brode du bas vers le haut (à l'ouverture, puis plus vite quand la réponse change).
function stitchIn(duration) {
  const svg = els.answer.querySelector(".bouquet");
  const g = svg?.querySelector(".stitches");
  if (!g) return;
  svg.classList.remove("pending");
  if (reduceMotion.matches) { g.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300, easing: "ease" }); return; }
  g.animate([{ clipPath: "inset(100% 0 0 0)" }, { clipPath: "inset(0 0 0 0)" }], { duration, easing: EASE_OUT });
}
function restitch() {
  stitchIn(600);
  const num = els.answerBody.querySelector(".ans-price .num");
  if (num) { num.classList.remove("restitch"); void num.offsetWidth; num.classList.add("restitch"); }
  if (!reduceMotion.matches) {
    els.answerBody.animate([{ opacity: 0.25, transform: "translateY(6px)" }, { opacity: 1, transform: "none" }], { duration: 240, easing: EASE_OUT });
  }
}

function altHTML(r, best, label) {
  const s = r.station;
  const delta = r.total - best.total;
  const right = label ?? (delta < 0.005 ? "même total" : `+${eur.format(delta)}`);
  const stale = hoursOld(r.updatedAt) > STALE_HOURS ? `, prix ${ago(r.updatedAt)}` : "";
  return `<button type="button" class="alt-btn" data-open="${esc(s.id)}" aria-label="${r.rank ? `${r.rank}e, ` : ""}${esc(stationName(s))}, ${priceSpoken(r.price)}, ${kmText(r.distanceKm)} kilomètres, ${esc(right)}">
      <span class="rank" aria-hidden="true">${r.rank ?? "–"}</span>
      <span class="alt-name">${esc(stationName(s))}</span>
      <span class="alt-price">${priceHTML(r.price)}</span>
      <span class="alt-meta">${kmText(r.distanceKm)} km, ${esc(placeShort(s))}${stale}</span>
      <span class="alt-gap">${esc(right)}</span>
    </button>`;
}

// Réordonnancement : chaque station glisse de son ancienne place à la nouvelle (FLIP).
function renderRows(list, rows, best, labels = new Map()) {
  const before = new Map();
  for (const li of list.children) if (li.dataset.id) before.set(li.dataset.id, li.getBoundingClientRect().top);
  const existing = new Map([...list.children].filter((li) => li.dataset.id).map((li) => [li.dataset.id, li]));
  const nodes = rows.map((r) => {
    const li = existing.get(r.station.id) || document.createElement("li");
    li.dataset.id = r.station.id;
    li.innerHTML = altHTML(r, best, labels.get(r.station.id));
    return li;
  });
  list.replaceChildren(...nodes);
  if (firstRender || reduceMotion.matches) return nodes;
  nodes.forEach((li, i) => {
    const prev = before.get(li.dataset.id);
    if (prev === undefined) {
      li.animate([{ opacity: 0.3, transform: "translateY(8px)" }, { opacity: 1, transform: "none" }], { duration: 220, easing: EASE_OUT, delay: Math.min(i, 6) * 30, fill: "backwards" });
      return;
    }
    const dy = prev - li.getBoundingClientRect().top;
    if (Math.abs(dy) > 1) li.animate([{ transform: `translateY(${dy}px)` }, { transform: "none" }], { duration: 260, easing: EASE_IN_OUT });
  });
  return nodes;
}

function renderRank() {
  renderAnswer();
  renderSavings();
  const best = ranked[0];
  const alts = ranked.slice(1, 1 + ALTS);
  $("nextTitle").hidden = !alts.length;
  const nodes = best ? renderRows(els.alts, alts, best) : (els.alts.replaceChildren(), []);
  if (firstRender && nodes.length) {
    nodes.forEach((li, i) => li.style.setProperty("--i", i + 6));
    els.alts.classList.add("unroll");
    setTimeout(() => els.alts.classList.remove("unroll"), 1000);
  }
  const rest = ranked.length - 1 - ALTS;
  els.showAll.hidden = rest <= 0;
  els.showAll.setAttribute("aria-expanded", String(showAll));
  els.showAllText.textContent = showAll ? "Masquer les autres stations" : (rest === 1 ? "Voir l’autre station" : `Voir les ${rest} autres stations`);
  els.allList.hidden = !showAll;
  if (showAll && best) renderRows(els.allList, ranked.slice(1 + ALTS, 1 + ALTS + ALL_MAX), best);
}

function renderFavs() {
  if (!state.favs.length) {
    els.favList.innerHTML = `<li class="empty"><p>Pas encore de station favorite. Ouvre une station et touche l'étoile pour la retrouver ici, avec son prix du jour.</p></li>`;
    return;
  }
  const v = vehicle();
  const favStations = state.favs.map(stationById).filter(Boolean);
  const rows = rankStations(favStations, state.fuel, origin(), { litres: litresToBuy(v), conso: Number(v.conso) || 0, radiusKm: 500 });
  const labels = new Map();
  for (const r of rows) {
    const pos = ranked.findIndex((x) => x.station.id === r.station.id);
    r.rank = pos >= 0 ? pos + 1 : null;
    if (pos < 0) labels.set(r.station.id, "hors rayon");
  }
  if (!rows.length) {
    els.favList.innerHTML = `<li class="empty"><p>Tes favoris n'ont pas de prix récent en ${esc(fuelLabel())}.</p></li>`;
    return;
  }
  renderRows(els.favList, rows, rows[0], labels);
}

function render() {
  if (!data) return renderStart();
  computeRanking();
  renderStart();
  for (const b of els.fuels.querySelectorAll(".fuel")) b.setAttribute("aria-checked", String(b.dataset.fuel === state.fuel));
  renderRank();
  if (view === "fav") renderFavs();
  if (view === "map") renderMap();
  if (view === "log") renderLog();
  if (view === "trip") renderTrip();
  renderTrend();
  if (els.ride.open) renderRide();
  firstRender = false;
}
function update() { save(); render(); }

// ---------- Onglets ----------
const VIEWS = ["rank", "map", "trip", "fav", "log"];
const tabThread = document.createElement("span");
tabThread.className = "tab-thread";
tabThread.setAttribute("aria-hidden", "true");
document.querySelector(".tabs").append(tabThread);
// Le fil se place au-dessus de l'icône de l'onglet choisi (transform seulement).
function placeThread() {
  const tab = document.querySelector(`.tabs [data-view="${view}"]`);
  if (!tab) return;
  tabThread.style.transform = `translateX(${(tab.offsetLeft + (tab.offsetWidth - 30) / 2).toFixed(1)}px)`;
}
function showView(next) {
  if (next === view) return;
  const dir = VIEWS.indexOf(next) > VIEWS.indexOf(view) ? "from-right" : "from-left";
  view = next;
  placeThread();
  for (const t of document.querySelectorAll(".tabs [role=tab]")) t.setAttribute("aria-selected", String(t.dataset.view === next));
  for (const id of VIEWS) {
    const el = $(`view-${id}`);
    el.hidden = id !== next;
    if (id === next) { el.classList.remove("entering", "from-left", "from-right"); void el.offsetWidth; el.classList.add(dir); }
  }
  if (next === "fav") renderFavs();
  if (next === "map") renderMap();
  if (next === "log") renderLog();
  if (next === "trip") renderTrip();
  window.scrollTo({ top: 0 });
}

// ---------- Itinéraire : Plans, Google Maps ou Waze ----------
// Les coordonnées du flux officiel tombent souvent au milieu de la route. Quand la station a été
// retrouvée sur OpenStreetMap (s.snap), on vise sa vraie position ; sinon on envoie l'adresse, que les
// applis savent poser sur le bon bâtiment, plutôt qu'un point GPS approximatif.
function navUrl(app, s) {
  const ll = `${s.lat},${s.lon}`;
  const street = streetOf(s);
  const addr = [street, [s.cp, titleCase(s.ville)].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  const byAddress = !s.snap && street;
  const dest = byAddress ? addr : ll;
  if (app === "apple") return `https://maps.apple.com/?daddr=${encodeURIComponent(dest)}&dirflg=d`;
  if (app === "waze") return byAddress ? `https://waze.com/ul?q=${encodeURIComponent(addr)}&ll=${ll}&navigate=yes` : `https://waze.com/ul?ll=${ll}&navigate=yes`;
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(dest)}&travelmode=driving`;
}
// Liens universels : le téléphone ouvre l'appli si elle est installée, sinon le site.
// Appelé directement dans le geste de l'utilisateur (sinon le navigateur bloque l'ouverture).
let navTarget = null;
function launchNav(app, s, urlFn = navUrl) {
  navTarget = { id: s.id, at: Date.now() };
  const a = document.createElement("a");
  a.href = urlFn(app, s);
  a.target = "_blank";
  a.rel = "noopener";
  document.body.append(a);
  a.click();
  a.remove();
}
let pendingNavStation = null;
let pendingNavUrl = navUrl;
function go(id, urlFn = navUrl, station = null) {
  const s = station || stationById(id);
  if (!s) return;
  if (state.nav) return launchNav(state.nav, s, urlFn);
  pendingNavStation = s;
  pendingNavUrl = urlFn;
  const apps = isIOS ? NAV_APPS : [NAV_APPS[1], NAV_APPS[2], NAV_APPS[0]];
  els.navApps.innerHTML = apps.map((a) => `<button type="button" class="nav-app" data-nav-app="${a.id}">${esc(a.label)}<small>${esc(a.detail)}</small></button>`).join("");
  openSheet(els.navSheet);
}

// ---------- Carte : MapLibre + tuiles OpenFreeMap (sans clé), recolorées aux fils de la broderie ----------
let maplib = null;
let map = null;
let markers = [];
const MAP_STYLE_URL = "https://tiles.openfreemap.org/styles/positron";
function loadMapLib() {
  if (window.maplibregl) return Promise.resolve(window.maplibregl);
  return new Promise((resolve, reject) => {
    const css = document.createElement("link");
    css.rel = "stylesheet";
    css.href = "vendor/maplibre/maplibre-gl.css";
    document.head.append(css);
    const js = document.createElement("script");
    js.src = "vendor/maplibre/maplibre-gl.js";
    js.onload = () => resolve(window.maplibregl);
    js.onerror = reject;
    document.head.append(js);
  });
}
const MAP_PALETTES = {
  light: { bg: "#F3EDE0", water: "#C7DAE5", park: "#DDE5CF", building: "#E7DECD", road: "#FFFFFF", major: "#EBCB8E", rail: "#CBBFA8", text: "#6A5F55", halo: "#F3EDE0", boundary: "#C4B392" },
  dark: { bg: "#0E1430", water: "#1A2856", park: "#16254A", building: "#151D40", road: "#25305C", major: "#6B5A33", rail: "#2E3A6A", text: "#A8AECB", halo: "#0E1430", boundary: "#46528A" },
};
let baseStyle = null;
function recolor(style, pal) {
  const s = structuredClone(style);
  for (const layer of s.layers) {
    const id = layer.id.toLowerCase();
    const p = (layer.paint ||= {});
    if (layer.type === "background") { p["background-color"] = pal.bg; continue; }
    if (layer.type === "symbol") { p["text-color"] = pal.text; p["text-halo-color"] = pal.halo; p["icon-opacity"] = 0.7; continue; }
    const set = (c) => {
      if (layer.type === "fill") p["fill-color"] = c;
      if (layer.type === "line") p["line-color"] = c;
      if (layer.type === "fill-extrusion") p["fill-extrusion-color"] = c;
    };
    if (/water|ocean|river|lake/.test(id)) set(pal.water);
    else if (/park|landcover|landuse|grass|wood|forest|green|cemetery/.test(id)) set(pal.park);
    else if (/building/.test(id)) set(pal.building);
    else if (/rail/.test(id)) set(pal.rail);
    else if (/boundary|admin/.test(id)) set(pal.boundary);
    else if (/motorway|trunk|primary|major/.test(id)) set(pal.major);
    else if (/road|highway|street|bridge|tunnel|path|minor|service|transportation/.test(id)) set(pal.road);
  }
  return s;
}
const currentPalette = () => MAP_PALETTES[isDark() ? "dark" : "light"];
function flowerPin(n, top) {
  const el = document.createElement("button");
  el.type = "button";
  el.className = `pin${top ? " is-best" : ""}`;
  el.setAttribute("aria-label", `Station ${n}`);
  // Pastille cousue (point de couture en pointillé), numéro du classement au centre
  el.textContent = String(n);
  return el;
}
async function renderMap() {
  try {
    maplib = maplib || (await loadMapLib());
  } catch {
    els.mapNote.textContent = "La carte n'a pas pu se charger. Le classement reste disponible.";
    return;
  }
  const o = origin();
  if (!map) {
    try {
      if (!baseStyle) baseStyle = await (await fetch(MAP_STYLE_URL)).json();
    } catch {
      els.mapNote.textContent = "Le fond de carte ne répond pas pour l'instant. Réessaie plus tard, le classement reste disponible.";
      return;
    }
    map = new maplib.Map({
      container: els.map, style: recolor(baseStyle, currentPalette()), center: [o.lon, o.lat], zoom: 12,
      attributionControl: { compact: true },
    });
    map.addControl(new maplib.NavigationControl({ showCompass: false }), "bottom-right");
    document.addEventListener("themechange", () => map.setStyle(recolor(baseStyle, currentPalette())));
  }
  for (const m of markers) m.remove();
  markers = [];
  const me = document.createElement("div");
  me.className = "me-dot";
  markers.push(new maplib.Marker({ element: me }).setLngLat([o.lon, o.lat]).addTo(map));
  const shown = ranked.slice(0, MAP_MAX);
  const pts = [[o.lon, o.lat], ...shown.slice(0, 8).map((r) => [r.station.lon, r.station.lat])];
  const lons = pts.map((p) => p[0]);
  const lats = pts.map((p) => p[1]);
  map.resize();
  map.fitBounds([[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]], { padding: 48, maxZoom: 14, duration: 0 });
  // Pastilles qui se chevauchent à l'écran : on écarte les suivantes en éventail autour de la première.
  const placed = [];
  for (const r of shown) {
    const pt = map.project([r.station.lon, r.station.lat]);
    const clashes = placed.filter((q) => Math.hypot(q.x - pt.x, q.y - pt.y) < 30).length;
    const ang = (clashes * 2 * Math.PI) / 6 - Math.PI / 2;
    r.pinOffset = clashes ? [Math.round(Math.cos(ang) * 30), Math.round(Math.sin(ang) * 30)] : [0, 0];
    placed.push({ x: pt.x + r.pinOffset[0], y: pt.y + r.pinOffset[1] });
  }
  shown.slice().reverse().forEach((r) => {
    const el = flowerPin(r.rank, r.rank === 1);
    el.addEventListener("click", (e) => { e.stopPropagation(); openStation(r.station.id); });
    markers.push(new maplib.Marker({ element: el, offset: r.pinOffset }).setLngLat([r.station.lon, r.station.lat]).addTo(map));
  });
}

// ---------- Fiche station ----------
function openStation(id) {
  const s = stationById(id);
  if (!s) return;
  const r = ranked.find((x) => x.station.id === id);
  const prices = FUEL_ORDER.filter((f) => s.prices[f]).map((f) => {
    const [p, t] = s.prices[f];
    const out = isOutOfStock(s, f) ? ` <span class="flag">${icon("i-caution")}rupture signalée</span>` : "";
    return `<li><span class="fuel-name${f === state.fuel ? " cur" : ""}">${esc(data.fuels[f]?.label ?? f)}</span><span class="num">${priceHTML(p)}</span><small>prix ${ago(new Date(t))}${out}</small></li>`;
  }).join("");
  const facts = [
    s.snap ? ["Position", "relevée sur OpenStreetMap, l’itinéraire vise la station"] : ["Position", "approximative : l’itinéraire vise l’adresse"],
    s.automate_24_24 ? ["Automate 24 h/24", esc(s.automate_24_24)] : null,
    s.horaires ? ["Horaires", esc(s.horaires)] : null,
    s.services ? ["Services", esc(s.services)] : null,
  ].filter(Boolean);
  els.stationBody.innerHTML = `
    <div class="grabber" aria-hidden="true"></div>
    <div class="sheet-head">
      <div><h2 id="stTitle">${esc(stationName(s))}</h2>
        <p>${esc(stationPlace(s))}${r ? `, ${kmText(r.distanceKm)} km, ${r.rank}${r.rank === 1 ? "re" : "e"} au classement` : ", hors rayon"}</p></div>
      <button class="icon-btn" type="button" data-close aria-label="Fermer">${icon("i-close")}</button>
    </div>
    ${r ? `<p class="st-sum"><b>${eur.format(r.total)}</b> le plein de ${esc(fuelLabel())}, détour compris</p>` : ""}
    <div class="st-actions">
      <button type="button" class="go" data-go="${esc(s.id)}">${icon("i-go")}Y aller</button>
      <button type="button" class="icon-btn star-btn" data-fav="${esc(s.id)}" aria-pressed="${isFav(s.id)}" aria-label="${isFav(s.id) ? "Retirer des favoris" : "Ajouter aux favoris"}">${icon("i-star")}</button>
      ${navigator.share ? `<button type="button" class="icon-btn" data-share="${esc(s.id)}" aria-label="Partager la station">${icon("i-share")}</button>` : ""}
    </div>
    <ul class="st-prices" aria-label="Prix dans cette station">${prices}</ul>
    ${reportBlock(s)}
    ${facts.length ? `<dl class="st-facts">${facts.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("")}</dl>` : ""}
    <button type="button" class="btn" data-log-here="${esc(s.id)}">${icon("i-log")}Noter un plein ici</button>`;
  openSheet(els.stationSheet);
}

// ---------- Panneaux ----------
function openSheet(dlg) {
  if (!dlg.open) dlg.showModal();
  requestAnimationFrame(() => requestAnimationFrame(() => dlg.classList.add("is-open")));
}
function closeSheet(dlg) {
  if (!dlg.open) return;
  dlg.classList.remove("is-open");
  setTimeout(() => { if (dlg.open && !dlg.classList.contains("is-open")) dlg.close(); }, 340);
}
// Glisser vers le bas pour fermer, depuis la poignée ou l'en-tête.
function enableDragToClose(dlg) {
  let startY = 0, dy = 0, dragging = false, sheet = null;
  dlg.addEventListener("pointerdown", (e) => {
    if (!e.target.closest(".grabber, .sheet-head") || e.target.closest("button, a, input")) return;
    sheet = dlg.querySelector(".sheet");
    dragging = true; startY = e.clientY; dy = 0;
    sheet.style.transition = "none";
    sheet.setPointerCapture(e.pointerId);
  });
  dlg.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    dy = Math.max(0, e.clientY - startY);
    sheet.style.transform = `translateY(${dy}px)`;
  });
  const end = () => {
    if (!dragging) return;
    dragging = false;
    sheet.style.transition = "";
    sheet.style.transform = "";
    if (dy > 90) closeSheet(dlg);
  };
  dlg.addEventListener("pointerup", end);
  dlg.addEventListener("pointercancel", end);
}

function renderLevel() {
  const v = vehicle();
  const raw = rawVehicle();
  const known = v.level != null;
  els.level.value = known ? Math.round(v.level * 100) : 50;
  if (known) {
    const litres = Math.round(v.level * Number(v.litres) * 10) / 10;
    els.levelOut.textContent = `${Math.round(v.level * 100)} % (environ ${commaNum(litres, 1)} L), autonomie ${rangeOf(v)} km`;
  } else {
    els.levelOut.textContent = Number.isFinite(raw?.level) ? `noté ${ago(new Date(raw.levelAt || 0))}, plus utilisé` : "inconnu";
  }
}
function setLevel(frac) {
  const v = rawVehicle();
  if (!v) return;
  if (frac == null) { delete v.level; delete v.levelAt; } else { v.level = frac; v.levelAt = Date.now(); }
  renderSettings();
  update();
}
els.level.addEventListener("input", () => setLevel(Number(els.level.value) / 100));
els.levelFull.addEventListener("click", () => setLevel(1));
els.levelUnknown.addEventListener("click", () => setLevel(null));

function renderSettings() {
  els.places.innerHTML = PLACES.map((p) => `<button type="button" class="choice" data-place="${p.id}" aria-pressed="${state.placeId === p.id}">${esc(p.label)}</button>`).join("");
  const current = vehicle().id;
  els.profiles.innerHTML = state.vehicles.map((v) => `<button type="button" class="choice" data-profile="${v.id}" aria-pressed="${current === v.id}">${esc(v.label)}<small>${v.year ? `${v.year}, ` : ""}${litresText(v.litres)} L, ${commaNum(Number(v.conso), 1)} L/100</small></button>`).join("")
    + `<button type="button" class="choice choice-add" data-veh-add><svg class="ic" aria-hidden="true"><use href="#i-plus"/></svg>Ajouter un véhicule</button>`;
  renderLevel();
  els.vehEdit.hidden = !state.vehicles.length || vehEditing !== null;
  els.vehEdit.textContent = `Modifier « ${vehicle().label} »`;
  els.vehForm.hidden = vehEditing === null;
  els.vehDelete.hidden = vehEditing === null || vehEditing === "new" || state.vehicles.length <= 1;
  els.navPref.innerHTML = [{ id: "", label: "Me demander" }, ...NAV_APPS].map((a) => `<button type="button" class="choice" data-nav-pref="${a.id}" aria-pressed="${(state.nav || "") === a.id}">${esc(a.label)}</button>`).join("");
  els.themePref.innerHTML = THEMES.map((t) => `<button type="button" class="choice" data-theme-pref="${t.id}" aria-pressed="${(state.theme || "auto") === t.id}">${esc(t.label)}</button>`).join("");
  els.themeHint.textContent = themeHint();
  els.themeHint.hidden = !els.themeHint.textContent;
  els.radius.value = state.radius;
  els.radiusOut.textContent = `${state.radius} km`;
  els.useGps.setAttribute("aria-pressed", String(state.placeId === "gps"));
  els.useGpsText.textContent = locating ? "Recherche de ta position…" : state.gps && state.placeId === "gps" ? "Ma position (active)" : "Ma position";
}

// ---------- Position : demandée à l'ouverture, suivie tant que le site est ouvert ----------
function locate({ fromUser = false } = {}) {
  if (!("geolocation" in navigator)) {
    if (fromUser) hint("Ton navigateur ne donne pas accès à la position. Choisis un point de départ.");
    return;
  }
  locating = true;
  renderStart();
  if (els.settingsSheet.open) renderSettings();
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      locating = false;
      state.gps = { lat: pos.coords.latitude, lon: pos.coords.longitude, at: Date.now() };
      gpsStale = false;
      state.placeId = "gps";
      hint("");
      if (els.settingsSheet.open) renderSettings();
      update();
      startWatch();
    },
    (err) => {
      locating = false;
      const msg = err.code === 1
        ? "Position refusée : classement depuis la Comédie. Tu peux l'autoriser dans les réglages du navigateur."
        : "Position introuvable pour l'instant : classement depuis la Comédie.";
      if (state.placeId === "gps" && !state.gps) toast(msg);
      else if (state.placeId === "gps" && state.gps) { // on repart de la dernière position connue : on le dit
        gpsStale = true;
        const when = state.gps.at ? ` (${ago(new Date(state.gps.at))})` : "";
        toast(`Position introuvable : classement depuis ta dernière position${when}`);
      }
      if (fromUser) hint(msg);
      if (els.settingsSheet.open) renderSettings();
      render();
    },
    { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 },
  );
}
function hint(text) {
  els.gpsHint.textContent = text;
  els.gpsHint.hidden = !text;
}
function startWatch() {
  if (watchId !== null || !("geolocation" in navigator) || document.visibilityState !== "visible") return;
  watchId = navigator.geolocation.watchPosition(onPosition, () => {}, { enableHighAccuracy: true, maximumAge: 15000, timeout: 30000 });
}
function stopWatch() {
  if (watchId !== null) navigator.geolocation.clearWatch(watchId);
  watchId = null;
}
let lastFix = null;
function onPosition(pos) {
  if (pos.coords.accuracy > 60) return; // trop imprécis pour savoir si on est à la pompe
  const here = { lat: pos.coords.latitude, lon: pos.coords.longitude };
  lastFix = { ...here, at: Date.now() };
  checkDwell(here);
  if (state.placeId !== "gps") return;
  const moved = state.gps ? haversineKm(state.gps, here) * 1000 : Infinity;
  if (gpsStale) { gpsStale = false; renderStart(); }
  if (moved > REORIGIN_M) { state.gps = { ...here, at: Date.now() }; update(); }
}
function nearestStation(here) {
  let nearest = null;
  let best = Infinity;
  for (const s of data.stations) {
    const d = haversineKm(here, s) * 1000;
    if (d < best) { best = d; nearest = s; }
  }
  return { station: nearest, meters: best };
}
// 3 minutes à moins de 50 m d'une station : on propose de noter le plein.
// Un minuteur vérifie au bout de 3 min même si le téléphone, immobile, ne renvoie plus de position.
let dwellTimer = 0;
function checkDwell(here) {
  if (!data) return;
  const { station, meters } = nearestStation(here);
  if (station && meters <= DWELL_IN_M) {
    if (!dwell || dwell.id !== station.id) {
      dwell = { id: station.id, since: Date.now() };
      clearTimeout(dwellTimer);
      dwellTimer = setTimeout(() => {
        if (dwell?.id === station.id && lastFix && haversineKm(lastFix, station) * 1000 <= DWELL_OUT_M) maybeOfferFill(station);
      }, DWELL_MS);
    } else if (Date.now() - dwell.since >= DWELL_MS) {
      maybeOfferFill(station);
    }
  } else if (meters > DWELL_OUT_M) {
    dwell = null;
    clearTimeout(dwellTimer);
  }
}
// Retour dans Plein Sud après avoir suivi l'itinéraire : si on est à la station visée, on propose le plein tout de suite.
function checkReturnFromNav() {
  if (!navTarget || !data || !("geolocation" in navigator)) return;
  const target = stationById(navTarget.id);
  if (!target || Date.now() - navTarget.at < 60 * 1000 || Date.now() - navTarget.at > 3 * 3600 * 1000) return;
  navigator.geolocation.getCurrentPosition((pos) => {
    if (pos.coords.accuracy > 80) return;
    const d = haversineKm({ lat: pos.coords.latitude, lon: pos.coords.longitude }, target) * 1000;
    if (d <= DWELL_OUT_M) { navTarget = null; maybeOfferFill(target); }
  }, () => {}, { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 });
}
function maybeOfferFill(s) {
  const seen = state.fillSeen[s.id] || 0;
  if (Date.now() - seen < 2 * 3600 * 1000 || !els.fillCard.hidden) return;
  state.fillSeen[s.id] = Date.now();
  save();
  showFillCard(s);
}
function buzz() {
  if (navigator.vibrate) { navigator.vibrate([40, 70, 40]); return; }
  // iPhone : Safari n'a pas d'API de vibration. Basculer un interrupteur iOS (input switch) déclenche
  // un retour haptique sur les versions récentes ; c'est une astuce non garantie.
  if (isIOS) try { els.hapticLabel.click(); } catch { /* sans effet */ }
}
let fillStation = null;
function showFillCard(s) {
  fillStation = s;
  const p = s.prices[state.fuel]?.[0];
  const litres = litresToBuy();
  els.fillText.textContent = `Tu es à ${stationName(s)}. On note ce plein dans ton carnet ?`;
  els.fillQuick.textContent = p ? `Noter ${String(litres).replace(".", ",")} L à ${commaNum(p, 3)} €/L` : "Noter ce plein";
  els.fillQuick.hidden = !p;
  els.fillCard.hidden = false;
  els.fillScrim.hidden = false;
  requestAnimationFrame(() => requestAnimationFrame(() => { els.fillCard.classList.add("show"); els.fillScrim.classList.add("show"); }));
  buzz();
}
function hideFillCard() {
  els.fillCard.classList.remove("show");
  els.fillScrim.classList.remove("show");
  setTimeout(() => { if (!els.fillCard.classList.contains("show")) { els.fillCard.hidden = true; els.fillScrim.hidden = true; } }, 340);
}

// ---------- Carnet d'économies ----------
function fillLogForm(preselectId) {
  const favs = state.favs.map(stationById).filter((s) => s && s.prices[state.fuel]);
  const near = ranked.slice(0, 20).map((r) => r.station).filter((s) => !state.favs.includes(s.id));
  const opt = (s) => `<option value="${esc(s.id)}">${esc(stationName(s))}, ${esc(placeShort(s) === stationName(s) ? titleCase(s.ville) : placeShort(s))}</option>`;
  els.logStation.innerHTML =
    (favs.length ? `<optgroup label="Favoris">${favs.map(opt).join("")}</optgroup>` : "") +
    (near.length ? `<optgroup label="Autour ${esc(deName(originLabel()))}">${near.map(opt).join("")}</optgroup>` : "");
  const pre = preselectId && stationById(preselectId);
  if (pre && ![...els.logStation.options].some((o) => o.value === pre.id)) els.logStation.insertAdjacentHTML("afterbegin", opt(pre));
  if (pre) els.logStation.value = pre.id;
  els.logLitres.value = String(litresToBuy()).replace(".", ",");
  syncLogPrice();
}
function syncLogPrice() {
  const p = stationById(els.logStation.value)?.prices[state.fuel]?.[0];
  if (p) els.logPrice.value = commaNum(p, 3);
  previewLog();
}
function previewLog() {
  const median = data.fuels[state.fuel]?.median;
  const litres = parseNum(els.logLitres.value);
  const price = parseNum(els.logPrice.value);
  if (!median || !(litres > 0) || !(price > 0)) {
    els.logPreview.textContent = litres || price ? "Saisis des litres et un prix au litre valides, par exemple 14 et 1,989." : "";
    return;
  }
  const gain = (median - price) * litres;
  els.logPreview.textContent = gain >= 0
    ? `Économie estimée : ${eur.format(gain)} par rapport au prix médian de la zone (${commaNum(median, 3)} €).`
    : `${eur.format(-gain)} de plus que le prix médian de la zone (${commaNum(median, 3)} €).`;
}
// Un plein noté : le réservoir est de nouveau plein (le niveau sert ensuite à calculer litres et autonomie).
function markTankFull() {
  const v = rawVehicle();
  if (v) { v.level = 1; v.levelAt = Date.now(); }
}
// Conso réelle : litres mis à chaque plein / kilomètres parcourus depuis le plein précédent (pleins à ras bord).
function realConsumption(vehicleId) {
  const rows = state.log.filter((e) => e.vehicleId === vehicleId && Number(e.km) > 0).sort((a, b) => a.km - b.km);
  const legs = [];
  for (let i = 1; i < rows.length; i++) {
    const km = rows[i].km - rows[i - 1].km;
    if (km >= 50 && km <= 1500) legs.push({ litres: rows[i].litres, km });
  }
  const last = legs.slice(-5);
  if (!last.length) return null;
  const litres = last.reduce((s, l) => s + l.litres, 0);
  const km = last.reduce((s, l) => s + l.km, 0);
  return { conso: (litres / km) * 100, n: last.length };
}
function renderLog() {
  const entries = state.log;
  const total = entries.reduce((sum, e) => sum + e.gain, 0);
  els.logTotal.innerHTML = entries.length
    ? `<p><b>${eur.format(total)}</b> ${total >= 0 ? "économisés" : "dépensés en plus"} sur ${entries.length} plein${entries.length > 1 ? "s" : ""} depuis le ${dayFmt(new Date(entries[entries.length - 1].date))}, par rapport au prix médian de la zone le jour du plein.</p>`
    : `<p>Note tes pleins pour voir ce que Plein Sud te fait économiser par rapport au prix médian de la zone.</p>`;
  const real = realConsumption(rawVehicle()?.id);
  if (real) {
    const sheet = Number(rawVehicle().conso);
    els.logTotal.insertAdjacentHTML("beforeend", `<div class="log-conso"><span>Conso réelle : <b>${commaNum(real.conso, 1)} L/100 km</b> sur ${real.n} plein${real.n > 1 ? "s" : ""} (ta fiche : ${commaNum(sheet, 1)})</span>
      ${Math.abs(real.conso - sheet) >= 0.2 ? `<button type="button" class="btn" data-use-conso="${real.conso.toFixed(1)}">Utiliser ${commaNum(real.conso, 1)}</button>` : ""}</div>`);
  } else if (entries.length) {
    els.logTotal.insertAdjacentHTML("beforeend", `<p class="hint">Ajoute le kilométrage à deux pleins pour voir ta consommation réelle.</p>`);
  }
  els.logList.innerHTML = entries.map((e) => `<li class="log-item">
      <p>${esc(e.ville)}, ${esc(e.fuelLabel)}<small>${dayFmt(new Date(e.date))}, ${String(e.litres).replace(".", ",")} L à ${commaNum(e.price, 3)} €</small></p>
      <span class="log-gain${e.gain < 0 ? " neg" : ""}" aria-label="${eur.format(Math.abs(e.gain))} ${e.gain >= 0 ? "économisés" : "de plus que le prix médian"}">${e.gain >= 0 ? "+" : "−"}${eur.format(Math.abs(e.gain))}</span>
      <button type="button" class="log-del" data-del="${esc(e.id)}" aria-label="Supprimer ce plein">${icon("i-close")}</button>
    </li>`).join("");
  if (!els.logStation.options.length) fillLogForm();
}

// ---------- Compteur d'économies ----------
// Le total « monte » jusqu'à sa valeur : à la première apparition, puis après chaque plein noté.
let savingsShown = 0;
let savingsRaf = 0;
function countSavings(target) {
  cancelAnimationFrame(savingsRaf);
  const from = savingsShown, t0 = performance.now(), dur = 700;
  const b = () => els.savings.querySelector("b");
  if (reduceMotion.matches || Math.abs(target - from) < 0.01) { savingsShown = target; if (b()) b().textContent = eur.format(target); return; }
  const step = (now) => {
    const k = Math.min(1, (now - t0) / dur);
    const e = 1 - Math.pow(1 - k, 4); // décélération marquée, comme --ease-out
    savingsShown = from + (target - from) * e;
    if (b()) b().textContent = eur.format(savingsShown);
    if (k < 1) savingsRaf = requestAnimationFrame(step);
  };
  savingsRaf = requestAnimationFrame(step);
}
function renderSavings() {
  const total = state.log.reduce((sum, e) => sum + e.gain, 0);
  const n = state.log.length;
  els.savings.hidden = !(n && total >= 0.5);
  if (els.savings.hidden) return;
  els.savings.innerHTML = `<b>${eur.format(savingsShown)}</b> économisés avec Plein Sud<small>sur ${n} plein${n > 1 ? "s" : ""} noté${n > 1 ? "s" : ""}, par rapport au prix médian de la zone · voir le carnet</small>`;
  countSavings(total);
}

// ---------- Courbe des prix et prévision ----------
let priceHistory = null;
async function loadHistory() {
  try {
    const res = await fetch("data/history.json", { cache: "no-store" });
    if (res.ok) priceHistory = await res.json();
  } catch { /* la courbe est un bonus : sans elle, rien ne change */ }
  renderTrend();
}
let trendKey = "";
let trendObserver = null;
function sewTrend() {
  const card = els.trendBody;
  card.classList.remove("sewing");
  void card.offsetWidth;
  card.classList.add("sewing");
  clearTimeout(sewTrend.t);
  sewTrend.t = setTimeout(() => card.classList.remove("sewing"), 1600);
}
function renderTrend() {
  const h = priceHistory?.fuels?.[state.fuel];
  els.trend.hidden = !h || h.days.length < 3;
  if (els.trend.hidden) return;
  const fc = h.forecast;
  const last = h.median.at(-1);
  els.trendBody.innerHTML = `<p class="trend-lead"><b>${fmt3(last)} €/L</b> : prix médian du ${esc(fuelLabel())} aujourd’hui dans la zone${fc ? `<br><span>${trendWords(fc)}</span>` : ""}</p>
    ${trendSVG(h, { label: fuelLabel() })}
    ${fc ? `<ul class="trend-legend">
      <li><i class="lg-line"></i>relevé</li>
      <li><i class="lg-real"></i>réaliste : ${fmt3(fc.real.at(-1))} dans 7 jours</li>
      <li><i class="lg-band"></i>entre ${fmt3(fc.low.at(-1))} (optimiste) et ${fmt3(fc.high.at(-1))} (pessimiste)</li></ul>` : ""}
    <p class="hint">Prévision expérimentale, faite sur ${h.days.length} jours de relevés : elle s’affinera avec le temps. <a href="coulisses.html#prevision">Comment elle est calculée</a></p>`;
  const key = state.fuel;
  if (key === trendKey) return;
  const first = !trendKey;
  trendKey = key;
  if (first && "IntersectionObserver" in window) {
    // Première fois : la courbe se coud quand on la voit, pas hors de l'écran.
    trendObserver = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { sewTrend(); trendObserver.disconnect(); }
    }, { threshold: 0.4 });
    trendObserver.observe(els.trendBody);
  } else if (!first) {
    sewTrend();
  }
}

// ---------- Thème ----------
const THEMES = [{ id: "auto", label: "Selon le soleil" }, { id: "light", label: "Clair" }, { id: "dark", label: "Sombre" }, { id: "system", label: "Comme le téléphone" }];
function themeHint() {
  const T = window.pleinSudTheme;
  if (!T || (state.theme || "auto") !== "auto") return "";
  const now = new Date();
  const { sunrise, sunset } = T.sunTimes(now);
  if (now < sunrise) return `Fleurs de nuit jusqu’au lever du soleil, à ${timeFmt.format(sunrise)} à Montpellier.`;
  if (now < sunset) return `Passe en sombre au coucher du soleil, à ${timeFmt.format(sunset)} aujourd’hui à Montpellier.`;
  const tomorrow = T.sunTimes(new Date(now.getTime() + 86400000)).sunrise;
  return `Repasse en clair au lever du soleil, à ${timeFmt.format(tomorrow)} demain.`;
}

// ---------- Mode guidon : une seule station, en très grand, écran allumé ----------
const RIDE_MAX = 5;
let rideIdx = 0;
let wakeLock = null;
async function keepAwake() {
  try { wakeLock = await navigator.wakeLock?.request("screen"); } catch { /* pas grave : l'écran s'éteindra comme d'habitude */ }
}
function renderRide() {
  const list = ranked.slice(0, RIDE_MAX);
  if (!list.length) { els.rideName.textContent = "Aucune station dans le rayon"; els.ridePrice.textContent = ""; els.rideMeta.textContent = ""; els.rideGo.hidden = true; els.rideNext.hidden = true; return; }
  rideIdx %= list.length;
  const r = list[rideIdx];
  els.rideRank.textContent = `${rideIdx + 1}${rideIdx ? "e" : "re"} sur ${list.length} · ${fuelLabel()}`;
  els.rideName.textContent = stationName(r.station);
  els.ridePrice.innerHTML = `${priceHTML(r.price)}<span>€/L</span>`;
  els.ridePrice.setAttribute("aria-label", priceSpoken(r.price));
  els.rideMeta.innerHTML = `<span>${esc(stationPlace(r.station))}</span>${kmText(r.distanceKm)} km · ${eur.format(r.total)} plein + détour${r.unreachable ? " · hors d’autonomie" : ""}`;
  els.rideGo.hidden = false;
  els.rideNext.hidden = list.length < 2;
}
function openRide() {
  if (!data) return;
  rideIdx = 0;
  renderRide();
  if (!els.ride.open) els.ride.showModal();
  keepAwake();
}
function closeRide() {
  if (els.ride.open) els.ride.close();
  wakeLock?.release?.().catch?.(() => {});
  wakeLock = null;
}
els.rideClose.addEventListener("click", closeRide);
els.ride.addEventListener("close", () => { wakeLock?.release?.().catch?.(() => {}); wakeLock = null; });
els.rideNext.addEventListener("click", () => {
  rideIdx++;
  renderRide();
  const kf = reduceMotion.matches ? [{ opacity: 0.2 }, { opacity: 1 }] : [{ opacity: 0.2, transform: "translateX(44px)" }, { opacity: 1, transform: "none" }];
  for (const [i, el] of [els.rideName, els.ridePrice, els.rideMeta].entries()) el.animate(kf, { duration: 480, easing: EASE_OUT, delay: i * 90, fill: "backwards" });
});
els.rideGo.addEventListener("click", () => { const r = ranked.slice(0, RIDE_MAX)[rideIdx]; if (r) go(r.station.id); });

// ---------- Trajet : les stations sur la route ----------
// Adresse -> position : Base Adresse Nationale (api-adresse.data.gouv.fr). Itinéraire : serveur public OSRM.
const CORRIDORS = [1, 2, 5];
const TRIP_LIST = 8;
let trip = null;
let tripSeq = 0;
let suggestions = [];
let suggTimer = 0;
// « 8 Rue de la Loge 34000 Montpellier » -> « 8 Rue de la Loge, Montpellier » (et pas seulement la ville).
function tripName(t) {
  const m = /^(.*?)\s*\b\d{5}\s+(.+)$/.exec(t.label || "");
  return m && m[1] ? `${m[1]}, ${m[2]}` : t.label || t.short;
}
async function geocode(q) {
  const o = origin();
  const res = await fetch(`https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(q)}&limit=5&lat=${o.lat}&lon=${o.lon}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const j = await res.json();
  return (j.features || []).map((f) => ({
    label: f.properties.label, short: f.properties.city || f.properties.name, detail: f.properties.context,
    lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0],
  }));
}
async function fetchRoute(a, b) {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 9000);
    const res = await fetch(`https://router.project-osrm.org/route/v1/driving/${a.lon},${a.lat};${b.lon},${b.lat}?overview=full&geometries=geojson`, { signal: ctrl.signal });
    clearTimeout(timer);
    const r = (await res.json()).routes?.[0];
    if (!r) throw new Error("pas d'itinéraire");
    return { coords: r.geometry.coordinates, distanceKm: r.distance / 1000, durationMin: r.duration / 60, approx: false };
  } catch {
    // Serveur d'itinéraire injoignable : ligne droite, distances x 1,3, et on le dit.
    const n = 40;
    const coords = Array.from({ length: n + 1 }, (_, i) => [a.lon + ((b.lon - a.lon) * i) / n, a.lat + ((b.lat - a.lat) * i) / n]);
    return { coords, distanceKm: haversineKm(a, b) * ROAD_FACTOR, durationMin: null, approx: true };
  }
}
async function planTrip(dest) {
  if (!dest) return;
  const seq = ++tripSeq;
  state.trips = [dest, ...state.trips.filter((t) => t.label !== dest.label)].slice(0, 4);
  save();
  els.tripTo.value = dest.label;
  els.tripSugg.hidden = true;
  els.tripTo.blur();
  els.tripOut.innerHTML = `<p class="trip-wait">On trace la route vers ${esc(tripName(dest))}…</p>`;
  const r = await fetchRoute(origin(), dest);
  if (seq !== tripSeq) return;
  const coords = thin(r.coords, 600);
  const route = prepareRoute(coords);
  tripFresh = true;
  trip = { dest, ...r, coords, route, coveredKm: data ? coveredUntilKm(coords, route, data.stations) : route.length };
  renderTrip();
}
const durText = (min) => (min < 60 ? `${Math.round(min)} min` : `${Math.floor(min / 60)} h ${String(Math.round(min % 60)).padStart(2, "0")}`);
function tripStrip(rows, len, range, covered, destName) {
  const x0 = 16, x1 = 324, y = 34;
  const X = (km) => x0 + Math.max(0, Math.min(1, km / len)) * (x1 - x0);
  const mid = `strip-sew-${++sewId}`;
  const parts = [`<mask id="${mid}" maskUnits="userSpaceOnUse"><path class="sew sew-mask" pathLength="1" stroke-width="12" style="--sew-dur:800ms" d="M${x0 - 6} ${y}H${x1 + 8}"/></mask>`,
    `<g mask="url(#${mid})"><line class="strip-line" x1="${x0}" x2="${x1}" y1="${y}" y2="${y}"/>`];
  if (covered < len - 0.5) parts.push(`<line class="strip-nodata" x1="${X(covered).toFixed(1)}" x2="${x1}" y1="${y}" y2="${y}"/>`);
  if (range != null && range * 0.9 < len) parts.push(`<line class="strip-dry" x1="${X(range * 0.9).toFixed(1)}" x2="${x1}" y1="${y}" y2="${y}"/><text class="strip-note" x="${X(range * 0.9).toFixed(1)}" y="${y - 16}" text-anchor="middle">réserve</text>`);
  parts.push(`</g><circle class="strip-start" cx="${x0}" cy="${y}" r="5"/><circle class="strip-end pop" style="--pd:760ms" cx="${x1}" cy="${y}" r="6"/>`);
  const shown = rows.slice(0, 5).map((r, i) => ({ r, i, x: X(r.atKm) })).sort((a, b) => a.x - b.x);
  const levels = [0, -19, -38, -57]; // pastilles proches : on les étage au-dessus de la route
  const used = levels.map(() => []);
  for (const p of shown) {
    const li = Math.max(0, levels.findIndex((_, k) => used[k].every((x) => Math.abs(x - p.x) >= 19)));
    used[li].push(p.x);
    const cy = y + levels[li];
    parts.push(`<g class="strip-pin pop${p.i === 0 ? " is-best" : ""}${p.r.unreachable ? " is-dry" : ""}" style="--pd:${Math.round(120 + ((p.x - x0) / (x1 - x0)) * 700)}ms"><circle cx="${p.x.toFixed(1)}" cy="${cy}" r="9"/><text x="${p.x.toFixed(1)}" y="${cy + 4}" text-anchor="middle">${p.i + 1}</text></g>`);
  }
  parts.push(`<text class="strip-label" x="${x0 - 4}" y="${y + 24}">départ</text><text class="strip-label" x="${x1 + 4}" y="${y + 24}" text-anchor="end">${esc(destName)}</text>`);
  return `<svg class="trip-strip" viewBox="0 -34 340 102" role="img" aria-label="Les stations le long de la route, du départ à ${esc(destName)}">${parts.join("")}</svg>`;
}
function tripRowHTML(r, i, best, scale) {
  const s = r.station;
  const delta = r.total - best.total;
  const right = i === 0 ? "le moins cher" : delta < 0.005 ? "même total" : `+${eur.format(delta)}`;
  return `<li class="trip-row">
    <button type="button" class="alt-btn" data-open="${esc(s.id)}" aria-label="${i + 1}e, ${esc(stationName(s))}, ${priceSpoken(r.price)}, au kilomètre ${Math.round(r.atKm * scale)}, ${esc(right)}">
      <span class="rank" aria-hidden="true">${i + 1}</span>
      <span class="alt-name">${esc(stationName(s))}</span>
      <span class="alt-price">${priceHTML(r.price)}</span>
      <span class="alt-meta">${esc(placeShort(s))} · km ${Math.round(r.atKm * scale)}, ${r.detourKm < 0.3 ? "sur la route" : `détour ${kmText(r.detourKm)} km`}${r.unreachable ? ", hors d’autonomie" : ""}</span>
      <span class="alt-gap">${esc(right)}</span>
    </button>
    <button type="button" class="icon-btn trip-go" data-trip-go="${esc(s.id)}" aria-label="Itinéraire par ${esc(stationName(s))}">${icon("i-go")}</button>
  </li>`;
}
function renderTrip() {
  els.tripFrom.textContent = originLabel();
  els.tripRecent.innerHTML = state.trips.map((t, i) => `<button type="button" class="choice" data-trip-recent="${i}">${icon("i-flag")}${esc(tripName(t))}</button>`).join("");
  els.tripCorr.innerHTML = CORRIDORS.map((k) => `<button type="button" class="choice" data-trip-corr="${k}" aria-pressed="${state.tripCorr === k}">${k} km</button>`).join("");
  if (!trip) {
    els.tripMap.hidden = true;
    els.tripOut.innerHTML = `<p class="trip-intro">Indique ta destination : Plein Sud trace la route et classe les stations qui sont dessus, détour et autonomie compris.</p>`;
    return;
  }
  if (!data) return;
  const v = vehicle();
  const range = rangeOf(v);
  const scale = trip.distanceKm / Math.max(0.1, trip.route.length); // km de route par km du tracé
  const rows = stationsAlongRoute(data.stations, state.fuel, trip.route, {
    corridorKm: state.tripCorr, litres: litresToBuy(v), conso: Number(v.conso) || 0, rangeKm: range != null ? range / scale : null,
  });
  const destName = tripName(trip.dest);
  const covered = trip.coveredKm;
  const notes = [];
  if (trip.approx) notes.push(`${icon("i-caution")}Le serveur d’itinéraire ne répond pas : tracé à vol d’oiseau, kilomètres approximatifs.`);
  if (covered < trip.route.length - 0.5) notes.push(`${icon("i-caution")}Prix connus seulement dans l’Hérault et le Gard : rien après le km ${Math.round(covered * scale)}.`);
  let fuelNote;
  if (range == null) fuelNote = `<button type="button" class="linkish" data-open-settings>Indique le niveau de ton réservoir</button> pour savoir où t’arrêter au plus tard.`;
  else if (range * 0.9 >= trip.distanceKm) fuelNote = `Ton réservoir (environ ${range} km) suffit pour le trajet : arrête-toi là où c’est le moins cher.`;
  else fuelNote = `<b>Fais le plein avant le km ${Math.floor(range * 0.9)}</b> : ton autonomie est d’environ ${range} km.`;
  const best = rows[0];
  const nearestOnRoute = rows.length ? rows.reduce((a, b) => (b.detourKm < a.detourKm ? b : a)) : null;
  const gain = best && nearestOnRoute && nearestOnRoute !== best ? nearestOnRoute.total - best.total : 0;
  els.tripOut.innerHTML = `
    <article class="trip-sum">
      <h3>Vers ${esc(destName)}</h3>
      <p class="trip-facts">${Math.round(trip.distanceKm)} km${trip.durationMin ? ` · ${durText(trip.durationMin)}` : ""} · ${esc(fuelLabel())} · ${esc(v.short)}</p>
      <p class="trip-fuel">${fuelNote}</p>
      ${tripStrip(rows, trip.route.length, range != null ? range / scale : null, covered, destName)}
      ${notes.map((n) => `<p class="flag">${n}</p>`).join("")}
      ${best ? `<div class="trip-best">
          <p class="trip-best-name">${esc(stationName(best.station))}<small>${esc(placeShort(best.station))}, au km ${Math.round(best.atKm * scale)}, ${best.detourKm < 0.3 ? "sur la route" : `détour ${kmText(best.detourKm)} km`}</small></p>
          <p class="trip-best-price"><span class="num">${priceHTML(best.price)}</span> €/L · <b>${eur.format(best.total)}</b> plein + détour${gain > 0.05 ? `<br><span class="save">${eur.format(gain)} de moins que la plus proche de la route</span>` : ""}</p>
        </div>
        <button type="button" class="go" data-trip-go="${esc(best.station.id)}">${icon("i-go")}Y aller, puis ${esc(destName)}</button>` : `<p class="trip-empty">Aucune station avec un prix récent à moins de ${state.tripCorr} km de la route. Élargis l’écart ou change de carburant.</p>`}
      <button type="button" class="btn" data-trip-dest>${icon("i-flag")}Aller directement à ${esc(destName)}</button>
    </article>
    ${rows.length > 1 ? `<h2 class="next-title">Sur la route</h2><ol class="alts trip-list">${rows.slice(0, TRIP_LIST).map((r, i) => tripRowHTML(r, i, best, scale)).join("")}</ol>` : ""}
    <p class="hint">Détour estimé : aller-retour entre la route et la station, à vol d’oiseau x 1,4. Itinéraire : OSRM (données OpenStreetMap), adresses : Base Adresse Nationale.</p>`;
  renderTripMap(rows);
  for (const el of [els.tripOut, els.tripMap]) el.classList.toggle("sewing", tripFresh);
  if (tripFresh) setTimeout(() => { for (const el of [els.tripOut, els.tripMap]) el.classList.remove("sewing"); }, 1800);
  tripFresh = false;
}
let sewId = 0;
let tripFresh = false; // vrai juste après le calcul d'un trajet : la route se coud une fois
// Aperçu : carte MapLibre (départ, arrivée, stations) ; si le fond de carte ne charge pas, un croquis SVG du tracé.
let tripMap = null;
let tripMarkers = [];
function tripSketch(rows) {
  const W = 340, H = 220, pad = 30;
  const lat0 = trip.coords.reduce((s, c) => s + c[1], 0) / trip.coords.length;
  const kx = Math.cos((lat0 * Math.PI) / 180);
  const P = (lon, lat) => [lon * kx, -lat];
  const all = [...trip.coords.map((c) => P(c[0], c[1])), ...rows.slice(0, 5).map((r) => P(r.station.lon, r.station.lat))];
  const xs = all.map((p) => p[0]), ys = all.map((p) => p[1]);
  const x0 = Math.min(...xs), y0 = Math.min(...ys), w = Math.max(...xs) - x0 || 1e-6, h = Math.max(...ys) - y0 || 1e-6;
  const k = Math.min((W - 2 * pad) / w, (H - 2 * pad) / h);
  const X = (lon, lat) => ((P(lon, lat)[0] - x0) * k + (W - w * k) / 2).toFixed(1);
  const Y = (lon, lat) => ((P(lon, lat)[1] - y0) * k + (H - h * k) / 2).toFixed(1);
  const line = trip.coords.map((c) => `${X(c[0], c[1])} ${Y(c[0], c[1])}`).join(" L");
  const mid = `sk-sew-${++sewId}`;
  const order = rows.slice(0, 5).map((r) => r.atKm / Math.max(0.1, trip.route.length));
  const a = trip.coords[0], b = trip.coords.at(-1);
  const pins = rows.slice(0, 5).map((r, i) => `<g class="sk-pin pop${i === 0 ? " is-best" : ""}" style="--pd:${Math.round(150 + order[i] * 900)}ms"><circle cx="${X(r.station.lon, r.station.lat)}" cy="${Y(r.station.lon, r.station.lat)}" r="10"/><text x="${X(r.station.lon, r.station.lat)}" y="${(Number(Y(r.station.lon, r.station.lat)) + 4).toFixed(1)}" text-anchor="middle">${i + 1}</text></g>`).reverse().join("");
  return `<svg class="trip-sketch" viewBox="0 0 ${W} ${H}" role="img" aria-label="Croquis du trajet vers ${esc(tripName(trip.dest))} avec les stations">
    <mask id="${mid}" maskUnits="userSpaceOnUse"><path class="sew sew-mask" pathLength="1" stroke-width="14" style="--sew-dur:1100ms" d="M${line}"/></mask>
    <path class="sk-route" mask="url(#${mid})" d="M${line}"/>${pins}
    <circle class="sk-start" cx="${X(a[0], a[1])}" cy="${Y(a[0], a[1])}" r="6"/><circle class="sk-end pop" style="--pd:1050ms" cx="${X(b[0], b[1])}" cy="${Y(b[0], b[1])}" r="7"/>
    <text class="sk-label" x="${Number(X(a[0], a[1])) + 10}" y="${Number(Y(a[0], a[1])) - 8}">départ</text>
    <text class="sk-label" x="${Number(X(b[0], b[1])) - 10}" y="${Number(Y(b[0], b[1])) - 12}" text-anchor="end">${esc(tripName(trip.dest))}</text></svg>`;
}
function drawTripRoute() {
  if (!tripMap || !trip) return;
  const gj = { type: "Feature", geometry: { type: "LineString", coordinates: trip.coords } };
  const src = tripMap.getSource("route");
  if (src) return src.setData(gj);
  const thread = getComputedStyle(document.documentElement).getPropertyValue("--rose-thread").trim() || "#C2617F";
  const cloth = getComputedStyle(document.documentElement).getPropertyValue("--cloth").trim() || "#FBF7EE";
  tripMap.addSource("route", { type: "geojson", data: gj });
  tripMap.addLayer({ id: "route-halo", type: "line", source: "route", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": cloth, "line-width": 7, "line-opacity": 0.9 } });
  tripMap.addLayer({ id: "route-line", type: "line", source: "route", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": thread, "line-width": 3.2, "line-dasharray": [2, 1.6] } });
}
let sewRouteSeq = 0;
function sewTripRoute() {
  const src = tripMap?.getSource("route");
  if (!src || !trip) return;
  const { coords, route } = trip, seq = ++sewRouteSeq, t0 = performance.now(), D = 1800;
  const full = { type: "Feature", geometry: { type: "LineString", coordinates: coords } };
  const step = (now) => {
    if (seq !== sewRouteSeq || !tripMap || !trip) return;
    const p = Math.min(1, (now - t0) / D);
    if (p >= 1) return src.setData(full);
    const km = (p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2) * route.length;
    let i = route.cum.findIndex((c) => c > km);
    if (i < 0) i = coords.length - 1;
    if (i < 1) i = 1;
    const part = coords.slice(0, i);
    const f = (km - route.cum[i - 1]) / (route.cum[i] - route.cum[i - 1] || 1);
    part.push([coords[i - 1][0] + (coords[i][0] - coords[i - 1][0]) * f, coords[i - 1][1] + (coords[i][1] - coords[i - 1][1]) * f]);
    src.setData({ type: "Feature", geometry: { type: "LineString", coordinates: part } });
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
async function renderTripMap(rows) {
  const box = els.tripMap;
  box.hidden = false;
  try {
    maplib = maplib || (await loadMapLib());
    if (!baseStyle) baseStyle = await (await fetch(MAP_STYLE_URL)).json();
  } catch {
    if (tripMap) { tripMap.remove(); tripMap = null; }
    box.innerHTML = tripSketch(rows);
    return;
  }
  if (!tripMap) {
    box.innerHTML = "";
    tripMap = new maplib.Map({
      container: box, style: recolor(baseStyle, currentPalette()), center: [trip.dest.lon, trip.dest.lat], zoom: 8, attributionControl: { compact: true },
      cooperativeGestures: true,
      locale: { "CooperativeGesturesHandler.MobileHelpText": "Deux doigts pour déplacer la carte", "CooperativeGesturesHandler.WindowsHelpText": "Ctrl + molette pour zoomer", "CooperativeGesturesHandler.MacHelpText": "⌘ + molette pour zoomer" },
    });
    tripMap.on("style.load", drawTripRoute);
    document.addEventListener("themechange", () => tripMap?.setStyle(recolor(baseStyle, currentPalette())));
  }
  tripMap.resize();
  for (const m of tripMarkers) m.remove();
  tripMarkers = [];
  const a = trip.coords[0], b = trip.coords.at(-1);
  const start = document.createElement("div");
  start.className = "me-dot";
  const end = document.createElement("div");
  end.className = "pin-end";
  end.setAttribute("aria-label", tripName(trip.dest));
  const sewing = tripFresh;
  rows.slice(0, 5).map((r, i) => ({ r, i })).reverse().forEach(({ r, i }) => {
    const el = flowerPin(i + 1, i === 0);
    el.addEventListener("click", (e) => { e.stopPropagation(); openStation(r.station.id); });
    if (sewing) { el.classList.add("pop-in"); el.style.setProperty("--pd", `${Math.round(250 + (r.atKm / Math.max(0.1, trip.route.length)) * 1400)}ms`); }
    const holder = document.createElement("div");
    holder.append(el);
    tripMarkers.push(new maplib.Marker({ element: holder }).setLngLat([r.station.lon, r.station.lat]).addTo(tripMap));
  });
  // départ et arrivée en dernier : ils restent au-dessus des pastilles
  tripMarkers.push(new maplib.Marker({ element: start }).setLngLat(a).addTo(tripMap), new maplib.Marker({ element: end }).setLngLat(b).addTo(tripMap));
  if (tripMap.isStyleLoaded()) drawTripRoute(); else tripMap.once("load", drawTripRoute);
  // Le tracé se coud du départ vers l'arrivée : on dévoile la ligne point après point (les pointillés restent en place).
  if (sewing && !reduceMotion.matches) {
    const go = () => sewTripRoute();
    if (tripMap.isStyleLoaded()) go(); else tripMap.once("load", go);
  }
  const lons = [...trip.coords.map((c) => c[0]), ...rows.slice(0, 5).map((r) => r.station.lon)];
  const lats = [...trip.coords.map((c) => c[1]), ...rows.slice(0, 5).map((r) => r.station.lat)];
  tripMap.fitBounds([[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]], { padding: 40, duration: 0, maxZoom: 13 });
}
// Google Maps sait faire une étape : station puis destination. Plans et Waze : la station d'abord.
function tripNavUrl(app, s) {
  if (app !== "google" || !trip) return navUrl(app, s);
  const street = streetOf(s);
  const via = s.snap || !street ? `${s.lat},${s.lon}` : [street, [s.cp, titleCase(s.ville)].filter(Boolean).join(" ")].join(", ");
  return `https://www.google.com/maps/dir/?api=1&destination=${trip.dest.lat},${trip.dest.lon}&waypoints=${encodeURIComponent(via)}&travelmode=driving`;
}
function tripGo(id) {
  if (!trip) return go(id);
  const app = state.nav;
  if (app && app !== "google") toast(`${navLabel()} ne prend pas d’étape : direction la station. Ensuite, « Aller directement à ${tripName(trip.dest)} ».`);
  go(id, tripNavUrl);
}
els.tripTo.addEventListener("input", () => {
  clearTimeout(suggTimer);
  const q = els.tripTo.value.trim();
  if (q.length < 3) { els.tripSugg.hidden = true; return; }
  suggTimer = setTimeout(async () => {
    try {
      suggestions = await geocode(q);
    } catch {
      suggestions = [];
      els.tripSugg.innerHTML = `<li class="trip-sugg-msg">Recherche d’adresse indisponible (connexion ?)</li>`;
      els.tripSugg.hidden = false;
      return;
    }
    if (els.tripTo.value.trim() !== q) return;
    els.tripSugg.innerHTML = suggestions.length
      ? suggestions.map((g, i) => `<li role="option"><button type="button" data-trip-sugg="${i}">${esc(g.label)}<small>${esc(g.detail || "")}</small></button></li>`).join("")
      : `<li class="trip-sugg-msg">Aucun lieu trouvé</li>`;
    els.tripSugg.hidden = false;
  }, 280);
});
els.tripForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const q = els.tripTo.value.trim();
  if (q.length < 2) return;
  try {
    const found = suggestions.length ? suggestions : await geocode(q);
    if (found[0]) planTrip(found[0]);
    else els.tripOut.innerHTML = `<p class="trip-empty">Aucun lieu trouvé pour « ${esc(q)} ».</p>`;
  } catch {
    els.tripOut.innerHTML = `<p class="trip-empty">Recherche d’adresse indisponible : vérifie ta connexion.</p>`;
  }
});

// ---------- Toast ----------
let toastTimer = 0;
const TOAST_FLOWER = `<svg class="toast-flower" viewBox="0 0 26 30" aria-hidden="true"><path class="tf-stem" pathLength="1" d="M13 29C12.4 24 13.6 18 13 12"/>${[0, 72, 144, 216, 288].map((a, i) => `<path class="tf-petal" style="--i:${i}" pathLength="1" transform="rotate(${a} 13 9)" d="M13 8C10.8 6 10.8 2.4 13 1C15.2 2.4 15.2 6 13 8Z"/>`).join("")}<circle class="tf-core" cx="13" cy="9" r="2.1"/><path class="tf-leaf" style="--i:0" pathLength="1" d="M13 23C9.5 23.4 6.3 21.8 5 18.4C8.6 18 11.8 19.4 13 23Z"/><path class="tf-leaf" style="--i:1" pathLength="1" d="M13.2 20C16.4 20.2 19.4 18.8 20.8 15.6C17.4 15.2 14.4 16.6 13.2 20Z"/></svg>`;
function toast(text, action, { flower = false } = {}) {
  clearTimeout(toastTimer);
  // Un panneau ouvert est dans la couche du dessus : le message doit y être aussi pour rester touchable.
  const host = document.querySelector("dialog[open]") || document.body;
  if (els.toast.parentElement !== host) host.append(els.toast);
  els.toast.innerHTML = `${flower ? TOAST_FLOWER : ""}<span>${esc(text)}</span>${action ? `<button type="button">${esc(action.label)}</button>` : ""}`;
  els.toast.hidden = false;
  if (action) els.toast.querySelector("button").onclick = () => { action.run(); hideToast(); };
  requestAnimationFrame(() => els.toast.classList.add("show"));
  toastTimer = setTimeout(hideToast, action ? 8000 : 3500);
}
function hideToast() {
  els.toast.classList.remove("show");
  setTimeout(() => { if (!els.toast.classList.contains("show")) els.toast.hidden = true; }, 240);
}

// ---------- Événements ----------
els.fuels.addEventListener("click", (e) => {
  const b = e.target.closest("[data-fuel]");
  if (!b || b.dataset.fuel === state.fuel) return;
  state.fuel = b.dataset.fuel;
  els.logStation.innerHTML = "";
  update();
});
function openSettingsSheet() { renderSettings(); openSheet(els.settingsSheet); }
els.start.addEventListener("click", openSettingsSheet);
for (const t of document.querySelectorAll(".tabs [role=tab]")) t.addEventListener("click", () => showView(t.dataset.view));
// Position de départ sans glissement, puis le fil suit les changements d'onglet.
tabThread.style.transition = "none";
placeThread();
requestAnimationFrame(() => { tabThread.style.transition = ""; });
addEventListener("resize", placeThread);
els.showAll.addEventListener("click", () => { showAll = !showAll; renderRank(); });

document.addEventListener("click", (e) => {
  const goBtn = e.target.closest("[data-go]");
  if (goBtn) return go(goBtn.dataset.go);
  const open = e.target.closest("[data-open]");
  if (open) return openStation(open.dataset.open);
  const fav = e.target.closest("[data-fav]");
  if (fav) {
    const id = fav.dataset.fav;
    state.favs = isFav(id) ? state.favs.filter((x) => x !== id) : [...state.favs, id];
    save();
    for (const b of document.querySelectorAll(`[data-fav="${CSS.escape(id)}"]`)) {
      b.setAttribute("aria-pressed", String(isFav(id)));
      b.setAttribute("aria-label", isFav(id) ? "Retirer des favoris" : "Ajouter aux favoris");
      if (!reduceMotion.matches) b.animate([{ transform: "scale(0.88)" }, { transform: "none" }], { duration: 220, easing: EASE_OUT });
    }
    toast(isFav(id) ? "Ajoutée aux favoris" : "Retirée des favoris");
    if (view === "fav") renderFavs();
    return;
  }
  const share = e.target.closest("[data-share]");
  if (share) {
    const s = stationById(share.dataset.share);
    const p = s?.prices[state.fuel]?.[0];
    navigator.share?.({
      title: `Plein Sud · ${stationName(s)}`,
      text: `${fuelLabel()} à ${p ? commaNum(p, 3) + " €" : "?"} : ${stationName(s)}, ${titleCase(s.ville)}`,
      url: navUrl("google", s),
    }).catch(() => {});
    return;
  }
  const logHere = e.target.closest("[data-log-here]");
  if (logHere) {
    closeSheet(els.stationSheet);
    showView("log");
    fillLogForm(logHere.dataset.logHere);
    return;
  }
  if (e.target.closest("[data-open-settings]")) return openSettingsSheet();
  if (e.target.closest("[data-ride]")) return openRide();
  const vg = e.target.closest("[data-view-go]");
  if (vg) return showView(vg.dataset.viewGo);
  const tg = e.target.closest("[data-trip-go]");
  if (tg) return tripGo(tg.dataset.tripGo);
  if (e.target.closest("[data-trip-dest]")) return trip && go("dest", navUrl, { id: "dest", lat: trip.dest.lat, lon: trip.dest.lon, snap: 1 });
  const tr = e.target.closest("[data-trip-recent]");
  if (tr) return planTrip(state.trips[Number(tr.dataset.tripRecent)]);
  const ts = e.target.closest("[data-trip-sugg]");
  if (ts) return planTrip(suggestions[Number(ts.dataset.tripSugg)]);
  const tc = e.target.closest("[data-trip-corr]");
  if (tc) { state.tripCorr = Number(tc.dataset.tripCorr); save(); return renderTrip(); }
  if (e.target.closest("[data-widen]")) { state.radius = Math.min(state.radius + 10, 40); return update(); }
  const del = e.target.closest("[data-del]");
  if (del) {
    const idx = state.log.findIndex((x) => x.id === del.dataset.del);
    if (idx < 0) return;
    const [removed] = state.log.splice(idx, 1);
    save();
    renderLog();
    toast("Plein supprimé", { label: "Annuler", run: () => { state.log.splice(idx, 0, removed); save(); renderLog(); } });
  }
});

for (const dlg of [els.stationSheet, els.settingsSheet, els.navSheet]) {
  enableDragToClose(dlg);
  dlg.addEventListener("click", (e) => { if (e.target.closest("[data-close]")) closeSheet(dlg); });
  dlg.addEventListener("cancel", (e) => { e.preventDefault(); closeSheet(dlg); });
}
els.navSheet.addEventListener("click", (e) => {
  const b = e.target.closest("[data-nav-app]");
  if (!b || !pendingNavStation) return;
  if (els.navRemember.checked) { state.nav = b.dataset.navApp; save(); renderAnswer(); }
  closeSheet(els.navSheet);
  if (pendingNavUrl === tripNavUrl && b.dataset.navApp !== "google" && trip) toast(`Pas d’étape possible ici : direction la station. Ensuite, « Aller directement à ${tripName(trip.dest)} ».`);
  launchNav(b.dataset.navApp, pendingNavStation, pendingNavUrl);
});
els.settingsSheet.addEventListener("click", (e) => {
  const place = e.target.closest("[data-place]");
  if (place) { state.placeId = place.dataset.place; renderSettings(); return update(); }
  const prof = e.target.closest("[data-profile]");
  if (prof) {
    state.profileId = prof.dataset.profile;
    const own = state.vehicles.find((v) => v.id === state.profileId);
    if (own?.fuel && data?.fuels[own.fuel]) state.fuel = own.fuel;
    vehEditing = null;
    renderSettings();
    return update();
  }
  if (e.target.closest("[data-veh-add]")) return openVehForm("new");
  const th = e.target.closest("[data-theme-pref]");
  if (th) { state.theme = th.dataset.themePref; save(); window.pleinSudTheme?.apply(state.theme); return renderSettings(); }
  const nav = e.target.closest("[data-nav-pref]");
  if (nav) { state.nav = nav.dataset.navPref || null; renderSettings(); return update(); }
});
els.useGps.addEventListener("click", () => locate({ fromUser: true }));
els.radius.addEventListener("input", () => { state.radius = Number(els.radius.value); els.radiusOut.textContent = `${state.radius} km`; update(); });
function openVehForm(which) {
  vehEditing = which;
  const v = which === "new" ? { label: "", litres: 14, conso: 5, fuel: state.fuel } : state.vehicles.find((x) => x.id === which);
  els.vehName.value = v.label;
  els.vehYear.value = v.year || "";
  autoDirty = { litres: false, conso: false };
  for (const el of [els.vehLitres, els.vehConso]) el.classList.remove("autofilled");
  els.vehMatch.hidden = true;
  els.vehLitres.value = litresText(v.litres);
  els.vehConso.value = commaNum(Number(v.conso), 1);
  els.vehFuel.innerHTML = FUEL_ORDER.filter((f) => data?.fuels[f]).map((f) => `<option value="${f}"${f === (v.fuel || state.fuel) ? " selected" : ""}>${esc(data.fuels[f].label)}</option>`).join("");
  els.vehHint.hidden = true;
  renderSettings();
  els.vehName.focus();
}
function saveVehicle() {
  const litres = parseNum(els.vehLitres.value);
  const conso = parseNum(els.vehConso.value);
  if (!(litres > 0 && litres < 200)) return vehError("Le réservoir doit être entre 1 et 199 litres.");
  if (!(conso > 0 && conso < 30)) return vehError("La consommation doit être entre 0,1 et 30 L/100 km.");
  const yearText = els.vehYear.value.trim();
  const year = yearText ? Number(yearText) : null;
  if (year !== null && !(Number.isInteger(year) && year >= 1950 && year <= new Date().getFullYear() + 1)) return vehError("L’année doit être entre 1950 et l’an prochain.");
  const label = els.vehName.value.trim().slice(0, 24) || "Mon véhicule";
  const fuel = els.vehFuel.value;
  if (vehEditing === "new") {
    const id = newVehicleId();
    state.vehicles.push({ id, label, year, litres, conso, fuel });
    state.profileId = id;
  } else {
    const v = state.vehicles.find((x) => x.id === vehEditing);
    Object.assign(v, { label, year, litres, conso, fuel, short: label === v.label ? v.short : undefined });
  }
  if (fuel && data?.fuels[fuel]) state.fuel = fuel;
  vehEditing = null;
  renderSettings();
  update();
}
function vehError(msg) { els.vehHint.textContent = msg; els.vehHint.hidden = false; }
els.vehModels.innerHTML = catalogNames().map((n) => `<option value="${esc(n)}"></option>`).join("");
els.vehSave.addEventListener("click", saveVehicle);
els.vehCancel.addEventListener("click", () => { vehEditing = null; renderSettings(); });
els.vehEdit.addEventListener("click", () => openVehForm(state.profileId));
els.vehDelete.addEventListener("click", () => {
  const idx = state.vehicles.findIndex((x) => x.id === vehEditing);
  const removed = state.vehicles[idx];
  const prevProfile = state.profileId;
  toast(`« ${removed.label} » supprimé`, { label: "Annuler", run: () => {
    state.vehicles.splice(idx, 0, removed);
    state.profileId = prevProfile;
    if (els.settingsSheet.open) renderSettings();
    update();
  } });
  state.vehicles = state.vehicles.filter((x) => x.id !== vehEditing);
  if (state.profileId === vehEditing) state.profileId = state.vehicles[0].id;
  vehEditing = null;
  renderSettings();
  update();
});
// Pré-remplissage : le nom et l'année reconnus remplissent réservoir et conso,
// sauf si tu as déjà tapé ces cases toi-même. Les cases remplies seules sont mises en évidence.
let autoDirty = { litres: false, conso: false };
function autofill() {
  const m = matchVehicle(els.vehName.value, els.vehYear.value);
  if (!m) { els.vehMatch.hidden = true; return; }
  const fill = (el, key, value) => {
    if (autoDirty[key]) return;
    el.value = key === "litres" ? litresText(value) : commaNum(value, 1);
    el.classList.remove("autofilled");
    void el.offsetWidth; // relance l'animation
    el.classList.add("autofilled");
  };
  fill(els.vehLitres, "litres", m.tank);
  fill(els.vehConso, "conso", m.conso);
  const years = m.to ? `${m.from}–${m.to}` : `depuis ${m.from}`;
  const why = m.yearUsed ? `modèle ${years}` : `année non reconnue, génération ${years}`;
  els.vehMatch.textContent = `Reconnu : ${m.name} (${why}). ${m.source ? `Source : ${m.source}.` : "Valeurs indicatives, vérifie-les."}`;
  els.vehMatch.hidden = false;
}
els.vehName.addEventListener("input", autofill);
els.vehYear.addEventListener("input", autofill);
for (const [el, key] of [[els.vehLitres, "litres"], [els.vehConso, "conso"]]) {
  el.addEventListener("input", () => { autoDirty[key] = true; el.classList.remove("autofilled"); });
}
for (const input of [els.vehName, els.vehYear, els.vehLitres, els.vehConso]) {
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); saveVehicle(); } });
}
els.settingsForm.addEventListener("submit", (e) => { e.preventDefault(); closeSheet(els.settingsSheet); });

els.logStation.addEventListener("change", syncLogPrice);
els.logLitres.addEventListener("input", previewLog);
els.logPrice.addEventListener("input", previewLog);
let lastLogAt = 0;
els.logTotal.addEventListener("click", (e) => {
  const b = e.target.closest("[data-use-conso]");
  if (!b) return;
  const v = rawVehicle();
  if (v) { v.conso = Number(b.dataset.useConso); update(); renderLog(); toast(`Conso de « ${v.label} » mise à ${commaNum(v.conso, 1)} L/100 km`); }
});
els.logForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const s = stationById(els.logStation.value);
  const median = data.fuels[state.fuel]?.median;
  const litres = parseNum(els.logLitres.value);
  const price = parseNum(els.logPrice.value);
  if (Date.now() - lastLogAt < 1500) return; // double tap
  if (!s || !median || !(litres >= 1 && litres <= 200) || !(price > 0.3 && price < 5)) {
    els.logPreview.textContent = "Vérifie les valeurs : entre 1 et 200 litres, et un prix au litre entre 0,30 et 5 €.";
    return;
  }
  const kmText0 = els.logKm.value.trim();
  const km = kmText0 ? parseNum(kmText0) : null;
  if (km !== null && !(Number.isInteger(km) && km >= 0 && km < 2000000)) {
    els.logPreview.textContent = "Le kilométrage doit être un nombre entier, par exemple 12340 (ou laisse vide).";
    return;
  }
  state.log.unshift({
    id: `${Date.now()}`, date: new Date().toISOString(), stationId: s.id, ville: stationName(s), vehicleId: rawVehicle()?.id,
    fuel: state.fuel, fuelLabel: fuelLabel(), litres, price, median, gain: Math.round((median - price) * litres * 100) / 100, km,
  });
  markTankFull();
  els.logKm.value = "";
  lastLogAt = Date.now();
  els.logLitres.value = "";
  save();
  renderLog();
  toast("Plein ajouté au carnet", null, { flower: true });
});
els.fillYes.addEventListener("click", () => {
  const s = fillStation;
  hideFillCard();
  showView("log");
  fillLogForm(s?.id);
  els.logLitres.focus();
});
els.fillNo.addEventListener("click", hideFillCard);
els.e10Hint.addEventListener("click", () => { state.fuel = "e10"; update(); });
els.fillScrim.addEventListener("click", hideFillCard);
// Un seul geste : le plein est noté avec les litres du véhicule et le prix affiché par la station.
els.fillQuick.addEventListener("click", () => {
  const s = fillStation;
  const p = s?.prices[state.fuel]?.[0];
  const median = data.fuels[state.fuel]?.median;
  if (!s || !p || !median) return;
  const litres = Number(vehicle().litres);
  const entry = {
    id: `${Date.now()}`, date: new Date().toISOString(), stationId: s.id, ville: stationName(s), vehicleId: rawVehicle()?.id,
    fuel: state.fuel, fuelLabel: fuelLabel(), litres, price: p, median, gain: Math.round((median - p) * litres * 100) / 100, km: null,
  };
  state.log.unshift(entry);
  markTankFull();
  save();
  hideFillCard();
  if (view === "log") renderLog();
  toast(entry.gain >= 0 ? `Plein noté : ${eur.format(entry.gain)} économisés` : "Plein noté dans ton carnet", {
    label: "Annuler", run: () => { state.log = state.log.filter((x) => x.id !== entry.id); save(); if (view === "log") renderLog(); },
  }, { flower: true });
  renderSavings();
});
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    if (els.ride.open) keepAwake();
    if (state.gps) startWatch();
    if (loadedAt && Date.now() - loadedAt > 30 * 60 * 1000) refreshData({ quiet: true }); // retour après 30 min : prix rechargés en silence
    checkReturnFromNav();
  } else {
    stopWatch(); // on garde le début de présence à la station : il compte encore au retour
  }
});

// ---------- Données : chargement et « tirer pour actualiser » ----------
let loadedAt = 0;
let dataOffline = false; // vrai si le relevé vient du cache faute de réseau
async function loadData() {
  const res = await fetch("data/latest.json", { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  dataOffline = res.headers.get("x-plein-sud-offline") === "1";
  const next = await res.json();
  for (const [f, name] of Object.entries(FUEL_NAMES)) if (next.fuels[f]) next.fuels[f].label = name;
  data = next;
  loadedAt = Date.now();
}

let refreshing = false;
async function refreshData({ quiet = false } = {}) {
  if (refreshing) return;
  refreshing = true;
  const before = data?.generated_at;
  try {
    await loadData();
    renderFuels();
    render();
    renderFresh();
    if (view === "fav") renderFavs();
    if (view === "log") renderLog();
    if (view === "map") renderMap();
    if (!before) stitchIn(800);
    loadHistory();
    const when = ago(new Date(data.generated_at));
    if (!quiet) toast(dataOffline ? `Hors ligne : prix du dernier relevé (${when})`
      : data.generated_at === before ? `Déjà à jour : prix relevés ${when}` : `Prix mis à jour : relevés ${when}`);
  } catch {
    if (!quiet) toast("Pas de connexion : les prix n’ont pas changé");
  } finally {
    refreshing = false;
  }
}

// Le geste : en haut de page, tirer vers le bas coud la fleur pétale par pétale ;
// passé le seuil, le nœud central apparaît (« relâche ») ; au relâcher, la fleur tourne pendant le chargement.
const PTR_GO = 72;
const PTR_MAX = 116;
const ptrEl = $("ptr");
const ptrText = $("ptrText");
const viewsEl = $("views");
let ptrStart = null;
let ptrPull = 0;
let ptrArmed = false;
function setPull(px, settle = false) {
  ptrPull = px;
  const p = Math.min(1, px / PTR_GO);
  for (const el of [ptrEl, viewsEl]) el.classList.toggle("ptr-settle", settle);
  ptrEl.style.setProperty("--pull", px.toFixed(1));
  ptrEl.style.setProperty("--p", p.toFixed(3));
  viewsEl.style.transform = px > 0 ? `translateY(${px.toFixed(1)}px)` : "";
  const armed = px >= PTR_GO;
  if (armed && !ptrArmed && navigator.vibrate) navigator.vibrate(12);
  ptrArmed = armed;
  ptrEl.classList.toggle("is-armed", armed);
  if (!ptrEl.classList.contains("is-loading")) ptrText.textContent = armed ? "Relâche pour actualiser" : "Tire pour actualiser";
}
const ptrBlocked = () => refreshing || view === "map" || document.activeElement?.closest?.(".trip-map") || window.scrollY > 0 || document.querySelector("dialog[open]");
document.addEventListener("touchstart", (e) => {
  ptrStart = !ptrBlocked() && !e.target.closest?.(".trip-map") && e.touches.length === 1 ? e.touches[0].clientY : null;
}, { passive: true });
document.addEventListener("touchmove", (e) => {
  if (ptrStart === null) return;
  const dy = e.touches[0].clientY - ptrStart;
  if (window.scrollY > 0) { ptrStart = null; return setPull(0, true); }
  // On tire vers le bas depuis le haut : c'est notre geste, pas celui du navigateur
  // (Safari rechargerait toute la page). Ailleurs, le défilement normal reste intact.
  if (dy > 0 && e.cancelable) e.preventDefault();
  setPull(Math.max(0, Math.min(PTR_MAX, dy * 0.5)));
}, { passive: false });
document.addEventListener("touchend", async () => {
  if (ptrStart === null) return;
  ptrStart = null;
  if (ptrPull < PTR_GO) return setPull(0, true);
  setPull(PTR_GO, true);
  ptrEl.classList.add("is-loading");
  ptrText.textContent = "Actualisation…";
  const started = Date.now();
  await refreshData();
  await new Promise((r) => setTimeout(r, Math.max(0, 600 - (Date.now() - started)))); // le temps de voir la fleur tourner
  ptrEl.classList.remove("is-loading");
  setPull(0, true);
});
document.addEventListener("touchcancel", () => { if (ptrStart !== null) { ptrStart = null; setPull(0, true); } });

// ---------- Démarrage ----------

// ---------- Amis : prix signalés sur place ----------
let friendReports = [];
let friendsInfo = null; // { pseudo, code }
let friendsMsg = "";
const REPORT_NAMES = { sp95: "SP95-E5", e10: "SP95-E10", sp98: "SP98", gazole: "Gazole", e85: "E85", gplc: "GPLc" };
async function loadReports() {
  if (!fr.hasProfile()) return;
  try { friendReports = await fr.reports(80); } catch { /* hors ligne : on garde l'ancien */ }
}
function reportBlock(s) {
  const f = state.fuel;
  if (!s.prices[f]) return "";
  const mine = friendReports.filter((r) => r.station_id === s.id && r.fuel === f).slice(0, 3);
  const seen = mine.map((r) => `<li><b>${esc(r.mine ? "Toi" : r.pseudo)}</b> ${r.kind === "correct" ? "a relevé" : "a confirmé"} ${priceHTML(Number(r.price))} <small>${ago(new Date(r.created_at))}</small></li>`).join("");
  return `<section class="st-report" aria-label="Signaler le prix sur place">
    ${seen ? `<ul class="rep-list">${seen}</ul>` : ""}
    <p class="rep-title">Sur place, ${esc(REPORT_NAMES[f] || f)} ?</p>
    <div class="rep-btns">
      <button type="button" class="btn" data-rep="confirm" data-rep-st="${esc(s.id)}">${icon("i-flag")}C’est bien ${s.prices[f][0].toFixed(3).replace(".", ",")} €</button>
      <button type="button" class="btn" data-rep="other" data-rep-st="${esc(s.id)}">Prix différent</button>
    </div>
    <form class="rep-form" hidden data-rep-form="${esc(s.id)}"><input type="text" inputmode="decimal" autocomplete="off" placeholder="1,789" aria-label="Prix relevé en euros par litre"><button class="btn btn-main" type="submit">Envoyer</button></form>
  </section>`;
}
async function sendReport(stationId, price, kind) {
  if (!fr.hasProfile()) { toast("Crée d’abord ton profil d’ami pour signaler un prix."); return openFriends(); }
  try {
    await fr.report({ station_id: stationId, fuel: state.fuel, price, kind });
    toast(`Merci : ${REPORT_NAMES[state.fuel] || state.fuel} à ${String(price.toFixed(3)).replace(".", ",")} signalé à tes amis.`, null, { flower: true });
    await loadReports();
    if (els.stationSheet.open) openStation(stationId);
  } catch (e) { toast(`Pas envoyé : ${e.message}`); }
}
els.stationSheet.addEventListener("click", (e) => {
  const b = e.target.closest("[data-rep]");
  if (!b) return;
  const s = stationById(b.dataset.repSt);
  if (!s) return;
  if (b.dataset.rep === "confirm") return sendReport(s.id, s.prices[state.fuel][0], "confirm");
  const form = els.stationSheet.querySelector("[data-rep-form]");
  form.hidden = false;
  form.querySelector("input").focus();
});
els.stationSheet.addEventListener("submit", (e) => {
  const form = e.target.closest("[data-rep-form]");
  if (!form) return;
  e.preventDefault();
  const v = Number(form.querySelector("input").value.replace(",", ".").trim());
  if (!(v >= 0.5 && v <= 4)) return toast("Prix en euros par litre, par exemple 1,789.");
  sendReport(form.dataset.repForm, Math.round(v * 1000) / 1000, "correct");
});

const friendsBody = $("friendsBody");
async function openFriends() {
  openSheet($("friendsSheet"));
  await renderFriends();
}
async function renderFriends() {
  if (!fr.hasProfile()) {
    friendsBody.innerHTML = `<p class="fr-lede">Choisis un pseudo : tes amis te retrouvent avec un code, sans e-mail ni mot de passe. Ils voient seulement tes pleins signalés (station, carburant, prix), jamais ta position.</p>
      <form class="fr-form" id="frCreate"><input id="frPseudo" type="text" maxlength="20" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Ton pseudo" aria-label="Pseudo"><button class="btn btn-main" type="submit">Créer mon profil</button></form>
      <p class="hint" id="frMsg" role="alert"${friendsMsg ? "" : " hidden"}>${esc(friendsMsg)}</p>`;
    return;
  }
  friendsBody.innerHTML = `<p class="trip-wait">Chargement…</p>`;
  try {
    const [me, list] = await Promise.all([friendsInfo ? friendsInfo : fr.profile(), fr.friends(), loadReports()]);
    friendsInfo = me;
    const incoming = list.filter((f) => f.status === "pending" && f.incoming);
    const waiting = list.filter((f) => f.status === "pending" && !f.incoming);
    const ok = list.filter((f) => f.status === "accepted");
    const feed = friendReports.slice(0, 12).map((r) => {
      const s = stationById(r.station_id);
      return `<li><b>${esc(r.mine ? "Toi" : r.pseudo)}</b> · ${esc(s ? stationName(s) : "station hors zone")} · ${esc(REPORT_NAMES[r.fuel] || r.fuel)} ${priceHTML(Number(r.price))} <small>${ago(new Date(r.created_at))}</small></li>`;
    }).join("");
    friendsBody.innerHTML = `
      <p class="fr-me">Tu es <b>${esc(me.pseudo)}</b>. Ton code d’invitation :</p>
      <div class="fr-code"><output>${esc(me.code)}</output>${navigator.share ? `<button class="icon-btn" type="button" data-fr-share aria-label="Partager mon code">${icon("i-share")}</button>` : ""}</div>
      <form class="fr-form" id="frAdd"><input id="frCode" type="text" maxlength="8" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="Code d’un ami" aria-label="Code d’un ami"><button class="btn btn-main" type="submit">Ajouter</button></form>
      <p class="hint" id="frMsg" role="alert"${friendsMsg ? "" : " hidden"}>${esc(friendsMsg)}</p>
      ${incoming.length ? `<h3 class="fr-h">Demandes reçues</h3><ul class="fr-list">${incoming.map((f) => `<li><span>${esc(f.pseudo)}</span><button class="btn btn-main" type="button" data-fr-yes="${f.user_id}">Accepter</button><button class="btn btn-text" type="button" data-fr-no="${f.user_id}">Refuser</button></li>`).join("")}</ul>` : ""}
      <h3 class="fr-h">Amis</h3>
      ${ok.length || waiting.length ? `<ul class="fr-list">${ok.map((f) => `<li><span>${esc(f.pseudo)}</span><button class="btn btn-text" type="button" data-fr-del="${f.user_id}">Retirer</button></li>`).join("")}${waiting.map((f) => `<li><span>${esc(f.pseudo)} <small>en attente</small></span><button class="btn btn-text" type="button" data-fr-del="${f.user_id}">Annuler</button></li>`).join("")}</ul>` : `<p class="muted">Pas encore d’ami. Envoie ton code, ou entre le sien ci-dessus.</p>`}
      <h3 class="fr-h">Derniers prix signalés</h3>
      ${feed ? `<ul class="rep-list">${feed}</ul>` : `<p class="muted">Rien pour l’instant. Sur la fiche d’une station, « C’est bien … » confirme le prix pour tes amis.</p>`}`;
    friendsMsg = "";
  } catch (e) {
    friendsBody.innerHTML = `<p class="hint" role="alert">${esc(e.message)}</p><button class="btn" type="button" id="frRetry">Réessayer</button>`;
  }
}
async function frAct(fn) {
  friendsMsg = "";
  try { await fn(); } catch (e) { friendsMsg = e.message; }
  renderFriends();
}
friendsBody.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (e.target.id === "frCreate") {
    const pseudo = $("frPseudo").value.trim();
    try { friendsInfo = await fr.signUp(pseudo); friendsMsg = ""; } catch (err) { friendsMsg = err.message; }
    return renderFriends();
  }
  if (e.target.id === "frAdd") {
    const code = $("frCode").value;
    return frAct(async () => { const p = await fr.addFriend(code); friendsMsg = `Demande envoyée à ${p}.`; });
  }
});
friendsBody.addEventListener("click", (e) => {
  const t = (a) => e.target.closest(`[${a}]`);
  if (t("data-fr-yes")) return frAct(() => fr.respond(t("data-fr-yes").dataset.frYes, true));
  if (t("data-fr-no")) return frAct(() => fr.respond(t("data-fr-no").dataset.frNo, false));
  if (t("data-fr-del")) return frAct(() => fr.removeFriend(t("data-fr-del").dataset.frDel));
  if (t("data-fr-share")) return navigator.share({ title: "Plein Sud", text: `Mon code Plein Sud : ${friendsInfo.code}` }).catch(() => {});
  if (e.target.closest("#frRetry")) return renderFriends();
});
$("openFriends").addEventListener("click", () => { closeSheet(els.settingsSheet); openFriends(); });

async function boot() {
  els.answerBody.innerHTML = `<div class="ans-head"><p class="ans-name">Plein Sud</p><p class="ans-ville">On cherche le meilleur plein autour de toi…</p></div>`;
  renderStart();
  if (state.placeId === "gps") locate(); // la position est demandée dès l'ouverture
  try {
    await loadData();
  } catch {
    els.answerBody.innerHTML = `<div class="ans-head"><p class="ans-name">Prix indisponibles</p><p class="ans-ville">Impossible de charger les prix. Vérifie ta connexion puis recharge la page.</p></div>`;
    return;
  }
  renderFuels();
  render();
  renderFresh();
  stitchIn(1100);
  loadHistory();
  // Démonstration du pop-up de plein : ouvrir le site avec #demo-plein
  if (location.hash === "#demo-plein" && ranked[0]) setTimeout(() => showFillCard(ranked[0].station), 1500);
  // Raccourcis (écran d'accueil Android, favori) : #go lance l'itinéraire vers la n°1, #plein ouvre le carnet.
  const hash = location.hash;
  if (["#go", "#plein", "#guidon", "#trajet"].includes(hash)) history.replaceState(null, "", location.pathname + location.search);
  if (hash === "#plein") showView("log");
  if (hash === "#trajet") showView("trip");
  if (hash === "#guidon") {
    for (let i = 0; i < 25 && locating; i++) await new Promise((r) => setTimeout(r, 150));
    render();
    openRide();
  }
  if (hash === "#go") {
    for (let i = 0; i < 25 && locating; i++) await new Promise((r) => setTimeout(r, 150)); // on attend la position (4 s au plus)
    const first = ranked.find((r) => !r.unreachable) || ranked[0];
    if (first && state.nav) { navTarget = { id: first.station.id, at: Date.now() }; location.href = navUrl(state.nav, first.station); }
    else if (first) go(first.station.id);
  }
}

boot().then(loadReports);
setTimeout(() => document.documentElement.classList.remove("intro"), 1400);

if ("serviceWorker" in navigator && location.protocol === "https:") {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
