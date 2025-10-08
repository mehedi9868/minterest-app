/* Cleaned & PWA-ready build for Minterest — Drive Pins - 2025-10-08 05:53:35 UTC */
// scripts/settings.js
// ---
// লক্ষ্য: কেবল অ্যাডমিনের জন্য সেটিংস পেজ উন্মুক্ত করা।
// - ডিফল্টে ফর্ম/অ্যাকশন হাইড
// - অ্যাডমিন ভেরিফাই হলে শো; অন্যথায় গার্ড মেসেজ + (ঐচ্ছিক) লগইনে রিডাইরেক্ট
//
// Compat SDK v11 (firebase.* গ্লোবাল), তবে এই ফাইলটি ES module হিসেবে লোড হবে.
//
// নোট: config.js must export { firebaseConfig }
import { firebaseConfig } from './config.js';

// Initialize (idempotent)
if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

const auth = firebase.auth();
const db   = firebase.firestore();

// ---------- DOM refs ----------
const form       = document.getElementById('settings-form');
const msg        = document.getElementById('msg');
const diag       = document.getElementById('diag');
const btnSave    = document.getElementById('btnSave');
const btnPing    = document.getElementById('btnPing');
const guard      = document.getElementById('guard-msg');
const actionsBar = document.querySelector('.settings-actions');

// ---------- Helpers ----------
const fields = ['images','videos','favorites','apiKey','pwd1','pwd2'];

function setFormEnabled(enabled) {
  fields.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.disabled = !enabled;
  });
  if (btnSave) btnSave.disabled = !enabled;
  if (btnPing) btnPing.disabled = !enabled;
}

function showForm(show) {
  if (form) form.style.display = show ? '' : 'none';
  if (actionsBar) actionsBar.style.display = show ? '' : 'none';
}

function showGuard(show, text) {
  if (!guard) return;
  guard.style.display = show ? '' : 'none';
  const p = guard.querySelector('p');
  if (text && p) p.textContent = text;
}

function toast(text, ok=true) {
  if (!msg) return;
  msg.textContent = text;
  msg.style.display = 'block';
  msg.style.color = ok ? 'var(--ok, #0a0)' : 'var(--warn, #a00)';
  setTimeout(()=>{ if (msg) msg.style.display='none'; }, 3500);
}

async function isAdmin(uid) {
  if (!uid) return false;
  // 🔎 চেক: admins/{uid} ডক আছে কি না
  const doc = await db.collection('admins').doc(uid).get();
  return doc.exists;
}

async function loadSettingsIntoForm() {
  // 1) runtime doc: settings/app
  let data = {};
  try {
    const snap = await db.collection('settings').doc('app').get();
    if (snap.exists) {
      const d = snap.data() || {};
      data.apiKey    = d.DRIVE_API_KEY || '';
      data.pwd1      = d.REQUIRED_PASSWORD || '';
      data.pwd2      = d.ANOTHER_PASSWORD || '';
      const feeds    = d.DEFAULT_FEEDS || {};
      data.images    = feeds.images || '';
      data.videos    = feeds.videos || '';
      data.favorites = feeds.favorites || '';
    }
  } catch(e) {
    console.warn('settings/app read failed, fallback to app/settings', e);
  }

  // 2) fallback: app/settings
  if (!data.apiKey) {
    const snap2 = await db.collection('app').doc('settings').get();
    if (snap2.exists) data = { ...(snap2.data()||{}) };
  }

  fields.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = (data[id] || '').toString();
  });
}

async function saveSettingsFromForm() {
  const payload = {};
  fields.forEach(id => {
    payload[id] = (document.getElementById(id)?.value || '').trim();
  });

  // (A) legacy/form doc
  await db.collection('app').doc('settings').set(payload, { merge: true });

  // (B) runtime doc
  const runtime = {
    DRIVE_API_KEY:     payload.apiKey,
    REQUIRED_PASSWORD: payload.pwd1,
    ANOTHER_PASSWORD:  payload.pwd2,
    DEFAULT_FEEDS: {
      images: payload.images,
      videos: payload.videos,
      favorites: payload.favorites
    }
  };
  await db.collection('settings').doc('app').set(runtime, { merge: true });
}

// ---------- Events ----------
btnSave?.addEventListener('click', async () => {
  try {
    setFormEnabled(false);
    await saveSettingsFromForm();
    toast('✅ Settings saved');
  } catch (e) {
    console.error(e);
    toast('❌ Failed to save: ' + (e?.message || e), false);
  } finally {
    setFormEnabled(true);
  }
});

btnPing?.addEventListener('click', async () => {
  const start = Date.now();
  if (diag){
    diag.style.display = 'block';
    diag.textContent = 'Pinging Firestore...';
  }
  try {
    await db.collection('app').doc('settings').get();
    const ms = Date.now() - start;
    if (diag) diag.textContent = `✅ Firestore OK ~${ms}ms`;
  } catch (e) {
    if (diag) diag.textContent = '❌ ' + (e?.message || e);
  }
});

// ---------- Auth gate ----------
// ডিফল্ট স্টেট: guard visible, form hidden (HTML/CSS এ সেট করা আছে)
auth.onAuthStateChanged(async (user) => {
  try {
    if (!user) {
      // not logged in => guard on + (ঐচ্ছিক) রিডাইরেক্ট
      showForm(false);
      setFormEnabled(false);
      showGuard(true, 'এই পেজটি আপডেট করতে অ্যাডমিন একাউন্টে লগইন করুন।');
      // দ্রুত লগইনে পাঠাতে চাইলে নিচের লাইন আনকমেন্ট করুন:
      // location.replace('login.html?next=settings.html');
      return;
    }

    const ok = await isAdmin(user.uid);
    if (!ok) {
      // logged in but not admin
      showForm(false);
      setFormEnabled(false);
      showGuard(true, 'আপনার একাউন্টে অ্যাডমিন অনুমতি নেই। অ্যাডমিন একাউন্টে লগইন করুন।');
      return;
    }

    // ✅ admin: allow + load current values
    showGuard(false);
    showForm(true);
    setFormEnabled(true);
    await loadSettingsIntoForm();

  } catch (e) {
    console.error(e);
    toast('❌ Error: ' + (e?.message || e), false);
    showForm(false);
    showGuard(true, 'লোড করতে সমস্যা হয়েছে—পরে চেষ্টা করুন।');
  }
});

/* ---------- (Optional) Fixed Menu logic ----------
   এই পেজে menuToggle/menuPanel নেই, তাই বিভ্রান্তি এড়াতে
   ডিফল্ট কোড ব্লকটি মন্তব্য করে রাখা হলো। প্রয়োজন হলে আনকমেন্ট করুন।

const menuToggle = document.getElementById('menuToggle');
const menuPanel  = document.getElementById('menuPanel');

function closeMenu(){
  if(menuPanel){
    menuPanel.hidden = true;
    menuToggle?.setAttribute('aria-expanded','false');
  }
}
function openMenu(){
  if(menuPanel){
    menuPanel.hidden = false;
    menuToggle?.setAttribute('aria-expanded','true');
  }
}

if (menuToggle && menuPanel){
  menuToggle.addEventListener('click', ()=>{
    const expanded = menuToggle.getAttribute('aria-expanded') === 'true';
    if (expanded) closeMenu(); else openMenu();
  });

  // click on menu items
  menuPanel.addEventListener('click', (e)=>{
    const item = e.target.closest('.menu-item');
    if(!item) return;

    // visual active effect
    item.classList.add('active');
    setTimeout(()=> item.classList.remove('active'), 450);

    const action = item.dataset.action;

    switch(action){
      case 'refresh':
        toast('✅ পেজ রিফ্রেশ হচ্ছে...', true);
        setTimeout(()=> location.reload(), 350);
        break;

      case 'save':
        if (btnSave){ btnSave.click(); toast('✅ সেভ করা হলো', true); }
        else { toast('✅ সেভ ট্রিগার হয়েছে', true); }
        break;

      case 'logout':
        try { window.resetBoard?.(); } catch(e){ console.warn("resetBoard error:", e); }
        try {
          ["drivepins_grid","drivepins_seen","drivepins_view"].forEach(k=>localStorage.removeItem(k));
        } catch(e){ /* ignore * / }

        if (auth && auth.signOut){
          auth.signOut()
            .then(()=> toast('✅ লগআউট + রিসেট সম্পন্ন', true))
            .catch(err=> toast('❌ '+ err.message, false))
            .finally(()=> { try { location.href = "index.html"; } catch(e){} });
        } else {
          toast('ℹ️ লগআউট অপশন অনুপলব্ধ — শুধু রিসেট করা হয়েছে', false);
          try { location.href = "index.html"; } catch(e){} 
        }
        break;

      case 'back':
        toast('✅ ব্যাক করা হচ্ছে', true);
        break;

      default:
        toast('✅ কমান্ড সম্পন্ন', true);
    }

    closeMenu();
  });

  document.addEventListener('click', (e)=>{
    if (!menuPanel.hidden){
      if (!e.target.closest('.fixed-menu')) closeMenu();
    }
  });
}
*/
