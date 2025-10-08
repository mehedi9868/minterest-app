// ✅ Auto Versioned Service Worker for Minterest PWA
const CACHE_NAME = "minterest-cache-" + new Date().getTime();

const FILES_TO_CACHE = [
  "index.html",
  "login.html",
  "signup.html",
  "settings.html",            // ← added
  "styles/main.css",
  "scripts/config.js",
  "scripts/pwa.js",
  "scripts/app.js",
  "scripts/auth.js",
  "scripts/menu.js",
  "scripts/settings.js",      // ← added
  "assets/images/success.jpg",
  "manifest.json"
];

self.addEventListener("install", (event) => {
  console.log("✅ Service Worker Installed:", CACHE_NAME);
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(FILES_TO_CACHE)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  console.log("⚡ Activating new service worker...");
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((key) => key !== CACHE_NAME && caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  event.respondWith(
    caches.match(event.request).then((res) => res || fetch(event.request))
  );
});
