/**
 * scripts/menu.js
 * -------------------
 * ডাইনামিক মেনু বিল্ড করে (Firestore + Reset + Refresh + Login/Logout)
 */

if (window.__menuScriptLoaded) {
  console.warn("menu.js already loaded; skipping duplicate init.");
} else {
  window.__menuScriptLoaded = true;

  // ---------- DOM ----------
  const burger = document.getElementById('hamburgerBtn');
  const menu   = document.getElementById('headerMenu');
  const list   = menu?.querySelector('ul');

  // ---------- Menu toggle ----------
  function toggleMenu() {
    if (!menu) return;
    const isHidden = menu.hasAttribute('hidden');
    isHidden ? menu.removeAttribute('hidden') : menu.setAttribute('hidden', '');
    burger?.setAttribute('aria-expanded', isHidden ? 'true' : 'false');
  }
  burger?.addEventListener('click', toggleMenu);

  document.addEventListener('click', (e) => {
    if (menu && !menu.contains(e.target) && !burger?.contains(e.target)) {
      menu.setAttribute('hidden', '');
      burger?.setAttribute('aria-expanded', 'false');
    }
  });

  // ---------- Concurrency guards ----------
  let isBuilding = false;
  let buildVersion = 0;

  function buildMenu() {
    if (!list) return;

    if (isBuilding) return;

    isBuilding = true;
    const myVersion = ++buildVersion;

    list.innerHTML = "";

    const db = window.appDB;

    const afterConfigured = () => {
      if (myVersion !== buildVersion) { isBuilding = false; return; }

      // (১) Reset বাটন
      const resetLi = document.createElement('li');
      resetLi.innerHTML = `<button type="button">Reset</button>`;
      resetLi.querySelector('button').addEventListener('click', ()=> window.resetBoard?.());
      list.appendChild(resetLi);

      // (২) Refresh বাটন ✅
      const refreshLi = document.createElement('li');
      refreshLi.innerHTML = `<button type="button">Refresh</button>`;
      refreshLi.querySelector('button').addEventListener('click', ()=> window.refreshPage?.());
      list.appendChild(refreshLi);

      // (৩) Login / Logout
      const isLoggedIn =
        typeof window.appIsLoggedIn === 'boolean'
          ? window.appIsLoggedIn
          : !!(window.appAuth && window.appAuth.currentUser);

      if (isLoggedIn) {
        const outLi = document.createElement('li');
        outLi.innerHTML = `<button type="button">Log out</button>`;
        outLi.querySelector('button').addEventListener('click', ()=> window.appSignOut?.());
        list.appendChild(outLi);
      } else {
        const inLi = document.createElement('li');
        inLi.innerHTML = `<a href="login.html">Log in</a>`;
        list.appendChild(inLi);
      }

      isBuilding = false;
    };

    // Firestore config থাকলে লোড করো
    if (!db) { afterConfigured(); return; }

    db.collection('settings').doc('general').get()
      .then(doc => {
        if (myVersion !== buildVersion) { isBuilding = false; return; }

        if (doc.exists) {
          const menus = doc.data().menus || [];
          menus.forEach(m => {
            if (m.visible) {
              const li = document.createElement('li');
              li.innerHTML = `<a href="${m.link}">${m.icon || ""} ${m.title}</a>`;
              list.appendChild(li);
            }
          });
        }
        afterConfigured();
      })
      .catch(() => {
        afterConfigured();
      });
  }

  // প্রথমবার মেনু বিল্ড করো
  buildMenu();

  // auth state পরিবর্তন হলে মেনু রিফ্রেশ
  document.addEventListener('auth:state', buildMenu);
}

// === Hard Refresh (cache + SW) ===
window.appHardRefresh = async function(){
  try{
    // Clear Cache Storage
    if (window.caches && caches.keys) {
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
    }
    // Unregister all service workers
    if (navigator.serviceWorker?.getRegistrations) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map(r => r.unregister()));
    }
  }catch(e){ console.warn("Hard refresh cleanup error:", e); }
  // Force reload
  location.reload(true);
};

// Delegate clicks in header menu for a 'Refresh' item
(function(){
  const menu = document.getElementById('headerMenu');
  if(!menu) return;
  menu.addEventListener('click', (e)=>{
    const el = e.target.closest('li,button,a');
    if(!el) return;
    const label = (el.getAttribute('data-action') || el.textContent || '').trim().toLowerCase();
    if(label === 'refresh'){
      e.preventDefault();
      window.appHardRefresh();
    }
  });
})();

// == Auto set --header-h to real header height ==
(function(){
  const root = document.documentElement;
  const header = document.querySelector('.app-header');
  if(!header) return;

  function setHeaderVar(){
    const h = Math.round(header.getBoundingClientRect().height);
    if (h) root.style.setProperty('--header-h', h + 'px');
  }
  setHeaderVar();
  window.addEventListener('resize', setHeaderVar, {passive:true});

  // যদি মেনু ওপেন/ক্লোজে হেডার হাইট পাল্টায়
  const obs = new MutationObserver(setHeaderVar);
  obs.observe(header, { childList:true, subtree:true, attributes:true });
})();
