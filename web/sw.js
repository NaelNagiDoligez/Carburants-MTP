// Service worker : l'interface fonctionne hors ligne, les prix viennent du réseau en priorité.
const CACHE = "plein-sud-v16";
const SHELL = ["./", "index.html", "styles.css", "app.js", "garden.js", "theme.js", "catalog.js", "rank.js", "trip.js", "chart.js", "coulisses.html", "manifest.webmanifest", "icons/icon.svg", "fonts/archivo-wdth.woff2", "fonts/young-serif.woff2"];

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

// Hors ligne : on renvoie la copie en cache, marquée pour que l'appli ne dise pas « à jour ».
async function markOffline(res) {
  const headers = new Headers(res.headers);
  headers.set("x-plein-sud-offline", "1");
  return new Response(await res.blob(), { status: res.status, statusText: res.statusText, headers });
}

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  // Données et page : réseau d'abord (prix frais), cache en secours hors ligne.
  // Reste de l'interface : cache d'abord, mis à jour en arrière-plan.
  const networkFirst = url.pathname.includes("/data/") || e.request.mode === "navigate";
  e.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(e.request);
      const fromNetwork = fetch(e.request)
        .then((res) => {
          if (res.ok) cache.put(e.request, res.clone());
          return res;
        })
        .catch(() => (cached ? markOffline(cached) : undefined));
      return networkFirst ? fromNetwork.then((r) => r || cached) : cached || fromNetwork;
    }),
  );
});
