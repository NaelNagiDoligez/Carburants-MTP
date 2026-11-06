import * as fr from "./friends.js";
import { rankStations, haversineKm, isOutOfStock, ROAD_FACTOR } from "./rank.js";
import { matchVehicle, catalogNames } from "./catalog.js";
import * as zone from "./zone.js";
import { prepareRoute, stationsAlongRoute, coveredUntilKm, thin } from "./trip.js";
import { trendSVG, trendWords, fmt3 } from "./chart.js";

// ---------- Constantes ----------
// Point de départ de secours (position refusée, rien d'enregistré) : le centre de Montpellier. Jamais proposé comme lieu.
const FALLBACK_PLACE = { id: "default", label: "Place de la Comédie", short: "la Comédie", lat: 43.6084, lon: 3.8796 };
const MAX_PLACES = 6;
// Véhicules de départ : de simples véhicules comme les autres (modifiables, supprimables).
const SEEDS = [
  { id: "mt450", label: "CFMoto 450MT", short: "450MT", litres: 14, conso: 4.5 },
  { id: "scooter", label: "Scooter 125", short: "Scooter", litres: 6, conso: 2.8 },
  { id: "car", label: "Voiture", short: "Voiture", litres: 40, conso: 6.5 },
];
// Tant qu'aucun véhicule n'est ajouté : une voiture moyenne (45 L, 6,5 L/100 km), et l'appli propose d'en ajouter un.
const NO_VEHICLE = { id: "none", label: "Mon véhicule", short: "Véhicule", litres: 45, conso: 6.5 };
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
  fuel: "sp95", placeId: "gps", places: [], gps: null, profileId: "", vehicles: [], seeded: true, vehAsked: false,
  radius: 15, favs: [], log: [], nav: null, fillSeen: {}, theme: "auto", trips: [], savedTrips: [], dep: null, favDep: {}, tripCorr: 2,
};
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");
const isDark = () => document.documentElement.dataset.theme === "dark";
const EASE_OUT = "cubic-bezier(0.23, 1, 0.32, 1)";
const EASE_IN_OUT = "cubic-bezier(0.77, 0, 0.175, 1)";

// ---------- État ----------
let backupT = 0;
let backupSig = "";
let backupAt = 0;
let restoring = false;
let state = loadState();
state.places = Array.isArray(state.places) ? state.places : [];
if (state.placeId !== "gps" && !state.places.some((p) => p.id === state.placeId)) state.placeId = "gps"; // anciens lieux prédéfinis
const placeById = (id) => state.places.find((p) => p.id === id);
let data = null;
let ranked = [];
let view = "rank";
let firstRender = true;
let lastLeadKey = "";
let locating = false;
let locFailed = false; // la position a été refusée ou est introuvable, et on n'en a aucune autre
let showAll = false;
let watchId = null;
let gpsStale = false; // vrai si la position utilisée est l'ancienne, faute de GPS
let placeEditing = null, placePick = null, placeSeq = 0;
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
    for (const k of ["favs", "log", "trips", "savedTrips"]) if (!Array.isArray(merged[k])) merged[k] = [];
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
    return merged;
  } catch {
    return structuredClone(DEFAULTS);
  }
}
function save() {
  backupSoon();
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
  placeForm: $("placeForm"), placeName: $("placeName"), placeAddr: $("placeAddr"), placeSugg: $("placeSugg"), placeHint: $("placeHint"), placeDelete: $("placeDelete"),
  vehForm: $("vehForm"), vehName: $("vehName"), vehLitres: $("vehLitres"), vehConso: $("vehConso"), vehFuel: $("vehFuel"), vehHint: $("vehHint"), vehYear: $("vehYear"), vehMatch: $("vehMatch"), vehModels: $("vehModels"),
  vehSave: $("vehSave"), vehCancel: $("vehCancel"), vehDelete: $("vehDelete"), radius: $("radius"), radiusOut: $("radiusOut"),
  useGps: $("useGps"), useGpsText: $("useGpsText"), gpsHint: $("gpsHint"), toast: $("toast"),
  savings: $("savings"), trend: $("trend"), trendBody: $("trendBody"), themePref: $("themePref"), themeHint: $("themeHint"),
  tripForm: $("tripForm"), tripFrom: $("tripFrom"), tripTo: $("tripTo"), tripSugg: $("tripSugg"), tripRecent: $("tripRecent"), tripSaved: $("tripSaved"), tripSave: $("tripSave"), tripCorr: $("tripCorr"), tripOut: $("tripOut"), tripMap: $("tripMap"),
  ride: $("ride"), rideRank: $("rideRank"), rideName: $("rideName"), ridePrice: $("ridePrice"), rideMeta: $("rideMeta"), rideGo: $("rideGo"), rideNext: $("rideNext"), rideClose: $("rideClose"),
  fillCard: $("fillCard"), fillText: $("fillText"), fillQuick: $("fillQuick"), fillYes: $("fillYes"), fillNo: $("fillNo"), hapticLabel: $("hapticLabel"),
};

// ---------- Modèle ----------
function origin() {
  if (state.placeId === "gps" && state.gps) return state.gps;
  return placeById(state.placeId) || FALLBACK_PLACE;
}
function originLabel() {
  if (state.placeId === "gps") return state.gps ? "ta position" : "la Comédie";
  return (placeById(state.placeId) || FALLBACK_PLACE).short;
}
const LEVEL_TTL = 48 * 3600000; // un niveau noté il y a plus de 48 h n'est plus utilisé
function vehicle() {
  const v = state.vehicles.find((x) => x.id === state.profileId) || state.vehicles[0] || NO_VEHICLE;
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
const stationById = (id) => data?.stations.find((s) => s.id === id) || zone.known.get(id);
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
  const where = state.placeId === "gps" ? (state.gps ? "Ta position" : "Comédie") : (placeById(state.placeId) || FALLBACK_PLACE).short;
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

// Signature : le bouquet se coud pièce par pièce, comme une vraie broderie : d'abord les tiges (du pied vers le haut),
// puis les fleurs pétale après pétale, puis les feuilles, enfin les petites boucles de fil.
function bouquetRole(el) {
  const c = el.classList;
  if (el.tagName !== "path") return "flower";
  if (c.contains("t-sky") || (c.contains("stitch") && !c.contains("t-sage"))) return "curl";
  if (c.contains("t-sage")) return c.contains("satin") || (c.contains("w1") && !c.contains("stitch")) ? "leaf" : "stem";
  if (c.contains("t-lav") && c.contains("w15")) return "stem";
  return "flower";
}
function growBouquet(g, k = 1) {
  const parts = { stem: [], flower: [], leaf: [], curl: [] };
  for (const el of g.children) parts[bouquetRole(el)].push(el);
  const plan = { stem: [0, 650, 130], flower: [600, 380, Math.min(55, 700 / Math.max(1, parts.flower.length))], leaf: [1250, 380, Math.min(70, 450 / Math.max(1, parts.leaf.length))], curl: [1550, 420, 60] };
  for (const [role, list] of Object.entries(parts)) {
    const [start0, dur0, gap0] = plan[role];
    const [start, dur, gap] = [start0 * k, dur0 * k, gap0 * k];
    list.forEach((el, n) => {
      const delay = start + n * gap;
      const o = { duration: dur, delay, easing: EASE_OUT, fill: "backwards" };
      if (el.tagName === "path" && !el.classList.contains("stitch")) {
        el.setAttribute("pathLength", "1");
        el.style.strokeDasharray = "1 1";
        el.animate([{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], o).finished.then(() => { el.style.strokeDasharray = ""; }).catch(() => {});
        if (el.classList.contains("satin") || el.classList.contains("satin-rose")) el.animate([{ fillOpacity: 0 }, { fillOpacity: 1 }], { ...o, delay: delay + dur * 0.55, duration: dur * 0.6 });
      } else if (el.tagName === "path") {
        el.animate([{ opacity: 0 }, { opacity: 1 }], { ...o, duration: dur * 1.2 });
      } else if (el.tagName === "circle") {
        el.style.transformBox = "fill-box";
        el.style.transformOrigin = "center";
        el.animate([{ opacity: 0, scale: ".3" }, { opacity: 1, scale: "1" }], { ...o, duration: 300 }).finished.then(() => { el.style.transformBox = ""; el.style.transformOrigin = ""; }).catch(() => {});
      } else {
        // Ellipses (boutons de lavande) : elles portent une rotation dans l'attribut transform, qu'un « transform-box » ou un « scale » déplacerait. Fondu seulement.
        el.animate([{ opacity: 0 }, { opacity: 1 }], { ...o, duration: 300 });
      }
    });
  }
}
let lastGrow = -1e6;
function stitchIn(duration) {
  const svg = els.answer.querySelector(".bouquet");
  const g = svg?.querySelector(".stitches");
  if (!g) return;
  svg.classList.remove("pending");
  if (reduceMotion.matches) { g.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300, easing: "ease" }); return; }
  // Une seule broderie à la fois : un deuxième appel (données rechargées, station différente) ne doit pas effacer puis refaire.
  if (performance.now() - lastGrow < 3200) return;
  lastGrow = performance.now();
  for (const an of g.getAnimations({ subtree: true })) an.cancel();
  growBouquet(g, duration >= 800 ? 1 : 0.5);
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
function update() { save(); render(); ensureDept(); if (!needZone()) closeZoneGate(); }

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
// Glisser vers le bas pour fermer : au doigt depuis n'importe où dans le panneau quand son contenu est tout en haut
// (sinon on fait défiler le contenu), à la souris depuis la poignée ou l'en-tête.
function enableDragToClose(dlg) {
  const sheet = dlg.querySelector(".sheet");
  const scrim = dlg.querySelector(".scrim");
  let y0 = 0, x0 = 0, t0 = 0, dy = 0, mode = "idle", fromHandle = false;
  const follow = (d) => {
    dy = d;
    sheet.style.transform = `translateY(${d}px)`;
    if (scrim) scrim.style.opacity = String(Math.max(0, 1 - d / Math.max(sheet.offsetHeight, 1)));
  };
  const release = (v) => {
    const close = dy > 110 || v > 0.6;
    sheet.style.transition = "";
    sheet.style.transform = "";
    if (scrim) { scrim.style.transition = ""; scrim.style.opacity = ""; }
    mode = "idle";
    if (close) closeSheet(dlg);
  };
  dlg.addEventListener("touchstart", (e) => {
    if (e.touches.length !== 1 || !e.target.closest(".sheet")) { mode = "idle"; return; }
    y0 = e.touches[0].clientY; x0 = e.touches[0].clientX; t0 = e.timeStamp; dy = 0;
    fromHandle = !!e.target.closest(".grabber, .sheet-head");
    mode = e.target.closest("input[type=range]") ? "idle" : "armed";
  }, { passive: true });
  dlg.addEventListener("touchmove", (e) => {
    if (mode === "idle") return;
    const t = e.touches[0];
    const d = t.clientY - y0;
    if (mode === "armed") {
      if (Math.abs(t.clientX - x0) > Math.abs(d)) { mode = "idle"; return; } // geste horizontal
      if (d > 6 && (fromHandle || sheet.scrollTop <= 0)) {
        mode = "drag";
        sheet.style.transition = "none";
        if (scrim) scrim.style.transition = "none";
        y0 = t.clientY; t0 = e.timeStamp; // on repart de zéro : pas de saut
      } else if (d < -6 || sheet.scrollTop > 0) { mode = "idle"; return; }
      else return;
    }
    e.preventDefault();
    follow(Math.max(0, t.clientY - y0));
  }, { passive: false });
  const end = (e) => {
    if (mode !== "drag") { mode = "idle"; return; }
    release(dy / Math.max(e.timeStamp - t0, 1));
  };
  dlg.addEventListener("touchend", end);
  dlg.addEventListener("touchcancel", end);
  // Souris : poignée et en-tête.
  dlg.addEventListener("pointerdown", (e) => {
    if (e.pointerType !== "mouse" || !e.target.closest(".grabber, .sheet-head") || e.target.closest("button, a, input")) return;
    mode = "mouse"; y0 = e.clientY; t0 = e.timeStamp; dy = 0;
    sheet.style.transition = "none";
    sheet.setPointerCapture(e.pointerId);
  });
  dlg.addEventListener("pointermove", (e) => { if (mode === "mouse") follow(Math.max(0, e.clientY - y0)); });
  const mend = (e) => { if (mode === "mouse") release(dy / Math.max(e.timeStamp - t0, 1)); };
  dlg.addEventListener("pointerup", mend);
  dlg.addEventListener("pointercancel", mend);
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
  const pen = `<svg class="ic ic-edit" aria-hidden="true"><use href="#i-edit"/></svg>`;
  els.places.innerHTML = state.places.map((p) => `<button type="button" class="choice" data-place="${p.id}" aria-pressed="${state.placeId === p.id}">${esc(p.label)}${p.city ? `<small>${esc(p.city)}</small>` : ""}${state.placeId === p.id ? pen : ""}</button>`).join("")
    + (state.places.length < MAX_PLACES ? `<button type="button" class="choice choice-add" data-place-add><svg class="ic" aria-hidden="true"><use href="#i-plus"/></svg>Ajouter un lieu</button>` : "");
  els.placeForm.hidden = placeEditing === null;
  els.placeDelete.hidden = placeEditing === null || placeEditing === "new";
  const current = vehicle().id;
  els.profiles.innerHTML = state.vehicles.map((v) => `<button type="button" class="choice" data-profile="${v.id}" aria-pressed="${current === v.id}">${esc(v.label)}<small>${v.year ? `${v.year}, ` : ""}${litresText(v.litres)} L, ${commaNum(Number(v.conso), 1)} L/100</small>${current === v.id ? pen : ""}</button>`).join("")
    + `<button type="button" class="choice choice-add" data-veh-add><svg class="ic" aria-hidden="true"><use href="#i-plus"/></svg>Ajouter un véhicule</button>`;
  renderLevel();
  $("levelBox").hidden = !state.vehicles.length;
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
    locFailed = true;
    zoneHelpText("Ton navigateur ne donne pas accès à la position : indique une adresse de départ.");
    if (needZone()) openZoneGate();
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
      locFailed = false;
      state.placeId = "gps";
      hint("");
      if (els.settingsSheet.open) renderSettings();
      update();
      startWatch();
    },
    (err) => {
      locating = false;
      locFailed = true;
      const msg = err.code === 1
        ? `Position refusée. ${locHelp()}`
        : "Position introuvable pour l'instant (pas de signal ?). Réessaie, ou choisis un lieu.";
      zoneHelpText(msg);
      if (state.placeId === "gps" && !state.gps) { /* l'écran « Où es-tu ? » prend le relais */ }
      else if (state.placeId === "gps" && state.gps) { // on repart de la dernière position connue : on le dit
        gpsStale = true;
        const when = state.gps.at ? ` (${ago(new Date(state.gps.at))})` : "";
        toast(`Position introuvable : classement depuis ta dernière position${when}`);
      }
      if (fromUser) hint(`${msg}${err.code === 1 ? " Ou choisis un lieu enregistré." : ""}`);
      if (els.settingsSheet.open) renderSettings();
      render();
      if (needZone()) openZoneGate();
    },
    { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 },
  );
}
// Une fois la position refusée, le navigateur ne la redemande plus : seul l'utilisateur peut la rouvrir, dans ses réglages.
function locHelp() {
  return isIOS
    ? "Sur iPhone : Réglages > Confidentialité et sécurité > Service de localisation > Safari > « Lors de l’utilisation » (ou, dans Safari, bouton aA > Réglages du site web > Position > Autoriser)."
    : "Touche le cadenas (ou les réglages) à côté de l’adresse du site > Autorisations > Position > Autoriser.";
}
const needZone = () => state.placeId === "gps" && !state.gps && locFailed;
function zoneHelpText(text) {
  const el = $("zoneHelp");
  if (!el) return;
  el.textContent = text;
  el.hidden = !text;
}
function openZoneGate() {
  const gate = $("zoneGate");
  if (!gate || gate.open) return;
  gate.showModal();
  requestAnimationFrame(() => gate.classList.add("is-open"));
}
function closeZoneGate() {
  const gate = $("zoneGate");
  if (!gate?.open) return;
  gate.classList.remove("is-open");
  setTimeout(() => { gate.close(); askFirstVehicle(); }, 260);
}
$("zoneGate")?.addEventListener("cancel", (e) => e.preventDefault()); // impossible de fermer avec Échap : l'appli en a besoin
$("zoneLocate")?.addEventListener("click", () => {
  zoneHelpText("");
  const wasData = !!data;
  locate({ fromUser: true });
  if (!wasData) { const t = setInterval(() => { if (state.gps) { clearInterval(t); location.reload(); } else if (!locating) clearInterval(t); }, 300); }
});
// Adresse de départ à défaut de position : elle devient un lieu enregistré, choisi comme point de départ.
let zoneList = [], zoneSeq = 0, zoneTimer = 0;
$("zoneAddr")?.addEventListener("input", () => {
  clearTimeout(zoneTimer);
  const q = $("zoneAddr").value.trim();
  const sugg = $("zoneSugg");
  if (q.length < 3) { sugg.hidden = true; return; }
  const seq = ++zoneSeq;
  zoneTimer = setTimeout(async () => {
    try { zoneList = await geocode(q); } catch {
      sugg.innerHTML = `<li class="trip-sugg-msg">Recherche d’adresse indisponible (connexion ?)</li>`; sugg.hidden = false; return;
    }
    if (seq !== zoneSeq) return;
    sugg.innerHTML = zoneList.length
      ? zoneList.map((g, i) => `<li role="option"><button type="button" data-zone-sugg="${i}">${esc(g.label)}<small>${esc(g.detail || "")}</small></button></li>`).join("")
      : `<li class="trip-sugg-msg">Aucun lieu trouvé</li>`;
    sugg.hidden = false;
  }, 280);
});
$("zoneSugg")?.addEventListener("click", (e) => {
  const b = e.target.closest("[data-zone-sugg]");
  if (!b) return;
  const g = zoneList[Number(b.dataset.zoneSugg)];
  const label = (g.short || "Mon lieu").slice(0, 24);
  const existing = state.places.find((p) => p.lat === g.lat && p.lon === g.lon);
  const rec = existing || { id: "p" + Date.now().toString(36), label, short: label.slice(0, 14), address: g.label, city: g.short || "", lat: g.lat, lon: g.lon };
  if (!existing) state.places.push(rec);
  state.placeId = rec.id;
  save();
  if (!data) return location.reload(); // l'appli n'avait pas encore pu démarrer : on repart avec ce lieu
  update();
});
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
  syncSavings();
  els.savings.hidden = !(n && total >= 0.5);
  if (els.savings.hidden) return;
  els.savings.innerHTML = `<b>${eur.format(savingsShown)}</b> économisés avec Plein Sud<small>sur ${n} plein${n > 1 ? "s" : ""} noté${n > 1 ? "s" : ""}, par rapport au prix médian de la zone · voir le carnet</small>`;
  countSavings(total);
}

// ---------- Courbe des prix et prévision ----------
let priceHistory = null;
async function loadHistory() {
  try {
    if (data?.dep) priceHistory = (await zone.fetchHistory(data.dep)) || priceHistory;
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
// Score de fiabilité : la prévision rejouée dans le passé, comparée aux prix réellement observés.
const centimes = (eurL) => `${(eurL * 100).toFixed(1).replace(".", ",")} c`;
function reliabilityText(bt, days) {
  if (!bt) return `Fiabilité pas encore mesurable : ${days} jours de relevés, il en faut un peu plus.`;
  const better = bt.mae <= bt.naive_mae;
  return `Vérifiée sur ${bt.n} cas passés : écart moyen ${centimes(bt.mae)}/L, prix réel dans la fourchette ${Math.round(bt.coverage * 100)} % du temps. `
    + (better ? `Mieux que « le prix ne bouge pas » (${centimes(bt.naive_mae)}).` : `Pour l’instant, « le prix ne bouge pas » fait mieux (${centimes(bt.naive_mae)}) : à prendre avec des pincettes.`);
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
    ${fc ? `<p class="trend-score"><span class="exp-tag">Expérimental</span>${reliabilityText(h.backtest, h.days.length)}</p>` : ""}
    <p class="hint"><a href="coulisses.html#prevision">Comment la prévision est calculée et vérifiée</a></p>`;
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
// Le bouquet de l'accueil, recopié dans le mode guidon : il s'y coud à chaque ouverture.
function rideBouquet() {
  let b = els.ride.querySelector(".bouquet");
  if (!b) {
    const src = document.querySelector(".answer .bouquet");
    if (!src) return;
    b = src.cloneNode(true);
    b.classList.remove("pending");
    b.querySelector("defs")?.remove();
    els.ride.prepend(b);
  }
  const g = b.querySelector(".stitches");
  if (g && !reduceMotion.matches) growBouquet(g, 0.8);
}
function openRide() {
  if (!data) return;
  rideIdx = 0;
  renderRide();
  if (!els.ride.open) {
    els.ride.showModal();
    rideBouquet();
  }
  keepAwake();
}
function closeRide() {
  const done = () => {
    if (els.ride.open) els.ride.close();
    wakeLock?.release?.().catch?.(() => {});
    wakeLock = null;
  };
  if (!els.ride.open || reduceMotion.matches) return done();
  const a = els.ride.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 220, easing: "ease-in", fill: "forwards" });
  a.finished.then(() => { done(); a.cancel(); }, done);
}
els.rideClose.addEventListener("click", closeRide);
els.ride.addEventListener("close", () => { wakeLock?.release?.().catch?.(() => {}); wakeLock = null; });
els.rideNext.addEventListener("click", () => {
  rideIdx++;
  renderRide();
  // Le prix apparaît en fondu, le nom et les détails se posent juste après.
  if (reduceMotion.matches) return void $("rideCard").animate([{ opacity: 0.2 }, { opacity: 1 }], { duration: 250 });
  els.ridePrice.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 260, easing: "ease-out" });
  [els.rideName, els.rideMeta].forEach((el, i) => el.animate([{ opacity: 0, transform: "translateY(8px)" }, { opacity: 1, transform: "none" }], { duration: 380, delay: 100 + i * 70, easing: EASE_OUT, fill: "backwards" }));
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
  const o = state.placeId === "gps" ? state.gps : placeById(state.placeId); // proche de soi si on sait où l'on est
  const res = await fetch(`https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(q)}&limit=5${o ? `&lat=${o.lat}&lon=${o.lon}` : ""}`);
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
  // Les prix des départements traversés (le tien est déjà là) : quelques petits fichiers, chargés en parallèle.
  const deps = zone.routeDeps(coords);
  const more = deps.filter((d) => d !== data?.dep);
  if (more.length) els.tripOut.innerHTML = `<p class="trip-wait">On charge les prix le long de la route (${deps.length} départements)…</p>`;
  await Promise.all(more.map((d) => zone.fetchDept(d).catch(() => null)));
  if (seq !== tripSeq) return;
  const pool = zone.pool([...new Set([data?.dep, ...deps].filter(Boolean))]);
  tripFresh = true;
  trip = { dest, ...r, coords, route, pool, loadedDeps: deps.length, coveredKm: pool.length ? coveredUntilKm(coords, route, pool) : 0 };
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
// ---- Trajets enregistrés : à refaire plus tard, ou prévus pour un jour précis ----
let tripSaving = false;
const dayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const whenText = (w) => {
  if (!w) return "";
  const diff = Math.round((new Date(`${w}T12:00`) - new Date(`${dayKey()}T12:00`)) / 86400000);
  if (diff === 0) return "aujourd’hui";
  if (diff === 1) return "demain";
  const d = new Date(`${w}T12:00`).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });
  return diff < 0 ? `était prévu ${d}` : `prévu ${d}`;
};
function sortedSaved() {
  const today = dayKey();
  const rank = (t) => (t.when && t.when >= today ? 0 : t.when ? 2 : 1);
  return [...state.savedTrips].sort((a, b) => rank(a) - rank(b) || (a.when && b.when ? a.when.localeCompare(b.when) : (b.savedAt || 0) - (a.savedAt || 0)));
}
function renderSavedTrips() {
  const list = sortedSaved();
  els.tripSaved.hidden = !list.length;
  els.tripSaved.innerHTML = list.length ? `<p class="trip-saved-h">Mes trajets</p>` + list.map((t) => `<div class="saved-row${t.when && t.when < dayKey() ? " past" : ""}">
      <button type="button" class="saved-main" data-saved-go="${esc(t.id)}">${icon("i-flag")}<span><b>${esc(tripName(t.dest))}</b>${t.when ? `<small>${esc(whenText(t.when))}</small>` : ""}</span></button>
      <button type="button" class="icon-btn" data-saved-del="${esc(t.id)}" aria-label="Retirer ${esc(tripName(t.dest))} de mes trajets">${icon("i-close")}</button></div>`).join("") : "";
}
function renderTripSave() {
  if (!trip) { els.tripSave.hidden = true; return; }
  els.tripSave.hidden = false;
  const saved = state.savedTrips.find((t) => t.dest.label === trip.dest.label);
  if (saved) {
    els.tripSave.innerHTML = `<p class="trip-saved-ok">${icon("i-flag")}Trajet enregistré${saved.when ? ` · ${esc(whenText(saved.when))}` : ""}</p>`;
  } else if (!tripSaving) {
    els.tripSave.innerHTML = `<button type="button" class="btn" data-trip-save>${icon("i-plus")}Enregistrer ce trajet</button>`;
  } else {
    els.tripSave.innerHTML = `<div class="veh-form"><label class="field" for="tripWhen"><span>Pour quand ? <span class="opt-tag">(facultatif)</span></span><input id="tripWhen" type="date" min="${dayKey()}"></label>
      <p class="hint">Laisse vide pour garder ce trajet sans date.</p>
      <div class="veh-actions"><button type="button" class="btn btn-main" data-trip-save-ok>Enregistrer</button><button type="button" class="btn" data-trip-save-cancel>Annuler</button></div></div>`;
  }
}
function renderTrip() {
  renderSavedTrips();
  renderTripSave();
  els.tripFrom.textContent = originLabel();
  els.tripRecent.innerHTML = state.trips.map((t, i) => `<span class="choice-group"><button type="button" class="choice" data-trip-recent="${i}">${icon("i-flag")}${esc(tripName(t))}</button><button type="button" class="choice-x" data-trip-recent-del="${i}" aria-label="Retirer ${esc(tripName(t))} des trajets récents">${icon("i-close")}</button></span>`).join("");
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
  const rows = stationsAlongRoute(trip.pool || data.stations, state.fuel, trip.route, {
    corridorKm: state.tripCorr, litres: litresToBuy(v), conso: Number(v.conso) || 0, rangeKm: range != null ? range / scale : null,
  });
  const destName = tripName(trip.dest);
  const covered = trip.coveredKm;
  const notes = [];
  if (trip.approx) notes.push(`${icon("i-caution")}Le serveur d’itinéraire ne répond pas : tracé à vol d’oiseau, kilomètres approximatifs.`);
  if (covered < trip.route.length - 0.5) notes.push(`${icon("i-caution")}Aucune station avec un prix récent trouvée après le km ${Math.round(covered * scale)}.`);
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
  if (routeHold) gj.geometry.coordinates = [trip.coords[0], trip.coords[0]]; // la ligne attend que la carte soit prête pour se coudre
  const cloth = getComputedStyle(document.documentElement).getPropertyValue("--cloth").trim() || "#FBF7EE";
  tripMap.addSource("route", { type: "geojson", data: gj });
  tripMap.addLayer({ id: "route-halo", type: "line", source: "route", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": cloth, "line-width": 7, "line-opacity": 0.9 } });
  tripMap.addLayer({ id: "route-line", type: "line", source: "route", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": thread, "line-width": 3.2, "line-dasharray": [2, 1.6] } });
}
let sewRouteSeq = 0;
let routeHold = false;
function sewTripRoute() {
  const src = tripMap?.getSource("route");
  if (!src || !trip) return;
  const { coords, route } = trip, seq = ++sewRouteSeq, D = 2200;
  routeHold = false;
  for (const m of tripMarkers) { const pin = m.getElement().firstChild; if (pin?.classList?.contains("pin-hold")) { pin.classList.remove("pin-hold"); pin.classList.add("pop-in"); } }
  const t0 = performance.now();
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
    if (sewing) { el.classList.add(reduceMotion.matches ? "pop-in" : "pin-hold"); el.style.setProperty("--pd", `${Math.round(300 + (r.atKm / Math.max(0.1, trip.route.length)) * 1700)}ms`); }
    const holder = document.createElement("div");
    holder.append(el);
    tripMarkers.push(new maplib.Marker({ element: holder }).setLngLat([r.station.lon, r.station.lat]).addTo(tripMap));
  });
  // départ et arrivée en dernier : ils restent au-dessus des pastilles
  tripMarkers.push(new maplib.Marker({ element: start }).setLngLat(a).addTo(tripMap), new maplib.Marker({ element: end }).setLngLat(b).addTo(tripMap));
  if (tripMap.isStyleLoaded()) drawTripRoute(); else tripMap.once("load", drawTripRoute);
  // Le tracé se coud du départ vers l'arrivée : on dévoile la ligne point après point (les pointillés restent en place).
  if (sewing && !reduceMotion.matches) {
    // On attend que la carte ait fini de dessiner ses tuiles (« idle »), sinon la couture se joue avant qu'on la voie.
    routeHold = true;
    let started = false;
    const go = () => { if (started) return; started = true; setTimeout(sewTripRoute, 250); };
    tripMap.once("idle", go);
    setTimeout(go, 4000);
  }
  const lons = [...trip.coords.map((c) => c[0]), ...rows.slice(0, 5).map((r) => r.station.lon)];
  const lats = [...trip.coords.map((c) => c[1]), ...rows.slice(0, 5).map((r) => r.station.lat)];
  tripMap.fitBounds([[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]], { padding: 40, duration: 0, maxZoom: 13 });
}
// Google Maps et Plans savent faire une étape : station puis destination. Waze : la station d'abord.
function tripNavUrl(app, s) {
  if (!trip || (app !== "google" && app !== "apple")) return navUrl(app, s);
  const street = streetOf(s);
  const via = s.snap || !street ? `${s.lat},${s.lon}` : [street, [s.cp, titleCase(s.ville)].filter(Boolean).join(" ")].join(", ");
  // Plans : un « daddr » par arrêt, dans l'ordre (station puis destination).
  if (app === "apple") return `https://maps.apple.com/?dirflg=d&daddr=${encodeURIComponent(via)}&daddr=${trip.dest.lat},${trip.dest.lon}`;
  return `https://www.google.com/maps/dir/?api=1&destination=${trip.dest.lat},${trip.dest.lon}&waypoints=${encodeURIComponent(via)}&travelmode=driving`;
}
function tripGo(id) {
  if (!trip) return go(id);
  const app = state.nav;
  if (app && app !== "google" && app !== "apple") toast(`${navLabel()} ne prend pas d’étape : direction la station. Ensuite, « Aller directement à ${tripName(trip.dest)} ».`);
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

// Favori : l'étoile se pose d'un petit tour, quelques pétales s'envolent ; en retirant, elle se replie doucement.
function starPop(btn, added) {
  const ic = btn.querySelector(".ic");
  if (!added) return void ic?.animate([{ transform: "scale(1)" }, { transform: "scale(.7)" }, { transform: "scale(1)" }], { duration: 260, easing: EASE_OUT });
  ic?.animate([
    { transform: "scale(.5) rotate(-50deg)", offset: 0 },
    { transform: "scale(1.45) rotate(14deg)", offset: 0.55 },
    { transform: "scale(.92) rotate(-4deg)", offset: 0.8 },
    { transform: "scale(1) rotate(0)", offset: 1 },
  ], { duration: 560, easing: EASE_OUT });
  const host = btn.closest("dialog") || document.body;
  const r = btn.getBoundingClientRect();
  const box = document.createElement("div");
  box.className = "fav-burst";
  box.style.cssText = `left:${r.left + r.width / 2}px;top:${r.top + r.height / 2}px`;
  const colors = ["--rose-thread", "--ochre", "--coral", "--lav", "--sage", "--rose-thread", "--ochre"];
  colors.forEach((c, i) => {
    const p = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    p.setAttribute("viewBox", "0 0 20 28");
    p.innerHTML = `<path d="M10 27C2 20 2 7 10 1C18 7 18 20 10 27Z"/>`;
    p.style.color = `var(${c})`;
    box.append(p);
    const ang = (i / colors.length) * Math.PI * 2 - Math.PI / 2 + (Math.random() - 0.5) * 0.4;
    const dist = 34 + Math.random() * 16;
    const rot = Math.round(ang * 57.3 + 90);
    p.animate([
      { transform: `translate(-50%,-50%) rotate(${rot}deg) scale(.3)`, opacity: 0 },
      { transform: `translate(calc(-50% + ${Math.cos(ang) * dist * 0.7}px),calc(-50% + ${Math.sin(ang) * dist * 0.7}px)) rotate(${rot + 30}deg) scale(1)`, opacity: 1, offset: 0.35 },
      { transform: `translate(calc(-50% + ${Math.cos(ang) * dist}px),calc(-50% + ${Math.sin(ang) * dist + 10}px)) rotate(${rot + 80}deg) scale(.7)`, opacity: 0 },
    ], { duration: 640, easing: EASE_OUT, fill: "forwards" });
  });
  host.append(box);
  setTimeout(() => box.remove(), 700);
}
document.addEventListener("click", (e) => {
  const goBtn = e.target.closest("[data-go]");
  if (goBtn) return go(goBtn.dataset.go);
  const open = e.target.closest("[data-open]");
  if (open) return openStation(open.dataset.open);
  const fav = e.target.closest("[data-fav]");
  if (fav) {
    const id = fav.dataset.fav;
    state.favs = isFav(id) ? state.favs.filter((x) => x !== id) : [...state.favs, id];
    if (isFav(id) && stationById(id)?.dep) state.favDep[id] = stationById(id).dep;
    save();
    for (const b of document.querySelectorAll(`[data-fav="${CSS.escape(id)}"]`)) {
      b.setAttribute("aria-pressed", String(isFav(id)));
      b.setAttribute("aria-label", isFav(id) ? "Retirer des favoris" : "Ajouter aux favoris");
      if (b === fav && !reduceMotion.matches) starPop(b, isFav(id));
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
  if (e.target.closest("[data-trip-save]")) { tripSaving = true; renderTripSave(); return; }
  if (e.target.closest("[data-trip-save-cancel]")) { tripSaving = false; renderTripSave(); return; }
  if (e.target.closest("[data-trip-save-ok]")) {
    const when = $("tripWhen").value || null;
    state.savedTrips = [{ id: "t" + Date.now().toString(36), dest: trip.dest, when, savedAt: Date.now() }, ...state.savedTrips].slice(0, 20);
    tripSaving = false;
    save();
    renderSavedTrips(); renderTripSave();
    return toast(when ? `Trajet enregistré, ${whenText(when)}` : "Trajet enregistré");
  }
  const sg = e.target.closest("[data-saved-go]");
  if (sg) { const t = state.savedTrips.find((x) => x.id === sg.dataset.savedGo); return t && planTrip(t.dest); }
  const sd = e.target.closest("[data-saved-del]");
  if (sd) {
    const idx = state.savedTrips.findIndex((x) => x.id === sd.dataset.savedDel);
    const removed = state.savedTrips[idx];
    state.savedTrips.splice(idx, 1);
    save(); renderSavedTrips(); renderTripSave();
    return toast(`« ${tripName(removed.dest)} » retiré`, { label: "Annuler", run: () => { state.savedTrips.splice(idx, 0, removed); save(); renderSavedTrips(); renderTripSave(); } });
  }
  const trd = e.target.closest("[data-trip-recent-del]");
  if (trd) {
    const idx = Number(trd.dataset.tripRecentDel);
    const removed = state.trips[idx];
    if (!removed) return;
    state.trips.splice(idx, 1);
    save(); renderTrip();
    return toast(`« ${tripName(removed)} » retiré`, { label: "Annuler", run: () => { state.trips.splice(idx, 0, removed); save(); renderTrip(); } });
  }
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

for (const dlg of [els.stationSheet, els.settingsSheet, els.navSheet, $("friendsSheet")]) {
  enableDragToClose(dlg);
  dlg.addEventListener("click", (e) => { if (e.target.closest("[data-close]")) closeSheet(dlg); });
  dlg.addEventListener("cancel", (e) => { e.preventDefault(); closeSheet(dlg); });
}
els.navSheet.addEventListener("click", (e) => {
  const b = e.target.closest("[data-nav-app]");
  if (!b || !pendingNavStation) return;
  if (els.navRemember.checked) { state.nav = b.dataset.navApp; save(); renderAnswer(); }
  closeSheet(els.navSheet);
  if (pendingNavUrl === tripNavUrl && !["google", "apple"].includes(b.dataset.navApp) && trip) toast(`Pas d’étape possible ici : direction la station. Ensuite, « Aller directement à ${tripName(trip.dest)} ».`);
  launchNav(b.dataset.navApp, pendingNavStation, pendingNavUrl);
});
els.settingsSheet.addEventListener("click", (e) => {
  const place = e.target.closest("[data-place]");
  if (place) {
    if (state.placeId === place.dataset.place) return openPlaceForm(place.dataset.place); // retoucher le lieu choisi
    state.placeId = place.dataset.place; placeEditing = null; renderSettings(); return update();
  }
  if (e.target.closest("[data-place-add]")) return openPlaceForm("new");
  const prof = e.target.closest("[data-profile]");
  if (prof) {
    if (prof.dataset.profile === state.profileId) return openVehForm(state.profileId); // retoucher le véhicule choisi
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
els.useGps.addEventListener("click", () => { placeEditing = null; renderSettings(); locate({ fromUser: true }); });
// ---- Lieux enregistrés (domicile, travail…) ----
function openPlaceForm(which) {
  placeEditing = which;
  const p = which === "new" ? null : placeById(which);
  els.placeName.value = p?.label || "";
  els.placeAddr.value = p?.address || "";
  placePick = p ? { lat: p.lat, lon: p.lon, label: p.address, short: p.city } : null;
  els.placeSugg.hidden = true;
  els.placeHint.hidden = true;
  renderSettings();
  (p ? els.placeName : els.placeAddr).focus();
}
els.placeAddr.addEventListener("input", () => {
  placePick = null;
  clearTimeout(suggTimer);
  const q = els.placeAddr.value.trim();
  if (q.length < 3) { els.placeSugg.hidden = true; return; }
  const seq = ++placeSeq;
  suggTimer = setTimeout(async () => {
    let list = [];
    try { list = await geocode(q); } catch {
      els.placeSugg.innerHTML = `<li class="trip-sugg-msg">Recherche d’adresse indisponible (connexion ?)</li>`;
      els.placeSugg.hidden = false;
      return;
    }
    if (seq !== placeSeq) return;
    placeList = list;
    els.placeSugg.innerHTML = list.length
      ? list.map((g, i) => `<li role="option"><button type="button" data-place-sugg="${i}">${esc(g.label)}<small>${esc(g.detail || "")}</small></button></li>`).join("")
      : `<li class="trip-sugg-msg">Aucun lieu trouvé</li>`;
    els.placeSugg.hidden = false;
  }, 280);
});
let placeList = [];
els.placeSugg.addEventListener("click", (e) => {
  const b = e.target.closest("[data-place-sugg]");
  if (!b) return;
  placePick = placeList[Number(b.dataset.placeSugg)];
  els.placeAddr.value = placePick.label;
  els.placeName.placeholder = placePick.short || "Nom du lieu";
  els.placeSugg.hidden = true;
  els.placeHint.hidden = true;
});
$("placeSave").addEventListener("click", () => {
  if (!placePick) { els.placeHint.textContent = "Choisis une adresse dans la liste proposée."; els.placeHint.hidden = false; return; }
  const label = els.placeName.value.trim().slice(0, 24) || (placePick.short || "Mon lieu").slice(0, 24);
  const rec = { label, short: label.slice(0, 14), address: placePick.label, city: placePick.short || "", lat: placePick.lat, lon: placePick.lon };
  if (placeEditing === "new") { rec.id = "p" + Date.now().toString(36); state.places.push(rec); state.placeId = rec.id; }
  else Object.assign(placeById(placeEditing), rec);
  placeEditing = null;
  renderSettings();
  update();
});
$("placeCancel").addEventListener("click", () => { placeEditing = null; renderSettings(); });
els.placeDelete.addEventListener("click", () => {
  const idx = state.places.findIndex((p) => p.id === placeEditing);
  const removed = state.places[idx];
  const prev = state.placeId;
  toast(`« ${removed.label} » supprimé`, { label: "Annuler", run: () => {
    state.places.splice(idx, 0, removed);
    state.placeId = prev;
    if (els.settingsSheet.open) renderSettings();
    update();
  } });
  state.places.splice(idx, 1);
  if (state.placeId === removed.id) state.placeId = "gps";
  placeEditing = null;
  renderSettings();
  update();
});
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
async function loadData(dep = data?.dep || state.dep, { fresh = true } = {}) {
  if (!dep) throw new Error("zone inconnue");
  const { doc, offline } = await zone.fetchDept(dep, { fresh });
  dataOffline = offline;
  for (const [f, name] of Object.entries(FUEL_NAMES)) if (doc.fuels[f]) doc.fuels[f].label = name;
  data = doc;
  if (state.dep !== dep) { state.dep = dep; save(); }
  loadedAt = Date.now();
}
// Département de l'origine utilisée (position, ou lieu enregistré) ; null tant qu'on ne sait pas où l'on est.
function homeDep() {
  const o = state.placeId === "gps" ? state.gps : placeById(state.placeId);
  return o ? zone.depAt(o.lat, o.lon) : null;
}
let switching = false;
// Quand la position (ou le lieu choisi) change de département, on charge le fichier du nouveau.
async function ensureDept() {
  const dep = homeDep();
  if (!dep || dep === data?.dep || switching) return;
  switching = true;
  try {
    await loadData(dep, { fresh: false });
    renderFuels();
    render();
    renderFresh();
    applyFriendStock();
    loadHistory();
    loadFavDepts();
  } catch { /* hors ligne : on reste sur le département déjà affiché */ } finally {
    switching = false;
  }
}
// Favoris situés dans d'autres départements : on charge leurs fichiers pour pouvoir les afficher.
async function loadFavDepts() {
  for (const id of state.favs) if (!state.favDep[id] && zone.known.get(id)?.dep) state.favDep[id] = zone.known.get(id).dep;
  const deps = [...new Set(state.favs.filter((id) => !zone.known.has(id)).map((id) => state.favDep[id]).filter((d) => d && d !== data?.dep))];
  if (!deps.length) return;
  await Promise.all(deps.map((d) => zone.fetchDept(d).catch(() => null)));
  if (view === "fav") renderFavs();
}

let refreshing = false;
async function refreshData({ quiet = false } = {}) {
  if (refreshing) return;
  refreshing = true;
  const before = data?.generated_at;
  let result = "fail";
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
    result = dataOffline ? "offline" : data.generated_at === before ? "same" : "new";
    lastRefreshWhen = when;
    if (!quiet) toast(dataOffline ? `Hors ligne : prix du dernier relevé (${when})`
      : data.generated_at === before ? `Déjà à jour : prix relevés ${when}` : `Prix mis à jour : relevés ${when}`);
  } catch {
    if (!quiet) toast("Pas de connexion : les prix n’ont pas changé");
  } finally {
    refreshing = false;
  }
  return result;
}
let lastRefreshWhen = "";

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
  const res = await refreshData({ quiet: true });
  await new Promise((r) => setTimeout(r, Math.max(0, 600 - (Date.now() - started)))); // le temps de voir la fleur tourner
  // Le résultat se lit sur place : la fleur se pose, nœud ouvert, et dit ce qui s'est passé.
  ptrEl.classList.remove("is-loading");
  ptrEl.classList.add("is-done", `res-${res}`);
  ptrText.textContent = res === "new" ? "Prix mis à jour" : res === "same" ? `Déjà à jour · relevés ${lastRefreshWhen}` : res === "offline" ? `Hors ligne · dernier relevé ${lastRefreshWhen}` : "Pas de connexion, rien n'a changé";
  if (res === "new" && !reduceMotion.matches) els.fresh.animate([{ opacity: 0.2, transform: "translateY(-4px)" }, { opacity: 1, transform: "none" }], { duration: 420, easing: EASE_OUT });
  await new Promise((r) => setTimeout(r, 1300));
  ptrEl.classList.remove("is-done", "res-new", "res-same", "res-offline", "res-fail");
  setPull(0, true);
});
document.addEventListener("touchcancel", () => { if (ptrStart !== null) { ptrStart = null; setPull(0, true); } });

// ---------- Démarrage ----------

// ---------- Amis : carburant épuisé ----------
let stockRows = [];
let friendsInfo = null;
// Pastille discrète sous le titre : connecté (point plein + pseudo) ou non (point creux).
function refreshWho() {
  const who = $("who");
  if (!who) return;
  const on = fr.hasProfile();
  const name = on ? friendsInfo?.pseudo : "";
  who.classList.toggle("on", on);
  const n = on ? friendReq : 0;
  who.querySelector("span").textContent = on ? (name || "Connecté") + (n ? ` · ${n} demande${n > 1 ? "s" : ""}` : "") : "Se connecter";
  who.classList.toggle("has-req", n > 0);
  who.setAttribute("aria-label", on ? `Connecté${name ? ` en tant que ${name}` : ""}${n ? `, ${n} demande${n > 1 ? "s" : ""} d’ami en attente` : ""}. Ouvrir le profil` : "Se connecter (Amis)");
  const btn = $("openFriends");
  if (btn) btn.textContent = n ? `Amis et profil (${n})` : "Amis et profil";
}
// Notifications discrètes : demandes d'amis reçues (compteur sous le titre) et demandes acceptées (message au retour dans l'appli).
let friendReq = 0;
const ACC_KEY = "plein-sud:friends-accepted";
async function checkFriends({ announce = true } = {}) {
  if (!fr.hasProfile()) { friendReq = 0; return refreshWho(); }
  let list;
  try { list = await fr.friends(); } catch { return; }
  const incoming = list.filter((f) => f.status === "pending" && f.incoming);
  friendReq = incoming.length;
  const accepted = list.filter((f) => f.status === "accepted");
  try {
    const known = JSON.parse(localStorage.getItem(ACC_KEY) || "null");
    localStorage.setItem(ACC_KEY, JSON.stringify(accepted.map((f) => f.user_id)));
    if (announce && Array.isArray(known)) {
      const fresh = accepted.filter((f) => !known.includes(f.user_id));
      if (fresh.length) toast(fresh.length === 1 ? `${fresh[0].pseudo} est maintenant dans tes amis` : `${fresh.length} nouveaux amis`, { label: "Voir", run: openFriends });
      else if (incoming.length) toast(`${incoming[0].pseudo} t’a ajouté${incoming.length > 1 ? ` (et ${incoming.length - 1} autre${incoming.length > 2 ? "s" : ""})` : ""}`, { label: "Voir", run: openFriends });
    } else if (announce && incoming.length) toast(`${incoming[0].pseudo} t’a ajouté`, { label: "Voir", run: openFriends });
  } catch { /* stockage indisponible : le compteur suffit */ }
  refreshWho();
}
let friendsCheckedAt = 0;
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && fr.hasProfile() && Date.now() - friendsCheckedAt > 120000) { friendsCheckedAt = Date.now(); checkFriends(); }
});
let friendsMsg = "";
let stockSig = "";
const REPORT_NAMES = { sp95: "SP95-E5", e10: "SP95-E10", sp98: "SP98", gazole: "Gazole", e85: "E85", gplc: "GPLc" };
async function loadStock() {
  if (!fr.hasProfile()) return;
  try { stockRows = await fr.stock(); } catch { return; }
  applyFriendStock();
}
// « Épuisé » est pris en compte dans le classement s'il vient de toi ou d'au moins deux personnes ; un seul ami : à confirmer.
function stockOf(stationId, fuel) {
  const rows = stockRows.filter((r) => r.station_id === stationId && r.fuel === fuel);
  const out = rows.filter((r) => r.is_out);
  return { out, confirmed: out.length >= 2 || out.some((r) => r.mine), pending: out.length === 1 && !out[0].mine };
}
function applyFriendStock() {
  if (!data) return;
  const hit = new Map();
  for (const r of stockRows) if (r.is_out && stockOf(r.station_id, r.fuel).confirmed) hit.set(r.station_id, new Set([...(hit.get(r.station_id) || []), r.fuel]));
  const sig = [...hit].map(([id, set]) => `${id}:${[...set].sort()}`).sort().join("|");
  for (const s of zone.known.values()) s.friendOut = hit.get(s.id);
  if (sig !== stockSig) { stockSig = sig; update(); }
}
const namesOf = (rows) => rows.map((r) => (r.mine ? "toi" : r.pseudo)).join(", ");
function reportBlock(s) {
  const f = state.fuel;
  if (!s.prices[f]) return "";
  const st = stockOf(s.id, f);
  const mineOut = st.out.some((r) => r.mine);
  const line = st.confirmed
    ? `<li class="rep-ok"><span><b>Épuisé</b> selon ${esc(namesOf(st.out))}</span><small>${ago(new Date(st.out[0].created_at))}</small></li>`
    : st.pending ? `<li class="rep-wait"><span>${esc(namesOf(st.out))} signale que c’est épuisé, <i>pas encore confirmé</i></span></li>` : "";
  return `<section class="st-report" aria-label="Carburant épuisé ?">
    ${line ? `<ul class="rep-list">${line}</ul>` : ""}
    <p class="rep-title">Sur place, plus de ${esc(REPORT_NAMES[f] || f)} ?</p>
    <div class="rep-btns">
      ${mineOut ? "" : `<button type="button" class="btn" data-stock="1" data-rep-st="${esc(s.id)}">${icon("i-caution")}Épuisé ici</button>`}
      ${mineOut || st.out.length ? `<button type="button" class="btn" data-stock="0" data-rep-st="${esc(s.id)}">Il y en a</button>` : ""}
    </div>
    <p class="hint">Tes amis le voient pendant 12 h. Compté dans le classement quand tu le signales, ou quand deux personnes le font.</p>
  </section>`;
}
async function sendStock(stationId, isOut) {
  if (!fr.hasProfile()) { toast("Crée d’abord ton profil d’ami pour prévenir tes amis."); return openFriends(); }
  try {
    await fr.stockReport({ station_id: stationId, fuel: state.fuel, is_out: isOut });
    toast(isOut ? "Merci : tes amis sont prévenus." : "Noté : il y en a de nouveau.", null, { flower: true });
    await loadStock();
    if (els.stationSheet.open) openStation(stationId);
  } catch (e) { toast(`Pas envoyé : ${e.message}`); }
}
els.stationSheet.addEventListener("click", (e) => {
  const b = e.target.closest("[data-stock]");
  if (b) sendStock(b.dataset.repSt, b.dataset.stock === "1");
});

// ---------- Sauvegarde du carnet, des véhicules et des favoris ----------
const BACKUP_KEYS = ["log", "favs", "favDep", "vehicles", "places", "profileId", "radius", "fuel", "nav", "trips", "savedTrips", "tripCorr", "theme"];
function backupSoon() {
  if (!fr.hasProfile() || restoring) return;
  clearTimeout(backupT);
  backupT = setTimeout(pushBackup, 4000);
}
async function pushBackup() {
  if (!fr.hasProfile() || restoring) return;
  const d = Object.fromEntries(BACKUP_KEYS.map((k) => [k, state[k]]));
  const sig = JSON.stringify(d);
  if (sig === backupSig) return;
  try { await fr.pushBackup(d); backupSig = sig; backupAt = Date.now(); } catch { /* réessayé à la prochaine modification */ }
}
// Déconnexion : tes données restent sur ton compte (on les envoie avant de partir) ; cet appareil repart comme au premier lancement.
async function logout() {
  clearTimeout(backupT);
  try { await pushBackup(); } catch { /* hors ligne : la dernière sauvegarde reste valable */ }
  restoring = true;
  fr.forget();
  const keep = state.theme;
  state = { ...structuredClone(DEFAULTS), theme: keep };
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); sessionStorage.setItem("ps-logout", "1"); } catch { /* stockage indisponible */ }
  location.reload();
}
// Création d'un profil neuf : les véhicules d'origine jamais retouchés n'ont rien à faire sur un nouveau compte.
function dropUntouchedSeeds() {
  const same = (v) => SEEDS.some((s) => s.id === v.id && s.label === v.label && Number(s.litres) === Number(v.litres) && Number(s.conso) === Number(v.conso) && !Number.isFinite(v.level));
  state.vehicles = state.vehicles.filter((v) => !same(v));
  if (!state.vehicles.some((v) => v.id === state.profileId)) state.profileId = state.vehicles[0]?.id || "";
  save();
}
async function restoreBackup() {
  const b = await fr.pullBackup();
  if (!b) return false;
  for (const k of BACKUP_KEYS) if (b.data[k] !== undefined) state[k] = b.data[k];
  save();
  return true;
}

const monthKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
let savingsSyncT = 0;
let savingsSent = "";
// Publie mon total du mois ; appelé après chaque changement du carnet (retardé) et à l'ouverture de la fenêtre Amis.
async function syncSavings(now = false) {
  if (!fr.hasProfile()) return;
  clearTimeout(savingsSyncT);
  const run = async () => {
    const mk = monthKey();
    const mine = state.log.filter((e) => monthKey(new Date(e.date)) === mk);
    const euros = mine.reduce((s, e) => s + e.gain, 0);
    const sig = `${mk}|${euros.toFixed(2)}|${mine.length}`;
    if (sig === savingsSent || !mine.length) return;
    try { await fr.pushSavings(mk, euros, Math.min(mine.length, 200)); savingsSent = sig; } catch { /* réessayé au prochain changement */ }
  };
  if (now) return run();
  savingsSyncT = setTimeout(run, 2500);
}
const friendsBody = $("friendsBody");
async function openFriends() {
  openSheet($("friendsSheet"));
  await renderFriends();
  if (!reduceMotion.matches) friendsBody.animate([{ opacity: 0, transform: "translateY(8px)" }, { opacity: 1, transform: "none" }], { duration: 320, easing: EASE_OUT });
}
// Passer d'un panneau à l'autre : le nouveau monte par-dessus, l'ancien disparaît dessous sans qu'on le voie partir.
function swapSheet(from, to) {
  to();
  setTimeout(() => { from.classList.remove("is-open"); if (from.open) from.close(); }, 380);
}
async function renderFriends() {
  refreshWho();
  const redirectErr = fr.takeRedirectError();
  if (redirectErr) friendsMsg = redirectErr;
  if (!fr.hasProfile()) {
    friendsBody.innerHTML = `<a class="btn btn-main fr-google" href="${esc(fr.googleUrl(location.origin + location.pathname))}">Continuer avec Google</a>
      <p class="hint">Le plus simple : sur un nouveau téléphone, tu te reconnectes avec Google et tout revient (carnet, véhicules, amis).</p>
      <h3 class="fr-h">Sans compte Google</h3>
      <p class="fr-lede">Choisis un pseudo : tes amis te retrouvent avec un code, sans e-mail. Ils voient seulement tes signalements « épuisé » et ton total d’économies du mois, jamais ta position. Une clé de récupération te sera donnée pour retrouver ton profil si tu changes de téléphone.</p>
      <form class="fr-form" id="frCreate"><input id="frPseudo" type="text" maxlength="20" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Ton pseudo" aria-label="Pseudo"><button class="btn btn-main" type="submit">Créer mon profil</button></form>
      <h3 class="fr-h">Retrouver mon profil</h3>
      <form class="fr-stack" id="frRecover"><input id="frRecPseudo" type="text" maxlength="20" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Pseudo" aria-label="Pseudo"><input id="frRecKey" type="text" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="Clé de récupération" aria-label="Clé de récupération"><button class="btn" type="submit">Retrouver</button></form>
      <p class="hint" id="frMsg" role="alert"${friendsMsg ? "" : " hidden"}>${esc(friendsMsg)}</p>
      <a class="coulisses-link" href="confidentialite.html">Ce qui est stocké, qui le voit, comment tout supprimer</a>`;
    friendsMsg = "";
    return;
  }
  friendsBody.innerHTML = `<p class="trip-wait">Chargement…</p>`;
  try {
    friendsInfo = friendsInfo || (await fr.profile());
    refreshWho();
    if (!friendsInfo) {
      friendsBody.innerHTML = `<p class="fr-lede">Connecté. Choisis le pseudo sous lequel tes amis te verront.</p>
        <form class="fr-form" id="frPseudoOnly"><input id="frPseudo" type="text" maxlength="20" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Ton pseudo" aria-label="Pseudo"><button class="btn btn-main" type="submit">Valider</button></form>
        <p class="hint" id="frMsg" role="alert"${friendsMsg ? "" : " hidden"}>${esc(friendsMsg)}</p>`;
      return;
    }
    await syncSavings(true);
    const [me, list, rank] = await Promise.all([friendsInfo ? friendsInfo : fr.profile(), fr.friends(), fr.savings(monthKey()), loadStock()]);
    friendsInfo = me;
    const incoming = list.filter((f) => f.status === "pending" && f.incoming);
    friendReq = incoming.length;
    try { localStorage.setItem(ACC_KEY, JSON.stringify(list.filter((f) => f.status === "accepted").map((f) => f.user_id))); } catch { /* ignoré */ }
    refreshWho();
    const waiting = list.filter((f) => f.status === "pending" && !f.incoming);
    const ok = list.filter((f) => f.status === "accepted");
    const keys = [...new Set(stockRows.filter((r) => r.is_out).map((r) => `${r.station_id}|${r.fuel}`))];
    const feed = keys.map((k) => {
      const [id, fuel] = k.split("|");
      const st = stockOf(id, fuel), s = stationById(id);
      return `<li class="${st.confirmed ? "rep-ok" : "rep-wait"}"><span><b>${esc(s ? stationName(s) : "station hors zone")}</b> · ${esc(REPORT_NAMES[fuel] || fuel)} épuisé<br><small>${st.confirmed ? "selon" : "à confirmer, signalé par"} ${esc(namesOf(st.out))}, ${ago(new Date(st.out[0].created_at))}</small></span></li>`;
    }).join("");
    const board = rank.map((r, i) => `<li${r.mine ? ' class="me"' : ""}><span class="rk">${i + 1}</span><span class="nm">${esc(r.mine ? `${r.pseudo} (toi)` : r.pseudo)}</span><span class="eu">${r.euros >= 0 ? "+" : "−"}${eur.format(Math.abs(Number(r.euros)))}</span><small>${r.fills} plein${r.fills > 1 ? "s" : ""}</small></li>`).join("");
    friendsBody.innerHTML = `
      <p class="fr-me">Tu es <b>${esc(me.pseudo)}</b>. Ton code d’invitation :</p>
      <div class="fr-code"><output>${esc(me.code)}</output>${navigator.share ? `<button class="icon-btn" type="button" data-fr-share aria-label="Partager mon code">${icon("i-share")}</button>` : ""}</div>
      <form class="fr-form" id="frAdd"><input id="frCode" type="text" maxlength="8" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="Code d’un ami" aria-label="Code d’un ami"><button class="btn btn-main" type="submit">Ajouter</button></form>
      <p class="hint" id="frMsg" role="alert"${friendsMsg ? "" : " hidden"}>${esc(friendsMsg)}</p>
      ${incoming.length ? `<h3 class="fr-h">Demandes reçues</h3><ul class="fr-list">${incoming.map((f) => `<li><span>${esc(f.pseudo)}</span><button class="btn btn-main" type="button" data-fr-yes="${f.user_id}">Accepter</button><button class="btn btn-text" type="button" data-fr-no="${f.user_id}">Refuser</button></li>`).join("")}</ul>` : ""}
      <h3 class="fr-h">Amis</h3>
      ${ok.length || waiting.length ? `<ul class="fr-list">${ok.map((f) => `<li><span>${esc(f.pseudo)}</span><button class="btn btn-text" type="button" data-fr-del="${f.user_id}">Retirer</button></li>`).join("")}${waiting.map((f) => `<li><span>${esc(f.pseudo)} <small>en attente</small></span><button class="btn btn-text" type="button" data-fr-del="${f.user_id}">Annuler</button></li>`).join("")}</ul>` : `<p class="muted">Pas encore d’ami. Envoie ton code, ou entre le sien ci-dessus.</p>`}
      <h3 class="fr-h">Classement du mois</h3>
      ${board ? `<ol class="fr-board">${board}</ol><p class="hint">Seuls le total économisé ce mois-ci et le nombre de pleins sont partagés, jamais les stations ni les lieux.</p>` : `<p class="muted">Note un plein dans le carnet pour entrer au classement.</p>`}
      <h3 class="fr-h">Carburants épuisés (12 h)</h3>
      ${feed ? `<ul class="rep-list">${feed}</ul>` : `<p class="muted">Rien de signalé. Sur la fiche d’une station, « Épuisé ici » prévient tes amis.</p>`}
      <h3 class="fr-h">Sauvegarde</h3>
      <p class="muted">Ton carnet, tes véhicules et tes favoris sont sauvegardés sur ton profil${backupAt ? ` (dernière fois ${ago(new Date(backupAt))})` : ""}.</p>
      ${fr.recoveryKey() ? `<p class="muted">Sur un nouveau téléphone : « Retrouver mon profil » avec ton pseudo et cette clé de récupération.</p>
      <div class="fr-code fr-key"><output>${esc(fr.showKey(fr.recoveryKey()))}</output></div>
      <p class="hint">Garde-la précieusement : c’est la seule façon de récupérer ce profil.</p>` : `<p class="muted">Sur un nouveau téléphone, reconnecte-toi avec Google : tout revient.</p>`}
      <button class="btn" type="button" data-fr-restore>Restaurer ma sauvegarde sur cet appareil</button>
      <h3 class="fr-h">Mon compte</h3>
      <a class="coulisses-link" href="confidentialite.html">Ce qui est stocké, qui le voit, comment tout supprimer</a>
      <div class="veh-actions">
        <button class="btn" type="button" data-fr-logout>Se déconnecter</button>
        <button class="btn btn-text fr-danger" type="button" data-fr-delete>Supprimer mon profil et mes données</button>
      </div>`;
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
    try { friendsInfo = await fr.signUp(pseudo); dropUntouchedSeeds(); friendsMsg = "Profil créé. Note ta clé de récupération tout en bas de cette fenêtre."; backupSoon(); } catch (err) { friendsMsg = err.message; }
    return renderFriends();
  }
  if (e.target.id === "frRecover") {
    restoring = true;
    try {
      await fr.signIn($("frRecPseudo").value, $("frRecKey").value);
      friendsInfo = null;
      if (await restoreBackup()) return location.reload();
      friendsMsg = "Profil retrouvé, mais aucune sauvegarde n’a été trouvée.";
    } catch (err) { friendsMsg = err.message; }
    restoring = false;
    return renderFriends();
  }
  if (e.target.id === "frPseudoOnly") {
    try { friendsInfo = await fr.createProfile($("frPseudo").value.trim()); dropUntouchedSeeds(); friendsMsg = ""; pushBackup(); } catch (err) { friendsMsg = err.message; }
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
  if (t("data-fr-logout")) return frAct(logout);
  const del = t("data-fr-delete");
  if (del) {
    // Deux appuis : le premier demande confirmation, le second supprime.
    if (!del.dataset.armed) { del.dataset.armed = "1"; del.textContent = "Confirmer : tout supprimer définitivement"; setTimeout(() => { if (del.isConnected) { delete del.dataset.armed; del.textContent = "Supprimer mon profil et mes données"; } }, 5000); return; }
    return frAct(async () => { await fr.deleteMe(); friendsInfo = null; stockRows = []; applyFriendStock(); friendsMsg = "Profil et données supprimés du serveur. Ton carnet reste sur ce téléphone."; });
  }
  if (t("data-fr-restore")) return frAct(async () => { restoring = true; try { if (await restoreBackup()) return location.reload(); friendsMsg = "Aucune sauvegarde trouvée."; } finally { restoring = false; } });
  if (t("data-fr-share")) return navigator.share({ title: "Plein Sud", text: `Mon code Plein Sud : ${friendsInfo.code}` }).catch(() => {});
  if (e.target.closest("#frRetry")) return renderFriends();
});
$("openFriends").addEventListener("click", () => swapSheet(els.settingsSheet, openFriends));

const cameBack = fr.consumeRedirect();
// ---------- Petite surprise : double clic sur le logo = pluie de pétales, triple = quatre saisons ----------
{
  const mark = document.querySelector(".top .mark");
  let taps = 0, tapT = 0, busy = false;
  // Ville du moment : la plus fréquente parmi les stations les plus proches de la position utilisée.
  const cityNow = () => {
    const o = origin();
    const near = [...(data?.stations || [])].sort((a, b) => haversineKm(o, a) - haversineKm(o, b)).slice(0, 8);
    const count = new Map();
    for (const st of near) { const v = titleCase(st.ville || ""); if (v) count.set(v, (count.get(v) || 0) + 1); }
    return [...count.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "Montpellier";
  };
  const petalRain = () => {
    if (reduceMotion.matches) return toast("Pluie de pétales…", null, { flower: true });
    const box = document.createElement("div");
    box.className = "petal-rain";
    const colors = ["--rose-thread", "--coral", "--lav", "--ochre", "--sage"].map((v) => `var(${v})`);
    for (let i = 0; i < 34; i++) {
      const p = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      p.setAttribute("viewBox", "0 0 20 28");
      p.innerHTML = `<path d="M10 27C2 20 2 7 10 1C18 7 18 20 10 27Z"/>`;
      p.style.cssText = `left:${Math.random() * 100}%;color:${colors[i % colors.length]};width:${14 + Math.random() * 14}px`;
      box.append(p);
      const drift = (Math.random() - 0.5) * 160;
      p.style.opacity = "0"; // invisible tant que sa chute n'a pas commencé, et une fois finie : jamais de retour en haut
      const fall = p.animate([{ transform: `translate3d(0,-40px,0) rotate(${Math.random() * 90}deg)`, opacity: 0.85 }, { transform: `translate3d(${drift}px,${innerHeight + 60}px,0) rotate(${360 + Math.random() * 360}deg)`, opacity: 0.85 }],
        { duration: 2600 + Math.random() * 1800, delay: Math.random() * 700, easing: "cubic-bezier(.3,.1,.6,1)", fill: "both" });
      fall.finished.then(() => p.remove(), () => {});
    }
    document.body.append(box);
    setTimeout(() => box.remove(), 5400);
  };
  const seasons = async () => {
    for (const s of ["printemps", "ete", "automne", "hiver"]) { window.garden.plant(s); await new Promise((r) => setTimeout(r, 1100)); }
    window.garden.plant();
  };
  mark?.addEventListener("click", () => {
    taps++;
    clearTimeout(tapT);
    tapT = setTimeout(async () => {
      const n = taps;
      taps = 0;
      if (n < 2 || busy) return;
      busy = true;
      if (!reduceMotion.matches) mark.animate([{ transform: "rotate(0)" }, { transform: "rotate(360deg)" }], { duration: 800, easing: EASE_IN_OUT });
      if (n === 2) { petalRain(); toast(`${cityNow()} en fleurs`, null, { flower: true }); }
      else { toast("Les quatre saisons, en quatre secondes.", null, { flower: true }); await seasons(); }
      setTimeout(() => { busy = false; }, 1200);
    }, 380);
  });
}

async function boot() {
  els.answerBody.innerHTML = `<div class="skel" role="status" aria-label="Chargement des prix"><span class="skel-bar" style="width:46%;height:28px"></span><span class="skel-bar" style="width:62%;height:16px"></span><span class="skel-bar" style="width:74%;height:92px;margin-top:10px"></span><span class="skel-bar" style="width:100%;height:60px;margin-top:10px;border-radius:20px"></span></div>`;
  renderStart();
  if (state.placeId === "gps") locate(); // la position est demandée dès l'ouverture
  await zone.loadGrid();
  // Quel département ? Celui de la position ou du lieu choisi ; à défaut celui de la dernière fois, le temps d'avoir la position.
  let dep = homeDep() || state.dep;
  for (let i = 0; i < 90 && !dep && locating; i++) { await new Promise((r) => setTimeout(r, 150)); dep = homeDep(); }
  if (!dep && needZone()) return openZoneGate();
  if (!dep) dep = homeDep();
  if (!dep) {
    els.answerBody.innerHTML = `<div class="ans-head"><p class="ans-name">Où es-tu ?</p><p class="ans-ville">Autorise la position ou choisis un lieu de départ dans les réglages.</p></div>`;
    return openZoneGate();
  }
  try {
    await loadData(dep, { fresh: true });
  } catch {
    els.answerBody.innerHTML = `<div class="ans-head"><p class="ans-name">Prix indisponibles</p><p class="ans-ville">Impossible de charger les prix. Vérifie ta connexion puis recharge la page.</p></div>`;
    return;
  }
  renderFuels();
  render();
  renderFresh();
  stitchIn(1100);
  loadHistory();
  loadFavDepts();
  if (needZone()) openZoneGate();
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

$("who").addEventListener("click", openFriends);
boot().then(loadStock).then(async () => {
  refreshWho();
  if (fr.hasProfile() && !friendsInfo) { try { friendsInfo = await fr.profile(); } catch { /* hors ligne : on reste sur « Connecté » */ } refreshWho(); }
  friendsCheckedAt = Date.now();
  checkFriends({ announce: !cameBack });
  if (cameBack) {
    // Premier retour de Google sur un appareil encore vide : on récupère directement la sauvegarde du compte.
    if (fr.hasProfile() && !state.vehicles.length && !state.log.length && !state.favs.length) {
      restoring = true;
      try { if (await restoreBackup()) return location.reload(); } catch { /* on continue avec un appareil vide */ }
      restoring = false;
    }
    openFriends();
  } else askFirstVehicle();
});
// Premier lancement (ou appareil remis à zéro) : aucun véhicule d'office, on propose d'en ajouter un.
function askFirstVehicle() {
  if (state.vehicles.length || state.vehAsked || $("zoneGate")?.open) return;
  state.vehAsked = true;
  save();
  setTimeout(() => {
    openSettingsSheet();
    openVehForm("new");
    toast("Ajoute ton véhicule pour calculer le vrai coût du plein.");
  }, 900);
}
try {
  if (sessionStorage.getItem("ps-logout")) { sessionStorage.removeItem("ps-logout"); setTimeout(() => toast("Déconnecté. Tes données restent sauvegardées sur ton compte."), 1200); }
} catch { /* stockage indisponible */ }
setTimeout(() => document.documentElement.classList.remove("intro"), 1400);

if ("serviceWorker" in navigator && location.protocol === "https:") {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}

// ---------- Mise à jour : l'appli installée sur l'écran d'accueil reste ouverte en veille, parfois des jours ----------
// À chaque retour au premier plan, on compare le numéro de version du service worker (sw.js, jamais en cache) avec celui
// chargé au lancement. S'il a changé, un bandeau propose de recharger : pas besoin de recréer le raccourci.
// BUILD doit être identique au CACHE de sw.js (vérifié par web/tests/version.test.mjs).
const BUILD = "plein-sud-v39";
{
  const versionOf = async () => {
    try {
      const t = await (await fetch(`sw.js?v=${Date.now()}`, { cache: "no-store" })).text();
      return t.match(/CACHE\s*=\s*"([^"]+)"/)?.[1] || null;
    } catch { return null; }
  };
  let last = 0, shown = false;
  const check = async () => {
    if (shown || document.visibilityState !== "visible" || Date.now() - last < 60000) return;
    last = Date.now();
    const v = await versionOf();
    if (!v || v === BUILD) return;
    shown = true;
    const bar = document.createElement("div");
    bar.className = "update-bar";
    bar.setAttribute("role", "status");
    bar.innerHTML = `<span>Une nouvelle version de Plein Sud est prête.</span><button type="button">Mettre à jour</button>`;
    bar.querySelector("button").addEventListener("click", async () => {
      bar.querySelector("button").textContent = "Mise à jour…";
      try { await (await navigator.serviceWorker?.getRegistration())?.update(); } catch { /* le rechargement suffit */ }
      location.reload();
    });
    document.body.append(bar);
    if (!reduceMotion.matches) bar.animate([{ opacity: 0, transform: "translateY(12px)" }, { opacity: 1, transform: "none" }], { duration: 360, easing: EASE_OUT });
  };
  check(); // dès le lancement : si le code chargé est plus ancien que le serveur, on le dit tout de suite
  document.addEventListener("visibilitychange", check);
  addEventListener("pageshow", check);
  setInterval(check, 10 * 60000);
}
