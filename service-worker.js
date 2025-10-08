/* Cleaned & PWA-ready build for Minterest — Drive Pins - 2025-10-08 05:53:35 UTC */
/* Service Worker - generated 2025-10-08 05:53:35 */
const CACHE_NAME = "pwa-cache-v1759902815";
const PRECACHE_URLS = [
  "./dashboard.html",
  "./index.html",
  "./login.html",
  "./manifest.json",
  "./service-worker.js",
  "./settings.html",
  "./signup.html",
  "./assets/icons/icon-192.png",
  "./assets/icons/icon-512.png",
  "./assets/images/success.jpg",
  "./scripts/app.js",
  "./scripts/auth.js",
  "./scripts/config.js",
  "./scripts/dashboard.js",
  "./scripts/menu.js",
  "./scripts/pwa.js",
  "./scripts/refresh.js",
  "./scripts/settings.js",
  "./styles/main.css"
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.map(k => k !== CACHE_NAME ? caches.delete(k) : null))).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((resp) => {
        const respClone = resp.clone();
        caches.open(CACHE_NAME).then((c) => c.put(req, respClone)).catch(() => {});
        return resp;
      }).catch(() => caches.match('./offline.html'));
    })
  );
});
