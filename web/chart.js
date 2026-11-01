// Courbe brodée : médiane de la zone (fil plein), prévision réaliste (fil en pointillé)
// et bande pessimiste / optimiste (points lancés). SVG pur, sans bibliothèque.

const fmt3 = (n) => n.toFixed(3).replace(".", ",");
const dayLabel = (iso) => new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" }).format(new Date(`${iso}T12:00:00Z`));

/**
 * @param {{days:string[], median:number[], forecast?:{days:string[], real:number[], low:number[], high:number[]}}} h
 * @param {{width?:number, height?:number, label?:string, compact?:boolean}} opts
 */
export function trendSVG(h, { width = 340, height = 170, label = "", compact = false } = {}) {
  const fc = h.forecast;
  const days = [...h.days, ...(fc ? fc.days : [])];
  const all = [...h.median, ...(fc ? [...fc.low, ...fc.high] : [])];
  let lo = Math.min(...all), hi = Math.max(...all);
  const padV = Math.max(0.01, (hi - lo) * 0.15);
  lo -= padV; hi += padV;
  const L = 8, R = compact ? 50 : 64, T = 14, B = 26;
  const X = (i) => L + (i / Math.max(1, days.length - 1)) * (width - L - R);
  const Y = (v) => T + (1 - (v - lo) / (hi - lo)) * (height - T - B);
  const P = (vals, offset = 0) => vals.map((v, i) => `${(X(i + offset)).toFixed(1)} ${Y(v).toFixed(1)}`);
  const n = h.median.length;
  const last = h.median[n - 1];
  const parts = [];
  // repère : trois lignes discrètes
  for (const v of [lo + padV, (lo + hi) / 2, hi - padV]) {
    parts.push(`<line class="tr-grid" x1="${L}" x2="${width - R + 6}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}"/>`);
    parts.push(`<text class="tr-axis" x="${width - R + 10}" y="${(Y(v) + 4).toFixed(1)}">${fmt3(v)}</text>`);
  }
  if (fc) {
    const band = [...P(fc.high, n), ...P(fc.low, n).reverse()];
    const join = `${X(n - 1).toFixed(1)} ${Y(last).toFixed(1)}`;
    parts.push(`<path class="tr-band" d="M${join} L${band.join(" L")} Z"/>`);
    parts.push(`<path class="tr-high" d="M${join} L${P(fc.high, n).join(" L")}"/>`);
    parts.push(`<path class="tr-low" d="M${join} L${P(fc.low, n).join(" L")}"/>`);
    parts.push(`<path class="tr-real" d="M${join} L${P(fc.real, n).join(" L")}"/>`);
    parts.push(`<line class="tr-today" x1="${X(n - 1).toFixed(1)}" x2="${X(n - 1).toFixed(1)}" y1="${T - 6}" y2="${height - B + 4}"/>`);
  }
  parts.push(`<path class="tr-line sew" pathLength="1" d="M${P(h.median).join(" L")}"/>`);
  parts.push(`<circle class="tr-dot pop" style="--pd:700ms" cx="${X(n - 1).toFixed(1)}" cy="${Y(last).toFixed(1)}" r="3.6"/>`);
  parts.push(`<text class="tr-axis" x="${L}" y="${height - 6}">${dayLabel(days[0])}</text>`);
  if (fc) parts.push(`<text class="tr-axis" x="${X(n - 1).toFixed(1)}" y="${height - 6}" text-anchor="middle">auj.</text>`);
  parts.push(`<text class="tr-axis" x="${X(days.length - 1).toFixed(1)}" y="${height - 6}" text-anchor="end">${dayLabel(days[days.length - 1])}</text>`);
  const desc = `${label} : médiane ${fmt3(last)} € le litre aujourd'hui` + (fc ? `, prévision à 7 jours entre ${fmt3(fc.low.at(-1))} et ${fmt3(fc.high.at(-1))}, scénario réaliste ${fmt3(fc.real.at(-1))}.` : ".");
  return `<svg class="trend-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${desc}">${parts.join("")}</svg>`;
}

/** Phrase de tendance, en centimes par jour. */
export function trendWords(fc) {
  if (!fc) return "";
  const c = fc.slope_per_day * 100;
  if (Math.abs(c) < 0.1) return "Tendance : stable";
  return `Tendance : ${c < 0 ? "baisse" : "hausse"} d’environ ${Math.abs(c).toFixed(1).replace(".", ",")} centime${Math.abs(c) >= 2 ? "s" : ""} par jour`;
}
export { fmt3, dayLabel };
