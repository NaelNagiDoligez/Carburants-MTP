import { rankStations, haversineKm, isOutOfStock } from "./rank.js";

// ---------- Constantes ----------
const PLACES = [
  { id: "comedie", label: "Place de la Comédie", short: "la Comédie", lat: 43.6084, lon: 3.8796 },
  { id: "saint-roch", label: "Gare Saint-Roch", short: "Saint-Roch", lat: 43.6032, lon: 3.8809 },
  { id: "odysseum", label: "Odysseum", short: "Odysseum", lat: 43.6046, lon: 3.9186 },
  { id: "triolet", label: "Campus Triolet", short: "Triolet", lat: 43.6318, lon: 3.8613 },
];
const PROFILES = [
  { id: "mt450", label: "CFMoto 450MT", short: "450MT", detail: "14 L · 4,5 L/100", litres: 14, conso: 4.5 },
  { id: "scooter", label: "Scooter 125", short: "Scooter", detail: "6 L · 2,8 L/100", litres: 6, conso: 2.8 },
  { id: "car", label: "Voiture", short: "Voiture", detail: "40 L · 6,5 L/100", litres: 40, conso: 6.5 },
  { id: "custom", label: "Personnalisé", short: "Perso", detail: "tes valeurs" },
];
const NAV_APPS = [
  { id: "apple", label: "Plans", detail: "l'appli Plans de l'iPhone" },
  { id: "google", label: "Google Maps", detail: "appli ou site" },
  { id: "waze", label: "Waze", detail: "appli ou site" },
];
const FUEL_ORDER = ["e10", "sp95", "sp98", "gazole", "e85", "gplc"];
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
  fuel: "e10", placeId: "gps", gps: null, profileId: "mt450", custom: { litres: 14, conso: 4.5 },
  radius: 15, favs: [], log: [], nav: null, fillSeen: {},
};
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");
const darkScheme = matchMedia("(prefers-color-scheme: dark)");
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
let dwell = null;

function loadState() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE_KEY) || "null") || JSON.parse(localStorage.getItem("plein-sud:v2") || "null");
    if (!raw) return structuredClone(DEFAULTS);
    return { ...structuredClone(DEFAULTS), ...raw, custom: { ...DEFAULTS.custom, ...(raw.custom || {}) } };
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
const stationName = (s) => (!s.adresse || /^(cs|bp)\s*\d+$/i.test(s.adresse.trim()) ? titleCase(s.ville) : prettyAddress(s.adresse));
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
const parseNum = (v) => Number(String(v ?? "").trim().replace(/\s/g, "").replace(",", "."));
const commaNum = (n, digits) => n.toFixed(digits).replace(".", ",");
const icon = (id, cls = "ic") => `<svg class="${cls}" aria-hidden="true"><use href="#${id}"/></svg>`;

// ---------- Éléments ----------
const $ = (id) => document.getElementById(id);
const els = {
  start: $("start"), startText: $("startText"), fuels: $("fuels"),
  answer: $("answer"), answerBody: $("answerBody"), alts: $("alts"), showAll: $("showAll"), showAllText: $("showAllText"),
  allList: $("allList"), favList: $("favList"), map: $("map"), mapNote: $("mapNote"),
  logTotal: $("logTotal"), logForm: $("logForm"), logStation: $("logStation"), logLitres: $("logLitres"),
  logPrice: $("logPrice"), logPreview: $("logPreview"), logList: $("logList"),
  stationSheet: $("stationSheet"), stationBody: $("stationBody"), navSheet: $("navSheet"), navApps: $("navApps"), navRemember: $("navRemember"),
  settingsSheet: $("settingsSheet"), settingsForm: $("settingsForm"), places: $("places"), profiles: $("profiles"), navPref: $("navPref"),
  custom: $("custom"), litres: $("litres"), conso: $("conso"), radius: $("radius"), radiusOut: $("radiusOut"),
  useGps: $("useGps"), useGpsText: $("useGpsText"), gpsHint: $("gpsHint"), toast: $("toast"),
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
function vehicle() {
  if (state.profileId === "custom") return { label: "Personnalisé", short: "Perso", ...state.custom };
  return PROFILES.find((p) => p.id === state.profileId) || PROFILES[0];
}
const stationById = (id) => data?.stations.find((s) => s.id === id);
const isFav = (id) => state.favs.includes(id);
const fuelLabel = () => data.fuels[state.fuel]?.label ?? state.fuel;

function computeRanking() {
  const v = vehicle();
  const usable = data.stations.filter((s) => !isOutOfStock(s, state.fuel));
  ranked = rankStations(usable, state.fuel, origin(), { litres: Number(v.litres) || 1, conso: Number(v.conso) || 0, radiusKm: state.radius });
  ranked.forEach((r, i) => { r.rank = i + 1; });
}

// ---------- Rendu ----------
function renderStart() {
  const v = vehicle();
  els.start.classList.toggle("locating", locating);
  const where = state.placeId === "gps" ? (state.gps ? "Ta position" : "Comédie") : (PLACES.find((p) => p.id === state.placeId) || PLACES[0]).short;
  els.startText.textContent = locating ? "Position…" : `${where} · ${v.short} · ${state.radius} km`;
}
function renderFuels() {
  const fuels = FUEL_ORDER.filter((f) => data.fuels[f]);
  if (!fuels.includes(state.fuel)) state.fuel = fuels[0];
  els.fuels.innerHTML = fuels.map((f) => `<button type="button" role="radio" class="fuel" data-fuel="${f}"
      aria-checked="${f === state.fuel}"><b>${esc(data.fuels[f].label)}</b></button>`).join("");
}
function renderFresh() {
  const how = document.querySelector(".how p");
  if (how && !how.dataset.done) {
    how.dataset.done = "1";
    how.insertAdjacentText("beforeend", ` Prix officiels relevés ${ago(new Date(data.generated_at))}.`);
  }
}
const navLabel = () => NAV_APPS.find((a) => a.id === state.nav)?.label;

function renderAnswer() {
  if (!ranked.length) {
    els.answerBody.innerHTML = `<div class="ans-head"><p class="ans-name">Aucune station trouvée</p>
      <p class="ans-ville">Pas de ${esc(fuelLabel())} avec un prix récent à moins de ${state.radius} km de ${esc(originLabel())}.</p></div>
      <button type="button" class="go" data-widen>Chercher jusqu'à ${Math.min(state.radius + 10, 40)} km</button>`;
    lastLeadKey = "";
    return;
  }
  const r = ranked[0];
  const s = r.station;
  const stale = hoursOld(r.updatedAt) > STALE_HOURS;
  const saving = r.gain > 0.05 ? `<span class="save">${eur.format(r.gain)} de moins que la plus proche</span>`
    : `<span>${r.isNearest ? "C'est aussi la plus proche" : "Même total que la plus proche"}</span>`;
  const age = stale ? `<br><span class="flag">${icon("i-caution")}prix ${ago(r.updatedAt)}</span>` : "";
  els.answerBody.innerHTML = `
    <button type="button" class="ans-head plain" data-open="${esc(s.id)}" aria-label="Détails de la station ${esc(stationName(s))}">
      <span class="ans-name">${esc(stationName(s))}</span>
      <span class="ans-ville">${esc(titleCase(s.ville))}</span>
    </button>
    <p class="ans-price" aria-label="${priceSpoken(r.price)}"><span class="num">${priceHTML(r.price)}</span><span class="unit">€/L</span></p>
    <div class="ans-facts">
      <p class="fact"><b>${kmText(r.distanceKm)} km</b><span>distance</span></p>
      <p class="fact"><b>${eur.format(r.total)}</b><span>plein + détour</span></p>
    </div>
    <button type="button" class="go" data-go="${esc(s.id)}">${icon("i-go")}Y aller${navLabel() ? `<small>· ${esc(navLabel())}</small>` : ""}</button>
    <div class="ans-foot"><span>${saving}${age}</span>
      <button type="button" class="icon-btn star-btn" data-fav="${esc(s.id)}" aria-pressed="${isFav(s.id)}" aria-label="${isFav(s.id) ? "Retirer des favoris" : "Ajouter aux favoris"}">${icon("i-star")}</button>
    </div>`;
  const key = `${s.id}|${state.fuel}`;
  if (!firstRender && key !== lastLeadKey) restitch();
  lastLeadKey = key;
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
  if (!reduceMotion.matches) {
    els.answerBody.animate([{ opacity: 0.25, transform: "translateY(6px)" }, { opacity: 1, transform: "none" }], { duration: 240, easing: EASE_OUT });
  }
}

function altHTML(r, best, label) {
  const s = r.station;
  const delta = r.total - best.total;
  const right = label ?? (delta < 0.005 ? "même total" : `+${eur.format(delta)}`);
  const stale = hoursOld(r.updatedAt) > STALE_HOURS ? ` · prix ${ago(r.updatedAt)}` : "";
  return `<button type="button" class="alt-btn" data-open="${esc(s.id)}" aria-label="${r.rank ? `${r.rank}e, ` : ""}${esc(stationName(s))}, ${priceSpoken(r.price)}, ${kmText(r.distanceKm)} kilomètres, ${esc(right)}">
      <span class="rank" aria-hidden="true">${r.rank ?? "–"}</span>
      <span class="alt-name">${esc(stationName(s))}</span>
      <span class="alt-price">${priceHTML(r.price)}</span>
      <span class="alt-meta">${kmText(r.distanceKm)} km · ${esc(titleCase(s.ville))}${stale}</span>
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
  els.showAllText.textContent = showAll ? "Masquer les autres stations" : `Voir les ${rest} autres stations`;
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
  const rows = rankStations(favStations, state.fuel, origin(), { litres: Number(v.litres) || 1, conso: Number(v.conso) || 0, radiusKm: 500 });
  const labels = new Map();
  for (const r of rows) {
    const pos = ranked.findIndex((x) => x.station.id === r.station.id);
    r.rank = pos >= 0 ? pos + 1 : null;
    labels.set(r.station.id, pos >= 0 ? `${pos + 1}${pos === 0 ? "re" : "e"} au classement` : "hors rayon");
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
  firstRender = false;
}
function update() { save(); render(); }

// ---------- Onglets ----------
function showView(next) {
  if (next === view) return;
  view = next;
  for (const t of document.querySelectorAll(".tabs [role=tab]")) t.setAttribute("aria-selected", String(t.dataset.view === next));
  for (const id of ["rank", "map", "fav", "log"]) {
    const el = $(`view-${id}`);
    el.hidden = id !== next;
    if (id === next) { el.classList.remove("entering"); void el.offsetWidth; el.classList.add("entering"); }
  }
  if (next === "fav") renderFavs();
  if (next === "map") renderMap();
  if (next === "log") renderLog();
  window.scrollTo({ top: 0 });
}

// ---------- Itinéraire : Plans, Google Maps ou Waze ----------
function navUrl(app, s) {
  const ll = `${s.lat},${s.lon}`;
  if (app === "apple") return `https://maps.apple.com/?daddr=${ll}&dirflg=d`;
  if (app === "waze") return `https://waze.com/ul?ll=${ll}&navigate=yes`;
  return `https://www.google.com/maps/dir/?api=1&destination=${ll}&travelmode=driving`;
}
// Liens universels : le téléphone ouvre l'appli si elle est installée, sinon le site.
// Appelé directement dans le geste de l'utilisateur (sinon le navigateur bloque l'ouverture).
let navTarget = null;
function launchNav(app, s) {
  navTarget = { id: s.id, at: Date.now() };
  const a = document.createElement("a");
  a.href = navUrl(app, s);
  a.target = "_blank";
  a.rel = "noopener";
  document.body.append(a);
  a.click();
  a.remove();
}
let pendingNavStation = null;
function go(id) {
  const s = stationById(id);
  if (!s) return;
  if (state.nav) return launchNav(state.nav, s);
  pendingNavStation = s;
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
const currentPalette = () => MAP_PALETTES[darkScheme.matches ? "dark" : "light"];
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
    darkScheme.addEventListener("change", () => map.setStyle(recolor(baseStyle, currentPalette())));
  }
  for (const m of markers) m.remove();
  markers = [];
  const me = document.createElement("div");
  me.className = "me-dot";
  markers.push(new maplib.Marker({ element: me }).setLngLat([o.lon, o.lat]).addTo(map));
  const shown = ranked.slice(0, MAP_MAX);
  // Deux stations au même endroit : on décale légèrement la seconde pastille pour qu'elle reste visible.
  const taken = [];
  shown.forEach((r) => {
    const near = taken.filter((t) => Math.abs(t[0] - r.station.lat) < 0.0012 && Math.abs(t[1] - r.station.lon) < 0.0012).length;
    taken.push([r.station.lat, r.station.lon]);
    r.pinOffset = near ? [near * 16, -near * 16] : [0, 0];
  });
  shown.slice().reverse().forEach((r) => {
    const el = flowerPin(r.rank, r.rank === 1);
    el.addEventListener("click", (e) => { e.stopPropagation(); openStation(r.station.id); });
    markers.push(new maplib.Marker({ element: el, offset: r.pinOffset }).setLngLat([r.station.lon, r.station.lat]).addTo(map));
  });
  const pts = [[o.lon, o.lat], ...shown.slice(0, 8).map((r) => [r.station.lon, r.station.lat])];
  const lons = pts.map((p) => p[0]);
  const lats = pts.map((p) => p[1]);
  map.resize();
  map.fitBounds([[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]], { padding: 48, maxZoom: 14, duration: 0 });
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
    s.automate_24_24 ? ["Automate 24 h/24", esc(s.automate_24_24)] : null,
    s.horaires ? ["Horaires", esc(s.horaires)] : null,
    s.services ? ["Services", esc(s.services)] : null,
  ].filter(Boolean);
  els.stationBody.innerHTML = `
    <div class="grabber" aria-hidden="true"></div>
    <div class="sheet-head">
      <div><h2 id="stTitle">${esc(stationName(s))}</h2>
        <p>${esc(titleCase(s.ville))}${r ? ` · ${kmText(r.distanceKm)} km · ${r.rank}${r.rank === 1 ? "re" : "e"} au classement` : " · hors rayon"}</p></div>
      <button class="icon-btn" type="button" data-close aria-label="Fermer">${icon("i-close")}</button>
    </div>
    ${r ? `<p class="st-sum"><b>${eur.format(r.total)}</b> le plein de ${esc(fuelLabel())}, détour compris</p>` : ""}
    <div class="st-actions">
      <button type="button" class="go" data-go="${esc(s.id)}">${icon("i-go")}Y aller</button>
      <button type="button" class="icon-btn star-btn" data-fav="${esc(s.id)}" aria-pressed="${isFav(s.id)}" aria-label="${isFav(s.id) ? "Retirer des favoris" : "Ajouter aux favoris"}">${icon("i-star")}</button>
      ${navigator.share ? `<button type="button" class="icon-btn" data-share="${esc(s.id)}" aria-label="Partager la station">${icon("i-share")}</button>` : ""}
    </div>
    <ul class="st-prices" aria-label="Prix dans cette station">${prices}</ul>
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

function renderSettings() {
  els.places.innerHTML = PLACES.map((p) => `<button type="button" class="choice" data-place="${p.id}" aria-pressed="${state.placeId === p.id}">${esc(p.label)}</button>`).join("");
  els.profiles.innerHTML = PROFILES.map((p) => `<button type="button" class="choice" data-profile="${p.id}" aria-pressed="${state.profileId === p.id}">${esc(p.label)}<small>${esc(p.detail)}</small></button>`).join("");
  els.navPref.innerHTML = [{ id: "", label: "Me demander" }, ...NAV_APPS].map((a) => `<button type="button" class="choice" data-nav-pref="${a.id}" aria-pressed="${(state.nav || "") === a.id}">${esc(a.label)}</button>`).join("");
  els.custom.hidden = state.profileId !== "custom";
  els.litres.value = commaNum(Number(state.custom.litres), 0);
  els.conso.value = commaNum(Number(state.custom.conso), 1);
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
      state.gps = { lat: pos.coords.latitude, lon: pos.coords.longitude };
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
  if (moved > REORIGIN_M) { state.gps = here; update(); }
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
  const litres = Number(vehicle().litres);
  els.fillText.textContent = `Tu es à ${stationName(s)}. On note ce plein dans ton carnet ?`;
  els.fillQuick.textContent = p ? `Noter ${String(litres).replace(".", ",")} L à ${commaNum(p, 3)} €/L` : "Noter ce plein";
  els.fillQuick.hidden = !p;
  els.fillCard.hidden = false;
  requestAnimationFrame(() => requestAnimationFrame(() => els.fillCard.classList.add("show")));
  buzz();
}
function hideFillCard() {
  els.fillCard.classList.remove("show");
  setTimeout(() => { if (!els.fillCard.classList.contains("show")) els.fillCard.hidden = true; }, 340);
}

// ---------- Carnet d'économies ----------
function fillLogForm(preselectId) {
  const favs = state.favs.map(stationById).filter((s) => s && s.prices[state.fuel]);
  const near = ranked.slice(0, 20).map((r) => r.station).filter((s) => !state.favs.includes(s.id));
  const opt = (s) => `<option value="${esc(s.id)}">${esc(stationName(s))} · ${esc(titleCase(s.ville))}</option>`;
  els.logStation.innerHTML =
    (favs.length ? `<optgroup label="Favoris">${favs.map(opt).join("")}</optgroup>` : "") +
    (near.length ? `<optgroup label="Autour de ${esc(originLabel())}">${near.map(opt).join("")}</optgroup>` : "");
  const pre = preselectId && stationById(preselectId);
  if (pre && ![...els.logStation.options].some((o) => o.value === pre.id)) els.logStation.insertAdjacentHTML("afterbegin", opt(pre));
  if (pre) els.logStation.value = pre.id;
  els.logLitres.value = String(vehicle().litres).replace(".", ",");
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
function renderLog() {
  const entries = state.log;
  const total = entries.reduce((sum, e) => sum + e.gain, 0);
  els.logTotal.innerHTML = entries.length
    ? `<p><b>${eur.format(total)}</b> ${total >= 0 ? "économisés" : "dépensés en plus"} sur ${entries.length} plein${entries.length > 1 ? "s" : ""} depuis le ${dateFmt.format(new Date(entries[entries.length - 1].date))}, par rapport au prix médian de la zone le jour du plein.</p>`
    : `<p>Note tes pleins pour voir ce que Plein Sud te fait économiser par rapport au prix médian de la zone.</p>`;
  els.logList.innerHTML = entries.map((e) => `<li class="log-item">
      <p>${esc(e.ville)} · ${esc(e.fuelLabel)}<small>${dateFmt.format(new Date(e.date))} · ${String(e.litres).replace(".", ",")} L à ${commaNum(e.price, 3)} €</small></p>
      <span class="log-gain${e.gain < 0 ? " neg" : ""}">${e.gain >= 0 ? "−" : "+"}${eur.format(Math.abs(e.gain))}</span>
      <button type="button" class="log-del" data-del="${esc(e.id)}" aria-label="Supprimer ce plein">${icon("i-close")}</button>
    </li>`).join("");
  if (!els.logStation.options.length) fillLogForm();
}

// ---------- Toast ----------
let toastTimer = 0;
function toast(text, action) {
  clearTimeout(toastTimer);
  els.toast.innerHTML = `<span>${esc(text)}</span>${action ? `<button type="button">${esc(action.label)}</button>` : ""}`;
  els.toast.hidden = false;
  if (action) els.toast.querySelector("button").onclick = () => { action.run(); hideToast(); };
  requestAnimationFrame(() => els.toast.classList.add("show"));
  toastTimer = setTimeout(hideToast, action ? 5000 : 3500);
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
els.start.addEventListener("click", () => { renderSettings(); openSheet(els.settingsSheet); });
for (const t of document.querySelectorAll(".tabs [role=tab]")) t.addEventListener("click", () => showView(t.dataset.view));
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
  launchNav(b.dataset.navApp, pendingNavStation);
});
els.settingsSheet.addEventListener("click", (e) => {
  const place = e.target.closest("[data-place]");
  if (place) { state.placeId = place.dataset.place; renderSettings(); return update(); }
  const prof = e.target.closest("[data-profile]");
  if (prof) { state.profileId = prof.dataset.profile; renderSettings(); return update(); }
  const nav = e.target.closest("[data-nav-pref]");
  if (nav) { state.nav = nav.dataset.navPref || null; renderSettings(); return update(); }
});
els.useGps.addEventListener("click", () => locate({ fromUser: true }));
els.radius.addEventListener("input", () => { state.radius = Number(els.radius.value); els.radiusOut.textContent = `${state.radius} km`; update(); });
for (const input of [els.litres, els.conso]) {
  input.addEventListener("change", () => {
    const l = parseNum(els.litres.value);
    const c = parseNum(els.conso.value);
    if (l > 0 && l < 200) state.custom.litres = l;
    if (c > 0 && c < 30) state.custom.conso = c;
    update();
  });
}
els.settingsForm.addEventListener("submit", (e) => { e.preventDefault(); closeSheet(els.settingsSheet); });

els.logStation.addEventListener("change", syncLogPrice);
els.logLitres.addEventListener("input", previewLog);
els.logPrice.addEventListener("input", previewLog);
els.logForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const s = stationById(els.logStation.value);
  const median = data.fuels[state.fuel]?.median;
  const litres = parseNum(els.logLitres.value);
  const price = parseNum(els.logPrice.value);
  if (!s || !median || !(litres > 0 && litres < 200) || !(price > 0.3 && price < 5)) {
    els.logPreview.textContent = "Vérifie les valeurs : entre 1 et 200 litres, et un prix au litre entre 0,30 et 5 €.";
    return;
  }
  state.log.unshift({
    id: `${Date.now()}`, date: new Date().toISOString(), stationId: s.id, ville: stationName(s),
    fuel: state.fuel, fuelLabel: fuelLabel(), litres, price, median, gain: Math.round((median - price) * litres * 100) / 100,
  });
  save();
  renderLog();
  toast("Plein ajouté au carnet");
});
els.fillYes.addEventListener("click", () => {
  const s = fillStation;
  hideFillCard();
  showView("log");
  fillLogForm(s?.id);
  els.logLitres.focus();
});
els.fillNo.addEventListener("click", hideFillCard);
// Un seul geste : le plein est noté avec les litres du véhicule et le prix affiché par la station.
els.fillQuick.addEventListener("click", () => {
  const s = fillStation;
  const p = s?.prices[state.fuel]?.[0];
  const median = data.fuels[state.fuel]?.median;
  if (!s || !p || !median) return;
  const litres = Number(vehicle().litres);
  const entry = {
    id: `${Date.now()}`, date: new Date().toISOString(), stationId: s.id, ville: stationName(s),
    fuel: state.fuel, fuelLabel: fuelLabel(), litres, price: p, median, gain: Math.round((median - p) * litres * 100) / 100,
  };
  state.log.unshift(entry);
  save();
  hideFillCard();
  if (view === "log") renderLog();
  toast(entry.gain >= 0 ? `Plein noté : ${eur.format(entry.gain)} économisés` : "Plein noté dans ton carnet", {
    label: "Annuler", run: () => { state.log = state.log.filter((x) => x.id !== entry.id); save(); if (view === "log") renderLog(); },
  });
});
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    if (state.gps) startWatch();
    checkReturnFromNav();
  } else {
    stopWatch(); // on garde le début de présence à la station : il compte encore au retour
  }
});

// ---------- Démarrage ----------
async function boot() {
  els.answerBody.innerHTML = `<div class="ans-head"><p class="ans-name">Plein Sud</p><p class="ans-ville">On cherche le meilleur plein autour de toi…</p></div>`;
  renderStart();
  if (state.placeId === "gps") locate(); // la position est demandée dès l'ouverture
  try {
    const res = await fetch("data/latest.json", { cache: "no-cache" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    data = await res.json();
  } catch {
    els.answerBody.innerHTML = `<div class="ans-head"><p class="ans-name">Prix indisponibles</p><p class="ans-ville">Impossible de charger les prix. Vérifie ta connexion puis recharge la page.</p></div>`;
    return;
  }
  renderFuels();
  render();
  renderFresh();
  stitchIn(1100);
  // Démonstration du pop-up de plein : ouvrir le site avec #demo-plein
  if (location.hash === "#demo-plein" && ranked[0]) setTimeout(() => showFillCard(ranked[0].station), 1500);
}

boot();

if ("serviceWorker" in navigator && location.protocol === "https:") {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
