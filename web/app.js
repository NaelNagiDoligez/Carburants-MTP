import { rankStations } from "./rank.js";

// ---------- Réglages ----------
const PLACES = [
  { id: "comedie", label: "Place de la Comédie", lat: 43.6084, lon: 3.8796 },
  { id: "saint-roch", label: "Gare Saint-Roch", lat: 43.6032, lon: 3.8809 },
  { id: "odysseum", label: "Odysseum", lat: 43.6046, lon: 3.9186 },
  { id: "triolet", label: "Campus Triolet", lat: 43.6318, lon: 3.8613 },
];
const PROFILES = [
  { id: "mt450", label: "CFMoto 450MT", detail: "14 L · 4,5 L/100", litres: 14, conso: 4.5 },
  { id: "scooter", label: "Scooter 125", detail: "6 L · 2,8 L/100", litres: 6, conso: 2.8 },
  { id: "car", label: "Voiture", detail: "40 L · 6,5 L/100", litres: 40, conso: 6.5 },
  { id: "custom", label: "Personnalisé", detail: "tes valeurs" },
];
const FUEL_ORDER = ["e10", "sp95", "sp98", "gazole", "e85", "gplc"];
const STORE_KEY = "plein-sud:v1";
const LIST_MAX = 12;

const DEFAULTS = {
  fuel: "e10",
  placeId: "comedie",
  gps: null,
  profileId: "mt450",
  custom: { litres: 14, conso: 4.5 },
  radius: 15,
};

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const EASE_OUT = "cubic-bezier(0.23, 1, 0.32, 1)";
const EASE_IN_OUT = "cubic-bezier(0.77, 0, 0.175, 1)";

// ---------- État ----------
let state = loadState();
let data = null;
let firstRender = true;
let lastBestKey = "";

function loadState() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE_KEY) || "null");
    return raw ? { ...DEFAULTS, ...raw, custom: { ...DEFAULTS.custom, ...(raw.custom || {}) } } : { ...DEFAULTS };
  } catch {
    return { ...DEFAULTS };
  }
}
function saveState() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(state));
  } catch {
    /* stockage indisponible : on continue sans mémoriser */
  }
}

// ---------- Formats ----------
const eur = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });
const num1 = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 });

// Les pompes françaises affichent 3 décimales, la dernière en petit : 2,11⁹.
function priceHTML(p) {
  const s = p.toFixed(3).replace(".", ",");
  return `${s.slice(0, -1)}<sup>${s.slice(-1)}</sup>`;
}
function km(d) {
  return `${d < 10 ? num1.format(d) : Math.round(d)} km`;
}
function ago(date) {
  const min = Math.max(0, Math.round((Date.now() - date.getTime()) / 60000));
  if (min < 60) return `il y a ${min} min`;
  const h = Math.round(min / 60);
  if (h < 48) return `il y a ${h} h`;
  return `il y a ${Math.round(h / 24)} j`;
}
function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}
function titleCase(s) {
  return String(s ?? "").toLowerCase().replace(/(^|[\s'-])(\p{L})/gu, (m, a, b) => a + b.toUpperCase());
}
function directions(s) {
  return `https://www.google.com/maps/dir/?api=1&destination=${s.lat},${s.lon}`;
}

// ---------- Sélecteurs ----------
const $ = (id) => document.getElementById(id);
const els = {
  fresh: $("fresh"), fuels: $("fuels"), context: $("context"), contextText: $("contextText"),
  best: $("best"), list: $("list"), sheet: $("sheet"), form: $("sheetForm"),
  places: $("places"), profiles: $("profiles"), custom: $("custom"), litres: $("litres"), conso: $("conso"),
  radius: $("radius"), radiusOut: $("radiusOut"), locate: $("locate"), locateText: $("locateText"), locateHint: $("locateHint"),
};

function origin() {
  if (state.placeId === "gps" && state.gps) return state.gps;
  return PLACES.find((p) => p.id === state.placeId) || PLACES[0];
}
function originLabel() {
  if (state.placeId === "gps" && state.gps) return "ta position";
  const p = PLACES.find((x) => x.id === state.placeId) || PLACES[0];
  return p.label.replace(/^Place de la /, "la ");
}
function vehicle() {
  if (state.profileId === "custom") return { label: "Personnalisé", ...state.custom };
  return PROFILES.find((p) => p.id === state.profileId) || PROFILES[0];
}

// ---------- Rendu ----------
function renderFuels() {
  const fuels = FUEL_ORDER.filter((f) => data.fuels[f]);
  if (!fuels.includes(state.fuel)) state.fuel = fuels[0];
  els.fuels.innerHTML = fuels
    .map((f) => {
      const info = data.fuels[f];
      return `<button type="button" class="chip" data-fuel="${f}" aria-pressed="${f === state.fuel}">
        <b>${esc(info.label)}</b><small>${info.stations}</small></button>`;
    })
    .join("");
}

function renderContext() {
  const v = vehicle();
  els.contextText.textContent = `Depuis ${originLabel()} · ${v.label} · ${state.radius} km`;
}

function renderResults() {
  const v = vehicle();
  const ranked = rankStations(data.stations, state.fuel, origin(), {
    litres: Number(v.litres) || 1,
    conso: Number(v.conso) || 0,
    radiusKm: state.radius,
  });
  const fuelLabel = data.fuels[state.fuel]?.label ?? state.fuel;

  if (!ranked.length) {
    els.best.className = "best";
    els.best.innerHTML = "";
    els.best.hidden = true;
    els.list.innerHTML = `<li class="empty"><p>Aucune station avec du ${esc(fuelLabel)} à moins de ${state.radius} km de ${esc(originLabel())}.</p>
      <button type="button" class="btn" data-widen>Chercher jusqu'à ${Math.min(state.radius + 10, 40)} km</button></li>`;
    lastBestKey = "";
    return;
  }
  els.best.hidden = false;
  renderBest(ranked[0], fuelLabel);
  renderList(ranked.slice(1, LIST_MAX + 1), ranked[0], ranked.length);
}

function renderBest(r, fuelLabel) {
  const s = r.station;
  const key = `${s.id}|${state.fuel}|${r.total.toFixed(2)}`;
  const saving =
    r.gain > 0.05
      ? `<span class="saving">${eur.format(r.gain)} de moins que la plus proche</span>`
      : `<span class="saving neutral">${r.isNearest ? "C'est aussi la plus proche" : "Au même prix que la plus proche"}</span>`;
  els.best.className = "best";
  els.best.innerHTML = `
    <div class="best-head">
      <div>
        <p class="eyebrow">Meilleur plein · ${esc(fuelLabel)}</p>
        <p class="best-name">${esc(titleCase(s.ville))}</p>
        <p class="best-addr">${esc(s.adresse)}</p>
      </div>
      <span class="dist">${km(r.distanceKm)}</span>
    </div>
    <div class="board">
      <p class="led" aria-label="${r.price.toFixed(3).replace(".", ",")} euros le litre">${priceHTML(r.price)}<span class="unit">€/L</span></p>
      <p class="total"><b>${eur.format(r.total)}</b><span>le plein, détour compris</span></p>
    </div>
    <p class="best-age">Prix affiché par la station ${ago(r.updatedAt)}</p>
    <div class="best-foot">
      ${saving}
      <a class="go" href="${directions(s)}" target="_blank" rel="noopener">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 11 21 3l-8 18-2-8-8-2Z"/></svg>
        Y aller</a>
    </div>
    ${noteHTML()}`;
  if (!firstRender && key !== lastBestKey && !reduceMotion.matches) {
    els.best.animate(
      [{ opacity: 0.35, transform: "translateY(4px)" }, { opacity: 1, transform: "none" }],
      { duration: 200, easing: EASE_OUT },
    );
  } else if (!firstRender && key !== lastBestKey) {
    els.best.animate([{ opacity: 0.35 }, { opacity: 1 }], { duration: 200, easing: "ease" });
  }
  lastBestKey = key;
}

function noteHTML() {
  if (state.fuel === "sp95" && (data.fuels.sp95?.stations ?? 0) < 80) {
    return `<p class="note">Peu de stations vendent encore du SP95. Le SP95-E10 est bien plus répandu : vérifie dans le manuel de ton véhicule s'il l'accepte.</p>`;
  }
  return "";
}

function rowHTML(r, best, i) {
  const s = r.station;
  const delta = r.total - best.total;
  return `<a href="${directions(s)}" target="_blank" rel="noopener">
    <span class="rank">${i + 2}</span>
    <span class="row-name">${esc(titleCase(s.ville))}</span>
    <span class="row-price">${priceHTML(r.price)}</span>
    <span class="row-meta">${km(r.distanceKm)} · ${esc(s.adresse)}</span>
    <span class="row-delta">${delta < 0.005 ? "même total" : `+${eur.format(delta)}`}</span></a>`;
}

// Réordonnancement animé (technique FLIP) : chaque station glisse de son ancienne place à la nouvelle.
function renderList(rows, best, total) {
  const before = new Map();
  for (const li of els.list.children) if (li.dataset.id) before.set(li.dataset.id, li.getBoundingClientRect().top);

  const existing = new Map([...els.list.children].filter((li) => li.dataset.id).map((li) => [li.dataset.id, li]));
  const nodes = rows.map((r, i) => {
    const li = existing.get(r.station.id) || document.createElement("li");
    li.className = "row";
    li.dataset.id = r.station.id;
    li.innerHTML = rowHTML(r, best, i);
    return li;
  });
  els.list.replaceChildren(...nodes);
  els.list.setAttribute("aria-label", `${total - 1} autres stations dans le rayon`);

  if (firstRender) {
    // Entrée échelonnée, une seule fois (les styles gèrent prefers-reduced-motion).
    nodes.forEach((li, i) => li.style.setProperty("--i", Math.min(i + 1, 10)));
    els.list.classList.add("enter");
    els.best.classList.add("rise");
    setTimeout(() => {
      els.list.classList.remove("enter");
      els.best.classList.remove("rise");
    }, 900);
    return;
  }

  nodes.forEach((li, i) => {
    const prevTop = before.get(li.dataset.id);
    if (reduceMotion.matches) {
      if (prevTop === undefined) li.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: "ease" });
      return;
    }
    if (prevTop === undefined) {
      li.animate(
        [{ opacity: 0, transform: "translateY(6px)" }, { opacity: 1, transform: "none" }],
        { duration: 220, easing: EASE_OUT, delay: Math.min(i, 8) * 30, fill: "backwards" },
      );
      return;
    }
    const dy = prevTop - li.getBoundingClientRect().top;
    if (Math.abs(dy) < 1) return;
    li.animate([{ transform: `translateY(${dy}px)` }, { transform: "none" }], { duration: 250, easing: EASE_IN_OUT });
  });
}

function renderFresh() {
  const t = new Date(data.generated_at);
  els.fresh.textContent = `Prix relevés ${ago(t)}`;
  els.fresh.title = t.toLocaleString("fr-FR");
}

function renderAll() {
  renderFuels();
  renderContext();
  renderResults();
  firstRender = false;
}

function update() {
  saveState();
  renderContext();
  for (const b of els.fuels.querySelectorAll(".chip")) b.setAttribute("aria-pressed", String(b.dataset.fuel === state.fuel));
  renderResults();
}

// ---------- Panneau de réglages ----------
function renderSheet() {
  els.places.innerHTML = PLACES.map(
    (p) => `<button type="button" class="choice" data-place="${p.id}" aria-pressed="${state.placeId === p.id}">${esc(p.label)}</button>`,
  ).join("");
  els.profiles.innerHTML = PROFILES.map(
    (p) => `<button type="button" class="choice" data-profile="${p.id}" aria-pressed="${state.profileId === p.id}">
      ${esc(p.label)}<small>${esc(p.detail)}</small></button>`,
  ).join("");
  els.custom.hidden = state.profileId !== "custom";
  els.litres.value = state.custom.litres;
  els.conso.value = state.custom.conso;
  els.radius.value = state.radius;
  els.radiusOut.textContent = `${state.radius} km`;
  els.locate.setAttribute("aria-pressed", String(state.placeId === "gps" && !!state.gps));
}

function openSheet() {
  renderSheet();
  els.sheet.showModal();
  requestAnimationFrame(() => requestAnimationFrame(() => els.sheet.classList.add("is-open")));
}
function closeSheet() {
  if (!els.sheet.open) return;
  els.sheet.classList.remove("is-open");
  const sheet = els.form;
  const done = () => {
    sheet.removeEventListener("transitionend", done);
    if (els.sheet.open) els.sheet.close();
  };
  sheet.addEventListener("transitionend", done);
  setTimeout(done, 380);
}

function locate() {
  if (!("geolocation" in navigator)) {
    showHint("Ton navigateur ne donne pas accès à la position. Choisis un point de départ ci-dessous.");
    return;
  }
  els.locateText.textContent = "Recherche de ta position…";
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      state.gps = { lat: pos.coords.latitude, lon: pos.coords.longitude };
      state.placeId = "gps";
      els.locateText.textContent = "Position trouvée";
      showHint("");
      renderSheet();
      update();
    },
    (err) => {
      els.locateText.textContent = "Utiliser ma position";
      showHint(
        err.code === 1
          ? "Position refusée. Autorise-la dans les réglages du navigateur, ou choisis un point ci-dessous."
          : "Position introuvable pour l'instant. Réessaie, ou choisis un point ci-dessous.",
      );
    },
    { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 },
  );
}
function showHint(text) {
  els.locateHint.textContent = text;
  els.locateHint.hidden = !text;
}

// ---------- Événements ----------
els.fuels.addEventListener("click", (e) => {
  const b = e.target.closest("[data-fuel]");
  if (!b || b.dataset.fuel === state.fuel) return;
  state.fuel = b.dataset.fuel;
  update();
});
els.context.addEventListener("click", openSheet);
els.list.addEventListener("click", (e) => {
  if (!e.target.closest("[data-widen]")) return;
  state.radius = Math.min(state.radius + 10, 40);
  update();
});
els.sheet.addEventListener("click", (e) => {
  if (e.target.closest("[data-close]")) return closeSheet();
  const place = e.target.closest("[data-place]");
  if (place) {
    state.placeId = place.dataset.place;
    renderSheet();
    return update();
  }
  const prof = e.target.closest("[data-profile]");
  if (prof) {
    state.profileId = prof.dataset.profile;
    renderSheet();
    return update();
  }
});
els.locate.addEventListener("click", locate);
els.radius.addEventListener("input", () => {
  state.radius = Number(els.radius.value);
  els.radiusOut.textContent = `${state.radius} km`;
  update();
});
for (const input of [els.litres, els.conso]) {
  input.addEventListener("change", () => {
    const litres = Number(els.litres.value);
    const conso = Number(els.conso.value);
    if (litres > 0) state.custom.litres = litres;
    if (conso > 0) state.custom.conso = conso;
    update();
  });
}
els.form.addEventListener("submit", (e) => {
  e.preventDefault();
  closeSheet();
});
els.sheet.addEventListener("cancel", (e) => {
  e.preventDefault();
  closeSheet();
});

// ---------- Démarrage ----------
async function refreshGpsIfAllowed() {
  if (state.placeId !== "gps" || !navigator.permissions) return;
  try {
    const status = await navigator.permissions.query({ name: "geolocation" });
    if (status.state === "granted") {
      navigator.geolocation.getCurrentPosition((pos) => {
        state.gps = { lat: pos.coords.latitude, lon: pos.coords.longitude };
        update();
      });
    }
  } catch {
    /* API non disponible : on garde la dernière position connue */
  }
}

async function start() {
  try {
    const res = await fetch("data/latest.json", { cache: "no-cache" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    data = await res.json();
  } catch {
    els.best.className = "best";
    els.best.innerHTML = `<p class="best-name">Prix indisponibles</p><p class="best-addr">Impossible de charger les données. Vérifie ta connexion puis recharge la page.</p>`;
    els.fresh.textContent = "Hors ligne";
    return;
  }
  if (state.placeId === "gps" && !state.gps) state.placeId = DEFAULTS.placeId;
  renderFresh();
  renderAll();
  refreshGpsIfAllowed();
}

start();

if ("serviceWorker" in navigator && location.protocol === "https:") {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
