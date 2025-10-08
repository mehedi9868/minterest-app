/* Cleaned & PWA-ready build for Minterest — Drive Pins - 2025-10-08 05:53:35 UTC */
document.getElementById("refreshBtn").addEventListener("click", async () => {
  // সব ক্যাশ ডিলিট করো
  const keys = await caches.keys();
  await Promise.all(keys.map((key) => caches.delete(key)));
  
  console.log("🧹 Old cache cleared. Reloading page...");
  
  // পেজ রিফ্রেশ করো
  window.location.reload(true);
});