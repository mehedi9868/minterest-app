// scripts/dashboard.js — CLEAN REBUILD (single debug(), single tryQuery())
import { firebaseConfig } from './config.js';
if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);

const auth = firebase.auth();
const db   = firebase.firestore();

// UI refs
const listEl    = document.getElementById('activityList');
const statusEl  = document.getElementById('status');
const btnMore   = document.getElementById('btnMore');
const qEl       = document.getElementById('q');
const fromEl    = document.getElementById('from');
const toEl      = document.getElementById('to');
const btnFilter = document.getElementById('btnFilter');
const btnReset  = document.getElementById('btnReset');
const btnExport = document.getElementById('btnExport');
const btnSeed   = document.getElementById('btnSeed');

let lastDoc = null;
let buffer  = []; // collected rows for CSV
let currentFilters = {};

// ---------- Utils ----------
function fmt(ts){
  if (!ts) return '—';
  try {
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleString();
  } catch { return '—'; }
}
function esc(s){ return (s ?? '').toString(); }
function show(msg, ok=true){
  if (!statusEl) return;
  statusEl.textContent = msg || '';
  statusEl.style.display = msg ? 'block' : 'none';
  statusEl.style.color = ok ? 'var(--muted)' : 'var(--warn, #ff9e9e)';
}
function debug(err){
  console.error('[dashboard]', err);
  show('Error: ' + (err && err.message ? err.message : err), false);
}

function rowTemplate(d){
  const name  = esc(d.displayName) || '—';
  const email = esc(d.email) || '—';
  //const uid   = esc(d.uid) || '—';
  const lastLogin  = fmt(d.loginAt || d.lastLoginAt);
  const lastActive = fmt(d.lastActiveAt || d.activityAt);
  const sessions   = d.sessions ?? d.sessionCount ?? '—';
  const device     = esc(d.device || d.platform || d.os || '—');
  const ip         = esc(d.ip || d.ipAddress || '—');

  return `<div class="row">
    <div class="cell user">
      <div class="u-name">${name}</div>
      <div class="u-meta">${email}</div>
    </div>
    <div class="cell">${lastLogin}</div>
    <div class="cell">${lastActive}</div>
    <div class="cell">${sessions}</div> 
    <div class="cell">${device}</div>
    <div class="cell">${ip}</div>
  </div>`;
}

// ---------- Data ----------
async function tryQuery(collectionName, { q, from, to, limit=50 }){
  let ref = db.collection(collectionName);
  // Order if possible
  try { ref = ref.orderBy('lastActiveAt','desc'); } catch(e){ /* ignore */ }
  // Date filters
  try {
    if (from) ref = ref.where('lastActiveAt','>=', from);
    if (to)   ref = ref.where('lastActiveAt','<=', to);
  } catch(e){
    // If index missing, fallback (no where)
    ref = db.collection(collectionName);
  }

  if (lastDoc) ref = ref.startAfter(lastDoc);
  ref = ref.limit(limit);

  try{
    const snap = await ref.get();
    if (snap.empty) return { rows: [], done: true };
    lastDoc = snap.docs[snap.docs.length - 1];
    const rows = snap.docs.map(doc => {
      const d = doc.data() || {};
      return {
        uid: d.uid || d.userId || doc.id,
        email: d.email,
        displayName: d.displayName,
        loginAt: d.loginAt || d.lastLoginAt,
        lastActiveAt: d.lastActiveAt || d.activityAt,
        sessions: d.sessions ?? d.sessionCount,
        device: d.device || d.platform || d.os,
        ip: d.ip || d.ipAddress,
        userAgent: d.userAgent
      };
    });
    // client-side query
    let out = rows;
    if (q){
      const qq = q.toLowerCase();
      out = rows.filter(r =>
        (r.uid && r.uid.toLowerCase().includes(qq)) ||
        (r.email && r.email.toLowerCase().includes(qq)) ||
        (r.displayName && r.displayName.toLowerCase().includes(qq))
      );
    }
    return { rows: out, done: false };
  }catch(e){
    debug(e);
    // last resort: simple fetch
    try{
      const snap = await db.collection(collectionName).limit(limit).get();
      if (snap.empty) return { rows: [], done: true };
      lastDoc = snap.docs[snap.docs.length - 1];
      const rows = snap.docs.map(doc => {
        const d = doc.data() || {};
        return {
          uid: d.uid || d.userId || doc.id,
          email: d.email,
          displayName: d.displayName,
          loginAt: d.loginAt || d.lastLoginAt,
          lastActiveAt: d.lastActiveAt || d.activityAt,
          sessions: d.sessions ?? d.sessionCount,
          device: d.device || d.platform || d.os,
          ip: d.ip || d.ipAddress,
          userAgent: d.userAgent
        };
      });
      return { rows, done: false };
    }catch(e2){
      debug(e2);
      return { rows: [], done: true };
    }
  }
}

function renderRows(rows, replace=false){
  if (!listEl) return;
  if (replace) listEl.innerHTML = '';
  const html = rows.map(rowTemplate).join('');
  listEl.insertAdjacentHTML('beforeend', html);
  buffer.push(...rows);
}

function readFilters(){
  const q = qEl?.value.trim() || '';
  const fromVal = fromEl?.value ? new Date(fromEl.value) : null;
  const toVal   = toEl?.value ? new Date(toEl.value) : null;
  const from = fromVal ? firebase.firestore.Timestamp.fromDate(fromVal) : null;
  const to   = toVal ? firebase.firestore.Timestamp.fromDate(toVal) : null;
  currentFilters = { q, from, to, limit: 50 };
  return currentFilters;
}

async function loadFirstPage(){
  if (listEl){ listEl.innerHTML = ''; }
  buffer = [];
  lastDoc = null;
  if (btnMore) btnMore.style.display = 'none';
  show('Loading activity…');
  const filters = readFilters();

  const candidates = ['activity','userActivity','sessions'];
  let collected = [];
  for (const coll of candidates){
    try {
      const { rows } = await tryQuery(coll, filters);
      collected = rows;
      if (rows.length){
        show('');
        renderRows(rows, true);
        break;
      }
    } catch(e){
      debug(e);
    }
  }
  if (!collected.length){
    show('No activity found. Use "Seed demo row" to create a test record.', false);
  } else if (btnMore){
    btnMore.style.display = 'inline-flex';
  }
}

async function loadMore(){
  const filters = readFilters();
  const candidates = ['activity','userActivity','sessions'];
  for (const coll of candidates){
    try {
      const { rows } = await tryQuery(coll, filters);
      if (rows.length){
        renderRows(rows, false);
        return;
      }
    } catch(e){
      debug(e);
    }
  }
  if (btnMore) btnMore.style.display = 'none';
}

function toCSV(rows){
  const headers = ['uid','email','displayName','loginAt','lastActiveAt','sessions','device','ip','userAgent'];
  const lines = [headers.join(',')];
  rows.forEach(r => {
    const vals = headers.map(h => {
      let v = r[h];
      if (v && typeof v.toDate === 'function') v = v.toDate().toISOString();
      if (v === undefined || v === null) v = '';
      const s = String(v).replace(/"/g,'""');
      return `"${s}"`;
    });
    lines.push(vals.join(','));
  });
  return lines.join('\\n');
}

// ---------- Events ----------
btnFilter?.addEventListener('click', loadFirstPage);
btnReset?.addEventListener('click', ()=>{ if(qEl) qEl.value=''; if(fromEl) fromEl.value=''; if(toEl) toEl.value=''; loadFirstPage(); });
btnMore?.addEventListener('click', loadMore);
btnExport?.addEventListener('click', ()=>{
  if (!buffer.length){ alert('No data to export.'); return; }
  const csv = toCSV(buffer);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'user-activity.csv';
  document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
});
btnSeed?.addEventListener('click', async ()=>{
  const user = auth.currentUser;
  if(!user){ alert('Please login first.'); return; }
  try{
    await db.collection('activity').doc(user.uid).set({
      uid: user.uid,
      email: user.email || '',
      displayName: user.displayName || '',
      loginAt: firebase.firestore.FieldValue.serverTimestamp(),
      lastActiveAt: firebase.firestore.FieldValue.serverTimestamp(),
      sessions: firebase.firestore.FieldValue.increment(1),
      device: (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || '',
      userAgent: navigator.userAgent
    }, { merge: true });
    show('✅ Seed row written. Reloading…', true);
    setTimeout(()=> location.reload(), 500);
  }catch(e){ debug(e); }
});

// Bind again after DOM ready (in case script was in <head>)
window.addEventListener('DOMContentLoaded', ()=>{
  document.getElementById('btnFilter')?.addEventListener('click', loadFirstPage);
  document.getElementById('btnReset')?.addEventListener('click', ()=>{ if(qEl) qEl.value=''; if(fromEl) fromEl.value=''; if(toEl) toEl.value=''; loadFirstPage(); });
  document.getElementById('btnMore')?.addEventListener('click', loadMore);
  document.getElementById('btnExport')?.addEventListener('click', ()=>{
    if (!buffer.length){ alert('No data to export.'); return; }
    const csv = toCSV(buffer);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'user-activity.csv';
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  });
  document.getElementById('btnSeed')?.addEventListener('click', async ()=>{
    const user = auth.currentUser;
    if(!user){ alert('Please login first.'); return; }
    try{
      await db.collection('activity').doc(user.uid).set({
        uid: user.uid, email: user.email || '', displayName: user.displayName || '',
        loginAt: firebase.firestore.FieldValue.serverTimestamp(),
        lastActiveAt: firebase.firestore.FieldValue.serverTimestamp(),
        sessions: firebase.firestore.FieldValue.increment(1),
        device: (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || '',
        userAgent: navigator.userAgent
      }, { merge: true });
      show('✅ Seed row written. Reloading…', true);
      setTimeout(()=> location.reload(), 500);
    }catch(e){ debug(e); }
  });
});

// ---------- Auth gate ----------
auth.onAuthStateChanged(async (user)=>{
  if (!user){
    show('Please login to view dashboard.', false);
    if (listEl) listEl.innerHTML = '';
    return;
  }
  // Optional admin check:
  // const doc = await db.collection('admins').doc(user.uid).get();
  // if (!doc.exists){ show('Unauthorized. Admins only.', false); return; }

  loadFirstPage();
});
