// Thème : clair le jour, « fleurs de nuit » après le coucher du soleil à Montpellier.
// Script classique chargé dans <head> : le thème est posé avant le premier affichage (pas de flash).
(() => {
  const LAT = 43.6108, LON = 3.8767; // Montpellier
  const KEY = "plein-sud:v3";
  const rad = Math.PI / 180;

  // Lever et coucher du soleil (algorithme de la NOAA, précis à une ou deux minutes près).
  function sunTimes(date = new Date(), lat = LAT, lon = LON) {
    const day = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
    const n = Math.round(day / 86400000 + 2440587.5 - 2451545.0 + 0.0008);
    const Js = n - lon / 360;
    const M = (357.5291 + 0.98560028 * Js) % 360;
    const C = 1.9148 * Math.sin(M * rad) + 0.02 * Math.sin(2 * M * rad) + 0.0003 * Math.sin(3 * M * rad);
    const L = (M + C + 180 + 102.9372) % 360;
    const Jt = 2451545.0 + Js + 0.0053 * Math.sin(M * rad) - 0.0069 * Math.sin(2 * L * rad);
    const dec = Math.asin(Math.sin(L * rad) * Math.sin(23.44 * rad));
    const cosH = (Math.sin(-0.833 * rad) - Math.sin(lat * rad) * Math.sin(dec)) / (Math.cos(lat * rad) * Math.cos(dec));
    const H = Math.acos(Math.max(-1, Math.min(1, cosH))) / rad;
    const toDate = (j) => new Date((j - 2440587.5) * 86400000);
    return { sunrise: toDate(Jt - H / 360), sunset: toDate(Jt + H / 360) };
  }

  function mode() {
    try { return (JSON.parse(localStorage.getItem(KEY) || "null") || {}).theme || "auto"; } catch { return "auto"; }
  }

  function resolve(m = mode(), now = new Date()) {
    if (m === "light" || m === "dark") return m;
    if (m === "system") return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    const { sunrise, sunset } = sunTimes(now);
    return now >= sunrise && now < sunset ? "light" : "dark";
  }

  function set(t) {
    document.documentElement.dataset.theme = t;
    let meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) { meta = document.createElement("meta"); meta.name = "theme-color"; document.head.append(meta); }
    meta.content = t === "dark" ? "#0E1430" : "#F3EDE0";
    document.dispatchEvent(new CustomEvent("themechange", { detail: t }));
  }
  function apply(m) {
    const t = resolve(m);
    const root = document.documentElement;
    const before = root.dataset.theme;
    if (before === t) return t;
    // Première pose : sans animation. Ensuite, la nuit tombe (ou le jour se lève) depuis le coin du ciel.
    if (before && document.startViewTransition && document.visibilityState === "visible") {
      root.classList.add("theme-flip");
      const vt = document.startViewTransition(() => set(t));
      vt.finished.finally(() => root.classList.remove("theme-flip"));
    } else {
      set(t);
    }
    return t;
  }

  window.pleinSudTheme = { sunTimes, resolve, apply, mode };
  apply();
  // Le soleil se couche pendant que l'appli est ouverte : on bascule toute seule.
  setInterval(() => apply(), 60000);
  matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", () => apply());
})();
