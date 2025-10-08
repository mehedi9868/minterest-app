// scripts/pwa.js — SW register
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("service-worker.js")
    .then(() => console.log("✅ Service Worker Registered"))
    .catch(err => console.log("❌ SW error:", err));
}
