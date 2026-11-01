// Amis : Supabase en accès direct (REST), sans bibliothèque. Connexion anonyme : pas d'e-mail, un pseudo.
// La clé « publishable » est publique par conception ; ce sont les règles RLS de la base qui protègent les données.
const URL_ = "https://ognckggltaclmthuazff.supabase.co";
const KEY = "sb_publishable_SJk081lpKOdY1cOqX5Ylew_3UtvgOF4";
const SK = "plein-sud:v3.friends";

let sess = null;
try { sess = JSON.parse(localStorage.getItem(SK) || "null"); } catch { /* stockage indisponible */ }
const store = () => { try { sess ? localStorage.setItem(SK, JSON.stringify(sess)) : localStorage.removeItem(SK); } catch { /* ignoré */ } };
const keep = (j) => { sess = { access_token: j.access_token, refresh_token: j.refresh_token, expires_at: Date.now() + (j.expires_in - 60) * 1000, id: j.user?.id || sess?.id }; store(); };

export class FriendsError extends Error {
  constructor(message, code) { super(message); this.code = code; }
}
const FR = {
  anonymous_provider_disabled: "Les amis ne sont pas encore activés côté serveur.",
  "23505": "Ce pseudo est déjà pris.",
  "23514": "Pseudo : 3 à 20 lettres, chiffres, _ ou -.",
};

async function raw(path, { method = "GET", body, token, prefer } = {}) {
  const res = await fetch(`${URL_}${path}`, {
    method,
    headers: { apikey: KEY, "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(prefer ? { Prefer: prefer } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let j = null;
  try { j = text ? JSON.parse(text) : null; } catch { /* corps vide */ }
  if (!res.ok) {
    const code = j?.error_code || j?.code || String(res.status);
    throw new FriendsError(FR[code] || j?.message || j?.msg || `Erreur ${res.status}`, code);
  }
  return j;
}
async function refresh() {
  try {
    keep(await raw("/auth/v1/token?grant_type=refresh_token", { method: "POST", body: { refresh_token: sess.refresh_token } }));
  } catch (e) {
    if (["400", "401", "403", "refresh_token_not_found", "refresh_token_already_used", "session_not_found"].includes(e.code)) { sess = null; store(); }
    throw e;
  }
}
async function api(path, opts = {}) {
  if (!sess) throw new FriendsError("Pas de profil.", "no_session");
  if (Date.now() > sess.expires_at) await refresh();
  try {
    return await raw(path, { ...opts, token: sess.access_token });
  } catch (e) {
    if (e.code === "401" || e.code === "bad_jwt") { await refresh(); return raw(path, { ...opts, token: sess.access_token }); }
    throw e;
  }
}

export const hasProfile = () => !!sess;

/** Crée le compte anonyme de cet appareil puis son profil (pseudo). */
export async function signUp(pseudo) {
  if (!sess) keep(await raw("/auth/v1/signup", { method: "POST", body: { data: {} } }));
  try {
    const rows = await api("/rest/v1/profiles", { method: "POST", body: { pseudo }, prefer: "return=representation" });
    return rows[0];
  } catch (e) {
    throw e;
  }
}
export async function profile() {
  const rows = await api(`/rest/v1/profiles?select=pseudo,code&id=eq.${sess.id}`);
  return rows[0] || null;
}
export const rpc = (name, args = {}) => api(`/rest/v1/rpc/${name}`, { method: "POST", body: args });
export const addFriend = (code) => rpc("add_friend", { p_code: code });
export const respond = (id, accept) => rpc("respond_friend", { p_user: id, p_accept: accept });
export const removeFriend = (id) => rpc("remove_friend", { p_user: id });
export const friends = () => rpc("friends_list");
export const reports = (limit = 60) => rpc("friends_reports", { p_limit: limit });
export const report = (r) => api("/rest/v1/price_reports", { method: "POST", body: r });
export function forget() { sess = null; store(); }
export const savings = (month) => rpc("friends_savings", { p_month: month });
/** Publie mon total du mois (seulement l'euro économisé et le nombre de pleins). */
export const pushSavings = (month, euros, fills) =>
  api("/rest/v1/savings?on_conflict=user_id,month", { method: "POST", body: { month, euros: Math.round(euros * 100) / 100, fills }, prefer: "resolution=merge-duplicates" });
