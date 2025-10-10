/* Service Worker – Auto Cache-Busting Edition */
const CACHE_VERSION = Date.now(); // 🔥 প্রতিবার নতুন ভার্সন
const CACHE_NAME = `pwa-cache-${CACHE_VERSION}`;

const PRECACHE_URLS = [
  "./",
  "./index.html",
  "./dashboard.html",
  "./login.html",
  "./signup.html",
  "./settings.html",
  "./manifest.json",
  "./assets/icons/icon-192.png",
  "./assets/icons/icon-512.png",
  "./styles/main.css",
  "./scripts/app.js",
  "./scripts/auth.js",
  "./scripts/config.js",
  "./scripts/dashboard.js",
  "./scripts/menu.js",
  "./scripts/pwa.js",
  "./scripts/refresh.js",
  "./scripts/settings.js",
];

/* Install: fresh cache */
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

/* Activate: delete old caches automatically */
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.map((k) => (k !== CACHE_NAME ? caches.delete(k) : null)))
      )
      .then(() => self.clients.claim())
  );
});

/* Fetch: network-first fallback to cache */
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  event.respondWith(
    fetch(req)
      .then((resp) => {
        const respClone = resp.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, respClone));
        return resp;
      })
      .catch(() => caches.match(req))
  );
});