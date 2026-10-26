// Service worker : l'interface fonctionne hors ligne, les prix viennent du réseau en priorité.
const CACHE = "plein-sud-v7";
const SHELL = ["./", "index.html", "styles.css", "app.js", "garden.js", "rank.js", "manifest.webmanifest", "icons/icon.svg", "fonts/archivo-wdth.woff2", "fonts/young-serif.woff2"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  // Données et page : réseau d'abord (prix frais), cache en secours hors ligne.
  // Reste de l'interface : cache d'abord, mis à jour en arrière-plan.
  const networkFirst = url.pathname.endsWith("/latest.json") || e.request.mode === "navigate";
  e.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(e.request);
      const fromNetwork = fetch(e.request)
        .then((res) => {
          if (res.ok) cache.put(e.request, res.clone());
          return res;
        })
        .catch(() => cached);
      return networkFirst ? fromNetwork.then((r) => r || cached) : cached || fromNetwork;
    }),
  );
});
