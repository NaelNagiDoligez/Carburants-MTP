// Amis : Supabase en accès direct (REST), sans bibliothèque. Connexion anonyme : pas d'e-mail, un pseudo.
// La clé « publishable » est publique par conception ; ce sont les règles RLS de la base qui protègent les données.
const URL_ = "https://ognckggltaclmthuazff.supabase.co";
const KEY = "sb_publishable_SJk081lpKOdY1cOqX5Ylew_3UtvgOF4";
const SK = "plein-sud:v3.friends";

let sess = null;
try { sess = JSON.parse(localStorage.getItem(SK) || "null"); } catch { /* stockage indisponible */ }
const store = () => { try { sess ? localStorage.setItem(SK, JSON.stringify(sess)) : localStorage.removeItem(SK); } catch { /* ignoré */ } };
const keep = (j, extra = {}) => { sess = { access_token: j.access_token, refresh_token: j.refresh_token, expires_at: Date.now() + (j.expires_in - 60) * 1000, id: j.user?.id || sess?.id, key: sess?.key, ...extra }; store(); };

export class FriendsError extends Error {
  constructor(message, code) { super(message); this.code = code; }
}
const FR = {
  anonymous_provider_disabled: "Les amis ne sont pas encore activés côté serveur.",
  "23505": "Ce pseudo est déjà pris.",
  user_already_exists: "Ce pseudo est déjà pris.",
  email_exists: "Ce pseudo est déjà pris.",
  invalid_credentials: "Pseudo ou clé de récupération incorrects.",
  weak_password: "Clé de récupération trop courte.",
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

const PSEUDO = /^[A-Za-z0-9_-]{3,20}$/;
const emailOf = (pseudo) => `${pseudo.toLowerCase()}@plein-sud.app`;
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const makeKey = () => Array.from(crypto.getRandomValues(new Uint8Array(20)), (n) => ALPHABET[n % ALPHABET.length]).join("");
const cleanKey = (k) => String(k).toUpperCase().replace(/[^A-Z0-9]/g, "");
export const showKey = (k) => (k || "").replace(/(.{5})(?=.)/g, "$1-");
export const recoveryKey = () => sess?.key || "";

/** Crée le profil : un compte à pseudo + clé de récupération générée (pas d'e-mail réel). */
export async function signUp(pseudo) {
  if (!PSEUDO.test(pseudo)) throw new FriendsError(FR["23514"], "23514");
  const key = makeKey();
  const j = await raw("/auth/v1/signup", { method: "POST", body: { email: emailOf(pseudo), password: key } });
  if (!j?.access_token) throw new FriendsError("Côté serveur, la confirmation par e-mail doit être désactivée (Authentication, Sign In / Providers, Email).", "confirm_email");
  sess = null;
  keep(j, { key });
  try { return await createProfile(pseudo); } catch (e) { forget(); throw e; }
}
export async function createProfile(pseudo) {
  if (!PSEUDO.test(pseudo)) throw new FriendsError(FR["23514"], "23514");
  await ensureId();
  const rows = await api("/rest/v1/profiles", { method: "POST", body: { pseudo }, prefer: "return=representation" });
  return rows[0];
}
async function ensureId() {
  if (!sess.id) { sess.id = (await api("/auth/v1/user")).id; store(); }
}
/** Connexion avec Google : Supabase gère la page Google puis nous renvoie ici avec la session dans l'adresse. */
export const googleUrl = (redirect) => `${URL_}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(redirect)}`;
/** Au retour de Google : récupère la session dans l'adresse (puis la nettoie). Renvoie true si on vient de se connecter. */
export function consumeRedirect() {
  const h = new URLSearchParams(location.hash.replace(/^#/, ""));
  if (!h.get("access_token") || !h.get("refresh_token")) return false;
  sess = null;
  keep({ access_token: h.get("access_token"), refresh_token: h.get("refresh_token"), expires_in: Number(h.get("expires_in") || 3600), user: {} }, { key: "" });
  history.replaceState(null, "", location.pathname + location.search);
  return true;
}
/** Retrouve un profil existant sur un nouvel appareil. */
export async function signIn(pseudo, key) {
  const k = cleanKey(key);
  sess = null;
  keep(await raw("/auth/v1/token?grant_type=password", { method: "POST", body: { email: emailOf(pseudo.trim()), password: k } }), { key: k });
}
export async function profile() {
  await ensureId();
  const rows = await api(`/rest/v1/profiles?select=pseudo,code&id=eq.${sess.id}`);
  return rows[0] || null;
}
export const rpc = (name, args = {}) => api(`/rest/v1/rpc/${name}`, { method: "POST", body: args });
export const addFriend = (code) => rpc("add_friend", { p_code: code });
export const respond = (id, accept) => rpc("respond_friend", { p_user: id, p_accept: accept });
export const removeFriend = (id) => rpc("remove_friend", { p_user: id });
export const friends = () => rpc("friends_list");
export const stock = () => rpc("friends_stock");
export const stockReport = (r) => api("/rest/v1/stock_reports", { method: "POST", body: r });
export function forget() { sess = null; store(); }
export const savings = (month) => rpc("friends_savings", { p_month: month });
/** Publie mon total du mois (seulement l'euro économisé et le nombre de pleins). */
export const pushSavings = (month, euros, fills) =>
  api("/rest/v1/savings?on_conflict=user_id,month", { method: "POST", body: { month, euros: Math.round(euros * 100) / 100, fills }, prefer: "resolution=merge-duplicates" });
export const pushBackup = (data) => api("/rest/v1/backups?on_conflict=user_id", { method: "POST", body: { data, updated_at: new Date().toISOString() }, prefer: "resolution=merge-duplicates" });
export async function pullBackup() {
  const rows = await api("/rest/v1/backups?select=data,updated_at");
  return rows[0] || null;
}
