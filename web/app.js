import { rankStations, bearingDeg, isOutOfStock } from "./rank.js";

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
const FUEL_ORDER = ["e10", "sp95", "sp98", "gazole", "e85", "gplc"];
const STORE_KEY = "plein-sud:v2";
const LIST_MAX = 15;
const MAP_MAX = 15;
const STALE_HOURS = 48;
const DEFAULTS = {
  fuel: "e10", placeId: "gps", gps: null, profileId: "mt450",
  custom: { litres: 14, conso: 4.5 }, radius: 15, favs: [], log: [],
};

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
const legAngles = new Map(); // angle cumulé par station, pour tourner par le plus court chemin

function loadState() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE_KEY) || "null");
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
const ABBR = { "av": "Avenue", "ave": "Avenue", "bd": "Boulevard", "bld": "Boulevard", "rte": "Route", "che": "Chemin", "ch": "Chemin", "pl": "Place", "imp": "Impasse" };
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
const priceLabel = (p) => `${p.toFixed(3).replace(".", ",")} euros le litre`;
const kmText = (d) => (d < 10 ? dec1.format(d) : String(Math.round(d)));
function ago(date) {
  const min = Math.max(0, Math.round((Date.now() - date.getTime()) / 60000));
  if (min < 60) return `il y a ${min} min`;
  const h = Math.round(min / 60);
  return h < 48 ? `il y a ${h} h` : `il y a ${Math.round(h / 24)} j`;
}
const parseNum = (v) => Number(String(v ?? "").trim().replace(/\s/g, "").replace(",", "."));
const commaNum = (n, digits) => n.toFixed(digits).replace(".", ",");
const hoursOld = (date) => (Date.now() - date.getTime()) / 3600000;
const capNum = (deg) => String(Math.round(deg) % 360).padStart(3, "0");
const capText = (deg) => `cap ${capNum(deg)}`;
const directions = (s) => `https://www.google.com/maps/dir/?api=1&destination=${s.lat},${s.lon}`;
const icon = (id, cls = "ic") => `<svg class="${cls}" aria-hidden="true"><use href="#${id}"/></svg>`;

// ---------- Éléments ----------
const $ = (id) => document.getElementById(id);
const els = {
  fresh: $("fresh"), start: $("start"), startText: $("startText"), fuels: $("fuels"),
  rb: $("rb"), favList: $("favList"), map: $("map"), mapNote: $("mapNote"),
  logTotal: $("logTotal"), logForm: $("logForm"), logStation: $("logStation"), logLitres: $("logLitres"),
  logPrice: $("logPrice"), logPreview: $("logPreview"), logList: $("logList"),
  stationSheet: $("stationSheet"), stationBody: $("stationBody"),
  settingsSheet: $("settingsSheet"), settingsForm: $("settingsForm"), places: $("places"), profiles: $("profiles"),
  custom: $("custom"), litres: $("litres"), conso: $("conso"), radius: $("radius"), radiusOut: $("radiusOut"),
  useGps: $("useGps"), useGpsText: $("useGpsText"), gpsHint: $("gpsHint"), toast: $("toast"),
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
const stationById = (id) => data.stations.find((s) => s.id === id);
const isFav = (id) => state.favs.includes(id);

function computeRanking() {
  const v = vehicle();
  const usable = data.stations.filter((s) => !isOutOfStock(s, state.fuel));
  ranked = rankStations(usable, state.fuel, origin(), {
    litres: Number(v.litres) || 1,
    conso: Number(v.conso) || 0,
    radiusKm: state.radius,
  });
  const o = origin();
  ranked.forEach((r, i) => { r.bearing = bearingDeg(o, r.station); r.rank = i + 1; });
}

// ---------- Tulipe (cap de la station depuis le point de départ) ----------
// Station devant ou sur le côté : la branche tourne vers le cap.
// Station derrière (cap entre 115° et 245°) : demi-tour en épingle, comme sur un vrai roadbook.
const isBehind = (deg) => deg > 115 && deg < 245;
function tulipHTML(stationId, bearing) {
  if (isBehind(bearing)) {
    legAngles.delete(stationId);
    const right = bearing < 180;
    const d = right
      ? "M24 24V13a7 7 0 0 1 14 0v22M33 30l5 6 5-6"
      : "M24 24V13a7 7 0 0 0-14 0v22M5 30l5 6 5-6";
    return `<svg class="tulip" viewBox="0 0 48 48" aria-hidden="true">
      <circle class="start-dot" cx="24" cy="42" r="3.4"/>
      <path class="road" d="M24 39V24"/>
      <path class="road hairpin" d="${d}"/>
      <circle class="junction" cx="24" cy="24" r="3.2"/>
    </svg>`;
  }
  const prev = legAngles.get(stationId);
  let target = bearing;
  if (prev !== undefined) {
    const delta = ((bearing - (prev % 360) + 540) % 360) - 180;
    target = prev + delta;
  }
  return `<svg class="tulip" viewBox="0 0 48 48" aria-hidden="true">
    <circle class="start-dot" cx="24" cy="42" r="3.4"/>
    <path class="road" d="M24 39V24"/>
    <g class="leg" data-id="${esc(stationId)}" data-from="${prev ?? target}" data-to="${target}" style="transform: rotate(${prev ?? target}deg)">
      <path class="road" d="M24 24V7.5M18.5 13 24 7l5.5 6"/>
    </g>
    <circle class="junction" cx="24" cy="24" r="3.2"/>
  </svg>`;
}
function settleTulips(root) {
  const legs = root.querySelectorAll(".leg");
  if (!legs.length) return;
  void root.offsetHeight; // fige l'angle de départ avant de tourner
  requestAnimationFrame(() => requestAnimationFrame(() => {
    for (const leg of legs) {
      const to = Number(leg.dataset.to);
      legAngles.set(leg.dataset.id, to);
      if (Number(leg.dataset.from) !== to) leg.style.transform = `rotate(${to}deg)`;
    }
  }));
}

// ---------- Rendu : barre et carburants ----------
function renderStart() {
  const v = vehicle();
  els.start.classList.toggle("locating", locating);
  els.startText.textContent = locating
    ? "Recherche de ta position…"
    : `Depuis ${originLabel()} · ${v.short} · ${state.radius} km`;
}
function renderFuels() {
  const fuels = FUEL_ORDER.filter((f) => data.fuels[f]);
  if (!fuels.includes(state.fuel)) state.fuel = fuels[0];
  els.fuels.innerHTML = fuels.map((f) => `<button type="button" role="radio" class="fuel" data-fuel="${f}"
      aria-checked="${f === state.fuel}"><b>${esc(data.fuels[f].label)}</b><small>${data.fuels[f].stations}</small></button>`).join("");
}

// ---------- Rendu : roadbook ----------
function caseHTML(r, index, best) {
  const s = r.station;
  const lead = index === 0;
  const stale = hoursOld(r.updatedAt) > STALE_HOURS;
  const flag = stale ? `<span class="flag">${icon("i-caution")}prix ${ago(r.updatedAt)}</span>` : "";
  const no = `<span class="no" aria-hidden="true">${r.rank ?? "–"}</span>`;
  const km = `<span class="km">${no}${kmText(r.distanceKm)}<small>km</small></span>`;
  const cap = `<span class="cap">${tulipHTML(s.id, r.bearing)}<small>${capNum(r.bearing)}°</small></span>`;
  if (lead) {
    const save = r.gain > 0.05
      ? `<span class="lead-save">−${eur.format(r.gain)} vs la plus proche</span>`
      : `<span class="lead-save neutral">${r.isNearest ? "C'est aussi la plus proche" : "Même total que la plus proche"}</span>`;
    return `<button type="button" class="case-btn" data-open="${esc(s.id)}" aria-label="${esc(stationName(s))}, ${esc(titleCase(s.ville))}, ${priceLabel(r.price)}, ${kmText(r.distanceKm)} kilomètres. Ouvrir la station">
        ${km}${cap}
        <span class="notes">
          <span class="ville"><span class="mark-hl">${esc(stationName(s))}</span></span>
          <span class="n-sub"><span class="addr">${esc(titleCase(s.ville))}</span></span>
          <span class="lead-price"><span class="price">${priceHTML(r.price)}</span><span class="unit">€/L</span></span>
          <span class="lead-total"><b>${eur.format(r.total)}</b> le plein avec détour</span>
          ${save}
          ${flag || `<span class="n-sub">prix affiché ${ago(r.updatedAt)}</span>`}
        </span>
      </button>
      <div class="lead-actions">
        <a class="btn btn-ink" href="${directions(s)}" target="_blank" rel="noopener">${icon("i-go")}Y aller</a>
        <button type="button" class="icon-btn star-btn" data-fav="${esc(s.id)}" aria-pressed="${isFav(s.id)}" aria-label="${isFav(s.id) ? "Retirer des favoris" : "Ajouter aux favoris"}">${icon("i-star")}</button>
      </div>`;
  }
  const delta = r.total - best.total;
  const right = r.posLabel ?? (delta < 0.005 ? "même total" : `+${eur.format(delta)}`);
  return `<button type="button" class="case-btn" data-open="${esc(s.id)}" aria-label="${esc(stationName(s))}, ${esc(titleCase(s.ville))}, ${priceLabel(r.price)}, ${kmText(r.distanceKm)} kilomètres, ${esc(right)}. Ouvrir la station">
      ${km}${cap}
      <span class="notes">
        <span class="n-top"><span class="ville">${esc(stationName(s))}</span><span class="price">${priceHTML(r.price)}</span></span>
        <span class="n-sub"><span class="addr">${esc(titleCase(s.ville))}</span><span class="gap">${esc(right)}</span></span>
        ${flag}
      </span>
    </button>`;
}

// Réordonnancement : chaque case glisse de son ancienne place à la nouvelle (FLIP).
function renderCases(list, rows, { lead = true } = {}) {
  const before = new Map();
  for (const li of list.children) if (li.dataset.id) before.set(li.dataset.id, li.getBoundingClientRect().top);
  const existing = new Map([...list.children].filter((li) => li.dataset.id).map((li) => [li.dataset.id, li]));
  const best = rows[0];
  const nodes = rows.map((r, i) => {
    const li = existing.get(r.station.id) || document.createElement("li");
    li.className = `case${lead && i === 0 ? " lead" : ""}`;
    li.dataset.id = r.station.id;
    li.innerHTML = caseHTML(r, lead ? i : i + 1, best);
    return li;
  });
  list.replaceChildren(...nodes);
  settleTulips(list);
  if (reduceMotion.matches || firstRender) return nodes;
  nodes.forEach((li, i) => {
    const prev = before.get(li.dataset.id);
    if (prev === undefined) {
      li.animate([{ opacity: 0, transform: "translateY(-6px)" }, { opacity: 1, transform: "none" }],
        { duration: 220, easing: EASE_OUT, delay: Math.min(i, 8) * 30, fill: "backwards" });
      return;
    }
    const dy = prev - li.getBoundingClientRect().top;
    if (Math.abs(dy) > 1) li.animate([{ transform: `translateY(${dy}px)` }, { transform: "none" }], { duration: 260, easing: EASE_IN_OUT });
  });
  return nodes;
}

function renderRank() {
  if (!ranked.length) {
    els.rb.innerHTML = `<li class="empty"><p>Aucune station ne vend du ${esc(data.fuels[state.fuel]?.label)} à moins de ${state.radius} km de ${esc(originLabel())} avec un prix récent.</p>
      <button type="button" class="btn btn-ink" data-widen>Chercher jusqu'à ${Math.min(state.radius + 10, 40)} km</button></li>`;
    lastLeadKey = "";
    return;
  }
  const nodes = renderCases(els.rb, ranked.slice(0, LIST_MAX));
  const leadKey = `${ranked[0].station.id}|${state.fuel}|${ranked[0].total.toFixed(2)}`;
  if (firstRender) {
    nodes.forEach((li, i) => li.style.setProperty("--i", Math.min(i, 10)));
    els.rb.classList.add("unroll");
    setTimeout(() => els.rb.classList.remove("unroll"), 900);
  }
  if (leadKey !== lastLeadKey) {
    const lead = nodes[0];
    lead.classList.remove("swipe");
    void lead.offsetWidth; // relance le coup de surligneur
    lead.classList.add("swipe");
  }
  lastLeadKey = leadKey;
}

function renderFavs() {
  if (!state.favs.length) {
    els.favList.innerHTML = `<li class="empty"><p>Pas encore de station favorite. Ouvre une station et touche l'étoile pour la retrouver ici, avec son prix du jour.</p></li>`;
    return;
  }
  const v = vehicle();
  const favStations = state.favs.map(stationById).filter(Boolean);
  const rows = rankStations(favStations, state.fuel, origin(), { litres: Number(v.litres) || 1, conso: Number(v.conso) || 0, radiusKm: 500 });
  const o = origin();
  for (const r of rows) {
    r.bearing = bearingDeg(o, r.station);
    const pos = ranked.findIndex((x) => x.station.id === r.station.id);
    r.posLabel = pos >= 0 ? `${pos + 1}${pos === 0 ? "re" : "e"} au classement` : "hors rayon";
    r.rank = pos >= 0 ? pos + 1 : null;
  }
  const missing = favStations.length - rows.length;
  if (!rows.length) {
    els.favList.innerHTML = `<li class="empty"><p>Tes favoris n'ont pas de prix récent en ${esc(data.fuels[state.fuel]?.label)}.</p></li>`;
    return;
  }
  renderCases(els.favList, rows, { lead: false });
  if (missing > 0) {
    const li = document.createElement("li");
    li.className = "empty";
    li.innerHTML = `<p>${missing} favori${missing > 1 ? "s" : ""} sans prix récent en ${esc(data.fuels[state.fuel]?.label)}.</p>`;
    els.favList.append(li);
  }
}

function renderFresh() {
  const t = new Date(data.generated_at);
  els.fresh.textContent = `Relevé ${ago(t)}`;
  els.fresh.title = t.toLocaleString("fr-FR");
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
function update() {
  save();
  render();
}

// ---------- Onglets ----------
function showView(next) {
  if (next === view) return;
  view = next;
  for (const t of document.querySelectorAll(".tabs [role=tab]")) t.setAttribute("aria-selected", String(t.dataset.view === next));
  for (const id of ["rank", "map", "fav", "log"]) {
    const el = $(`view-${id}`);
    el.hidden = id !== next;
    if (id === next) {
      el.classList.remove("entering");
      void el.offsetWidth;
      el.classList.add("entering");
    }
  }
  if (next === "fav") renderFavs();
  if (next === "map") renderMap();
  if (next === "log") renderLog();
  window.scrollTo({ top: 0 });
}

// ---------- Carte (Leaflet chargé à la demande) ----------
let L = null;
let map = null;
let markerLayer = null;
let tileLayer = null;
function loadLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  return new Promise((resolve, reject) => {
    const css = document.createElement("link");
    css.rel = "stylesheet";
    css.href = "vendor/leaflet/leaflet.css";
    document.head.append(css);
    const js = document.createElement("script");
    js.src = "vendor/leaflet/leaflet.js";
    js.onload = () => resolve(window.L);
    js.onerror = reject;
    document.head.append(js);
  });
}
function tiles() {
  const style = darkScheme.matches ? "dark_all" : "light_all";
  return L.tileLayer(`https://{s}.basemaps.cartocdn.com/${style}/{z}/{x}/{y}{r}.png`, {
    maxZoom: 19, subdomains: "abcd",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
  });
}
async function renderMap() {
  try {
    L = L || (await loadLeaflet());
  } catch {
    els.mapNote.textContent = "La carte n'a pas pu se charger. Vérifie ta connexion, le classement reste disponible.";
    return;
  }
  if (!map) {
    map = L.map(els.map, { zoomControl: false, attributionControl: true });
    L.control.zoom({ position: "bottomright" }).addTo(map);
    tileLayer = tiles().addTo(map);
    markerLayer = L.layerGroup().addTo(map);
    darkScheme.addEventListener("change", () => { map.removeLayer(tileLayer); tileLayer = tiles().addTo(map); });
  }
  markerLayer.clearLayers();
  const o = origin();
  L.marker([o.lat, o.lon], { icon: L.divIcon({ className: "", html: '<span class="pin me"></span>', iconSize: [16, 16] }), title: "Point de départ", keyboard: false }).addTo(markerLayer);
  const shown = ranked.slice(0, MAP_MAX);
  shown.slice().reverse().forEach((r) => {
    const i = ranked.indexOf(r);
    const size = i === 0 ? 34 : 26;
    L.marker([r.station.lat, r.station.lon], {
      icon: L.divIcon({ className: "", html: `<span class="pin${i === 0 ? " top" : ""}">${i + 1}</span>`, iconSize: [size, size] }),
      title: `${i + 1}. ${stationName(r.station)}, ${r.price.toFixed(3)} €`,
      zIndexOffset: (MAP_MAX - i) * 100,
    }).on("click", () => openStation(r.station.id)).addTo(markerLayer);
  });
  const pts = [[o.lat, o.lon], ...shown.slice(0, 10).map((r) => [r.station.lat, r.station.lon])];
  map.invalidateSize();
  map.fitBounds(pts, { padding: [36, 36], maxZoom: 14 });
}

// ---------- Fiche station ----------
function openStation(id) {
  const s = stationById(id);
  if (!s) return;
  const r = ranked.find((x) => x.station.id === id);
  const o = origin();
  const pos = r ? ranked.indexOf(r) + 1 : null;
  const prices = FUEL_ORDER.filter((f) => s.prices[f]).map((f) => {
    const [p, t] = s.prices[f];
    const d = new Date(t);
    const name = f === state.fuel ? `<span class="mark-hl">${esc(data.fuels[f]?.label ?? f)}</span>` : esc(data.fuels[f]?.label ?? f);
    const out = isOutOfStock(s, f) ? " · rupture signalée" : "";
    return `<li><span class="fuel-name">${name}</span><span class="price">${priceHTML(p)}</span><small>prix affiché ${ago(d)}${out}</small></li>`;
  }).join("");
  const facts = [
    s.automate_24_24 ? ["Automate 24 h/24", esc(s.automate_24_24)] : null,
    s.horaires ? ["Horaires", esc(s.horaires)] : null,
    s.services ? ["Services", esc(s.services)] : null,
    s.indisponibles ? ["Ruptures", esc(s.indisponibles)] : null,
  ].filter(Boolean);
  const brg = bearingDeg(o, s);
  const strip = r ? `<div class="st-case"><span class="km"><span class="no" aria-hidden="true">${r.rank}</span>${kmText(r.distanceKm)}<small>km</small></span><span class="cap">${tulipHTML(`sheet-${s.id}`, brg)}<small>${capNum(brg)}°</small></span><p class="st-case-txt">depuis ${esc(originLabel())}<br>${r.rank}${r.rank === 1 ? "re" : "e"} au classement</p></div>` : "";
  const where = `${capText(brg)} depuis ${esc(originLabel())}`;
  els.stationBody.innerHTML = `
    <div class="grabber" aria-hidden="true"></div>
    <div class="sheet-head">
      <div>
        <h2 id="stTitle">${esc(stationName(s))}</h2>
        <p>${esc(titleCase(s.ville))}${s.cp ? ` · ${esc(s.cp)}` : ""}</p>
        ${r ? "" : `<p>${where} · hors rayon</p>`}
      </div>
      <button class="icon-btn" type="button" data-close aria-label="Fermer">${icon("i-close")}</button>
    </div>
    ${strip}
    ${r ? `<p class="lead-total"><b>${eur.format(r.total)}</b> le plein de ${esc(data.fuels[state.fuel]?.label)}, détour compris</p>` : ""}
    <ul class="st-prices" aria-label="Prix dans cette station">${prices}</ul>
    ${facts.length ? `<dl class="st-facts">${facts.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("")}</dl>` : ""}
    <div class="st-actions">
      <a class="btn btn-ink" href="${directions(s)}" target="_blank" rel="noopener">${icon("i-go")}Y aller</a>
      <button type="button" class="icon-btn star-btn" data-fav="${esc(s.id)}" aria-pressed="${isFav(s.id)}" aria-label="${isFav(s.id) ? "Retirer des favoris" : "Ajouter aux favoris"}">${icon("i-star")}</button>
      ${navigator.share ? `<button type="button" class="icon-btn" data-share="${esc(s.id)}" aria-label="Partager la station">${icon("i-share")}</button>` : ""}
    </div>
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
  const done = () => { if (dlg.open && !dlg.classList.contains("is-open")) dlg.close(); };
  setTimeout(done, 340);
}

// Glisser vers le bas pour fermer, depuis la poignée ou l'en-tête du panneau.
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
  els.custom.hidden = state.profileId !== "custom";
  els.litres.value = state.custom.litres;
  els.conso.value = state.custom.conso;
  els.radius.value = state.radius;
  els.radiusOut.textContent = `${state.radius} km`;
  els.useGps.setAttribute("aria-pressed", String(state.placeId === "gps"));
  els.useGpsText.textContent = locating ? "Recherche de ta position…" : state.gps && state.placeId === "gps" ? "Ma position (active)" : "Ma position";
}

// ---------- Géolocalisation ----------
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
    { enableHighAccuracy: false, timeout: 12000, maximumAge: 120000 },
  );
}
function hint(text) {
  els.gpsHint.textContent = text;
  els.gpsHint.hidden = !text;
}

// ---------- Carnet d'économies ----------
function logStations() {
  const favs = state.favs.map(stationById).filter((s) => s && s.prices[state.fuel]);
  const near = ranked.slice(0, 20).map((r) => r.station).filter((s) => !state.favs.includes(s.id));
  return { favs, near };
}
function fillLogForm(preselectId) {
  const { favs, near } = logStations();
  const opt = (s) => `<option value="${esc(s.id)}">${esc(stationName(s))} · ${esc(titleCase(s.ville))}</option>`;
  els.logStation.innerHTML =
    (favs.length ? `<optgroup label="Favoris">${favs.map(opt).join("")}</optgroup>` : "") +
    (near.length ? `<optgroup label="Autour de ${esc(originLabel())}">${near.map(opt).join("")}</optgroup>` : "");
  const pre = preselectId && stationById(preselectId);
  if (pre && ![...els.logStation.options].some((o) => o.value === pre.id)) {
    els.logStation.insertAdjacentHTML("afterbegin", opt(pre));
  }
  if (pre) els.logStation.value = pre.id;
  els.logLitres.value = String(vehicle().litres).replace(".", ",");
  syncLogPrice();
}
function syncLogPrice() {
  const s = stationById(els.logStation.value);
  const p = s?.prices[state.fuel]?.[0];
  if (p) els.logPrice.value = commaNum(p, 3);
  previewLog();
}
function previewLog() {
  const median = data.fuels[state.fuel]?.median;
  const litres = parseNum(els.logLitres.value);
  const price = parseNum(els.logPrice.value);
  if (!median || !(litres > 0) || !(price > 0)) { els.logPreview.textContent = litres || price ? "Saisis des litres et un prix au litre valides, par exemple 14 et 1,989." : ""; return; }
  const gain = (median - price) * litres;
  els.logPreview.textContent = gain >= 0
    ? `Économie estimée : ${eur.format(gain)} par rapport au prix médian de la zone (${median.toFixed(3).replace(".", ",")} €).`
    : `${eur.format(-gain)} de plus que le prix médian de la zone (${median.toFixed(3).replace(".", ",")} €).`;
}
function renderLog() {
  const entries = state.log;
  const total = entries.reduce((sum, e) => sum + e.gain, 0);
  els.logTotal.innerHTML = entries.length
    ? `<p><b>${eur.format(total)}</b> ${total >= 0 ? "économisés" : "dépensés en plus"} sur ${entries.length} plein${entries.length > 1 ? "s" : ""} depuis le ${dateFmt.format(new Date(entries[entries.length - 1].date))}, par rapport au prix médian de la zone le jour du plein.</p>`
    : `<p>Note tes pleins pour voir ce que le classement te fait économiser par rapport au prix médian de la zone.</p>`;
  els.logList.innerHTML = entries.map((e) => `<li class="log-item">
      <p>${esc(titleCase(e.ville))} · ${esc(e.fuelLabel)}<small>${dateFmt.format(new Date(e.date))} · ${String(e.litres).replace(".", ",")} L à ${e.price.toFixed(3).replace(".", ",")} €</small></p>
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

document.addEventListener("click", (e) => {
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
      if (!reduceMotion.matches) b.animate([{ transform: "scale(0.9)" }, { transform: "none" }], { duration: 200, easing: EASE_OUT });
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
      text: `${data.fuels[state.fuel]?.label} à ${p ? p.toFixed(3).replace(".", ",") + " €" : "?"} : ${stationName(s)}, ${titleCase(s.ville)}`,
      url: directions(s),
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
  if (e.target.closest("[data-widen]")) {
    state.radius = Math.min(state.radius + 10, 40);
    return update();
  }
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

for (const dlg of [els.stationSheet, els.settingsSheet]) {
  enableDragToClose(dlg);
  dlg.addEventListener("click", (e) => { if (e.target.closest("[data-close]")) closeSheet(dlg); });
  dlg.addEventListener("cancel", (e) => { e.preventDefault(); closeSheet(dlg); });
}
els.settingsSheet.addEventListener("click", (e) => {
  const place = e.target.closest("[data-place]");
  if (place) { state.placeId = place.dataset.place; renderSettings(); return update(); }
  const prof = e.target.closest("[data-profile]");
  if (prof) { state.profileId = prof.dataset.profile; renderSettings(); return update(); }
});
els.useGps.addEventListener("click", () => locate({ fromUser: true }));
els.radius.addEventListener("input", () => { state.radius = Number(els.radius.value); els.radiusOut.textContent = `${state.radius} km`; update(); });
for (const input of [els.litres, els.conso]) {
  input.addEventListener("change", () => {
    if (Number(els.litres.value) > 0) state.custom.litres = Number(els.litres.value);
    if (Number(els.conso.value) > 0) state.custom.conso = Number(els.conso.value);
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
    fuel: state.fuel, fuelLabel: data.fuels[state.fuel]?.label ?? state.fuel,
    litres, price, median, gain: Math.round((median - price) * litres * 100) / 100,
  });
  save();
  renderLog();
  toast("Plein ajouté au carnet");
});

// ---------- Démarrage ----------
function skeleton() {
  els.rb.innerHTML = Array.from({ length: 5 }, () => `<li class="case skeleton"><div class="case-btn"><span class="km">00</span><span class="cap"></span><span class="notes"><span>Station</span><span>Adresse</span></span></div></li>`).join("");
}

async function boot() {
  skeleton();
  renderStart();
  // Demande la position dès l'ouverture, sauf si un point de départ fixe a été choisi.
  if (state.placeId === "gps") locate();
  try {
    const res = await fetch("data/latest.json", { cache: "no-cache" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    data = await res.json();
  } catch {
    els.rb.innerHTML = `<li class="empty"><p>Impossible de charger les prix. Vérifie ta connexion puis recharge la page.</p></li>`;
    els.fresh.textContent = "Hors ligne";
    return;
  }
  renderFresh();
  renderFuels();
  render();
}

boot();

if ("serviceWorker" in navigator && location.protocol === "https:") {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
