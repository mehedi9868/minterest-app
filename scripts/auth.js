/* Cleaned & PWA-ready build for Minterest — Drive Pins - 2025-10-08 05:53:35 UTC */
// scripts/auth.js — Firebase init + auth state UI + FAB enable/disable + logout
import { firebaseConfig } from "./config.js";

// Load Firebase SDKs via script tags already in HTML (compat). Init if needed:
if (!firebase.apps?.length) firebase.initializeApp(firebaseConfig);

const auth = firebase.auth();
const db   = firebase.firestore?.();

// UI refs
// ===== Activity Logging (login + heartbeat) =====
let __hbTimer = null;
async function writeHeartbeat(user){
  try{
    if(!db || !user) return;
    await db.collection('activity').doc(user.uid).set({
      lastActiveAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
  }catch(e){ /*silent*/ }
}
function startHeartbeat(user){
  stopHeartbeat();
  __hbTimer = setInterval(()=> writeHeartbeat(user), 60*1000);
  document.addEventListener('visibilitychange', ()=>{
    if(document.visibilityState === 'visible') writeHeartbeat(user);
  });
  window.addEventListener('beforeunload', ()=> writeHeartbeat(user), { once: true });
}
function stopHeartbeat(){
  if(__hbTimer){ clearInterval(__hbTimer); __hbTimer = null; }
}

const notice    = document.getElementById('auth-notice');
const userInfo  = document.getElementById('user-info');
const userPic   = document.getElementById('user-pic');
const userName  = document.getElementById('user-name');
const userNameFirst = document.getElementById('user-name-first');
const userEmail = document.getElementById('user-email');
const fab       = document.getElementById('fab');
const toggleBar = document.getElementById('toggleBar');

// Auth state handler
auth.onAuthStateChanged(async user=>{
  const loggedIn = !!user;
  // expose + event so অন্য স্ক্রিপ্ট জানতে পারে
  window.appIsLoggedIn = loggedIn;
  document.dispatchEvent(new CustomEvent('auth:state', { detail:{ loggedIn } }));

  if(loggedIn){
    /* first-name logic */
    const displayName = user?.displayName || '';
    const email = user?.email || '';
    let first = '';
    if (displayName.trim()) first = displayName.trim().split(/\s+/)[0];
    else if (email) first = email.split('@')[0];
    notice && (notice.style.display = "none");
    if(userInfo){ userInfo.style.display="flex"; }
    if(userPic)  userPic.src   = user.photoURL || "https://www.svgrepo.com/show/452030/user.svg";
    if(userName) userName.textContent = displayName || first || "User";
    if(userNameFirst) userNameFirst.textContent = first || "User";
    if(userEmail)userEmail.textContent = user.email || "";
    if(fab){ fab.disabled=false; fab.style.opacity="1"; }
    if(toggleBar) toggleBar.style.display = "";           // ✅ টগলবার দেখাও
  }else{
    stopHeartbeat();
    notice && (notice.style.display = "block");
    if(userInfo) userInfo.style.display="none";
    if(fab){ fab.disabled=true; fab.style.opacity="0.5"; }
    if(toggleBar) toggleBar.style.display = "none";       // ✅ টগলবার লুকাও
  }
});

// Make signOut callable for menu.js
// Unified sign out that also resets local state/UI
window.appSignOut = ()=> {
  try { window.resetBoard?.(); } catch(e){ console.warn("resetBoard error:", e); }
  try { 
    // As a safety, explicitly clear local cache keys
    ["drivepins_grid","drivepins_seen","drivepins_view"].forEach(k=>localStorage.removeItem(k));
  } catch(e){}
  if (typeof auth !== "undefined" && auth && auth.signOut){
    return auth.signOut()
      .catch(err=> console.error("signOut error:", err))
      .finally(()=> { try { location.href = "index.html"; } catch(e){} });
  } else {
    try { location.href = "index.html"; } catch(e){} 
    return Promise.resolve();
  }
};
window.appAuth    = auth;
window.appDB      = db;
