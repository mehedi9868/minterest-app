/* Cleaned & PWA-ready build for Minterest — Drive Pins - 2025-10-08 05:53:35 UTC */
// scripts/pwa.js — SW register
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("service-worker.js")
    .then(() => console.log("✅ Service Worker Registered"))
    .catch(err => console.log("❌ SW error:", err));
}
