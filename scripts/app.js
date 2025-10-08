/* Cleaned & PWA-ready build for Minterest — Drive Pins - 2025-10-08 05:53:35 UTC */
// scripts/app.js — Google Drive থেকে ছবি/ভিডিও গ্রিড রেন্ডারার (Firestore runtime config সহ)
// Dependency: getRuntimeConfigStrictAsync (./config.js)
// লক্ষ্য: পড়তে সহজ, বাগ-ফিক্সড, অ্যাক্সেসিবল, এবং ভালভাবে ডকুমেন্টেড "ক্লিন কোড"

/* eslint-disable no-console */
"use strict";

import { getRuntimeConfigStrictAsync } from "./config.js";

/* ============================================================================
 * কনস্ট্যান্টস
 * ==========================================================================*/
const DRIVE_API_BASE = "https://www.googleapis.com/drive/v3/files";
const LS_KEYS = {
  GRID: "drivepins_grid",
  SEEN: "drivepins_seen",
  VIEW: "drivepins_view",
};
const VIEW = {
  IMAGE: "image",
  VIDEO: "video",
  ALL: "all",
};
const IO_OBS_OPTS = { threshold: 0.1 };

/* ============================================================================
 * মডিউল-লেভেল স্টেট (DOM refs + runtime)
 * ==========================================================================*/
let CFG = null;                   // Firestore runtime config
let grid, toast, overlay, pwdInput, mediaToggle, fab; // DOM refs

const seen = new Set();           // ইতোমধ্যে যোগ করা file.id-গুলোর সেট
let renderCount = 0;              // গ্রিড কার্ড সাইজিং স্লট সাইক্লিংয়ের জন্য
let currentView = VIEW.IMAGE;     // UI-তে কোন কন্টেন্ট দেখাবো: image | video | all

/* ============================================================================
 * ইউটিলিটিজ
 * ==========================================================================*/

/** Element helper by id */
const el = (id) => document.getElementById(id);

/** IntersectionObserver: কার্ড viewport-এ ঢুকলে ধীরে দেখায় */
const observer = new IntersectionObserver((entries) => {
  entries.forEach((e) => {
    if (e.isIntersecting) {
      e.target.classList.add("visible");
      observer.unobserve(e.target);
    }
  });
}, IO_OBS_OPTS);

/** টোস্ট মেসেজ দেখাও */
function showToast(msg, ms = 2600) {
  if (!toast) return;
  toast.textContent = msg;
  toast.style.display = "block";
  window.setTimeout(() => (toast.style.display = "none"), ms);
}

/** অ্যাড মডাল ওপেন/ক্লোজ */
function openModal() {
  overlay?.style.setProperty("display", "flex");
  pwdInput?.focus();
}
function closeModal() {
  if (!overlay) return;
  overlay.style.display = "none";
  if (pwdInput) pwdInput.value = "";
}

/** সাকসেস ওভারলে (টিক-আইকন টাইপ) দেখাও */
function showSuccessOverlay() {
  const el = document.getElementById("success-overlay");
  if (!el) return;
  el.style.display = "flex";
  setTimeout(() => (el.style.display = "none"), 2000);
}

/**
 * Google Drive ফোল্ডার URL থেকে folderId বের করে
 * সাপোর্টেড ফর্ম্যাট:
 *  - /folders/<id>
 *  - ?id=<id>
 *  - /drive/u/<n>/folders/<id>
 */
function getFolderIdFromUrl(url) {
  try {
    if (!url) return null;
    const u = new URL(url);

    let m = u.pathname.match(/\/folders\/([a-zA-Z0-9_-]+)/);
    if (m) return m[1];

    const id = u.searchParams.get("id");
    if (id) return id;

    m = u.pathname.match(/\/drive\/u\/\d+\/folders\/([a-zA-Z0-9_-]+)/);
    if (m) return m[1];

    return null;
  } catch {
    return null;
  }
}

/** লোকালস্টোরেজে বোর্ড সেভ */
function saveBoard() {
  if (!grid) return;
  try {
    localStorage.setItem(LS_KEYS.GRID, grid.innerHTML);
    localStorage.setItem(LS_KEYS.SEEN, JSON.stringify([...seen]));
    localStorage.setItem(LS_KEYS.VIEW, currentView);
  } catch {
    // storage কোটা/প্রাইভেট মোড ইত্যাদি হলে চুপচাপ ফেল সেফ
  }
}

/** লোকালস্টোরেজ থেকে বোর্ড লোড */
function loadBoard() {
  if (!grid) return;
  try {
    const html = localStorage.getItem(LS_KEYS.GRID);
    const ids = localStorage.getItem(LS_KEYS.SEEN);
    const view = localStorage.getItem(LS_KEYS.VIEW);

    if (html) {
      grid.innerHTML = html;
      grid.querySelectorAll(".card").forEach((c) => c.classList.add("visible"));
    }
    if (ids) JSON.parse(ids).forEach((id) => seen.add(id));
    if (view) currentView = view;
  } catch {
    // corrupted data হলে স্কিপ
  }
}

/** বোর্ড/স্টেট রিসেট */
function resetBoard() {
  if (!grid) return;
  grid.innerHTML = "";
  seen.clear();
  [LS_KEYS.GRID, LS_KEYS.SEEN, LS_KEYS.VIEW].forEach((k) =>
    localStorage.removeItem(k)
  );
  showToast("Reset Successful");
}

/** টগল UI-কে currentView-এর সাথে সিঙ্ক রাখে (aria-checked সহ) */
function syncToggle() {
  if (!mediaToggle) return;
  const active = currentView === VIEW.VIDEO;
  mediaToggle.classList.toggle("active", active);
  mediaToggle.setAttribute("aria-checked", active ? "true" : "false");
}

/**
 * গ্রিড কার্ড ফিল্টার
 * @param {"image"|"video"|"all"} type
 */
function filterCards(type) {
  currentView = type;
  if (!grid) return;
  grid.querySelectorAll(".card").forEach((c) => {
    const show = type === VIEW.ALL || c.dataset.type === type;
    c.style.display = show ? "" : "none";
  });
  syncToggle();
}

/* ============================================================================
 * ডেটা ফেচ + রেন্ডার
 * ==========================================================================*/

/**
 * নির্দিষ্ট ফোল্ডারের ফাইল লিস্ট রিড করে গ্রিডে রেন্ডার করে
 * @param {string} folderId
 * @param {"image"|"video"|null} typeFilter - null হলে image+video দুইটিই
 * @returns {Promise<number>} যুক্ত হওয়া নতুন আইটেমের সংখ্যা
 */
async function listFolderFiles(folderId, typeFilter) {
  // mime type ক্লজ তৈরি
  let typeClause = "(mimeType contains 'image/' or mimeType contains 'video/')";
  if (typeFilter === VIEW.IMAGE) typeClause = "(mimeType contains 'image/')";
  if (typeFilter === VIEW.VIDEO) typeClause = "(mimeType contains 'video/')";

  const q = encodeURIComponent(
    `'${folderId}' in parents and ${typeClause} and trashed = false`
  );

  const all = [];
  let pageToken; // ← বাগ-ফিক্স: আগের কোডে pageToken ইউআরএলে পাঠানো হচ্ছিল না

  // পেজিনেশন-সহ সম্পূর্ণ ফেচ
  // প্রতি লুপে পরবর্তী পেজ আছে কি না দেখে ব্রেক
  while (true) {
    const url =
      `${DRIVE_API_BASE}?q=${q}` +
      `&fields=nextPageToken,files(id,name,mimeType,thumbnailLink,webViewLink)` +
      `&pageSize=1000&supportsAllDrives=true&includeItemsFromAllDrives=true` +
      `&key=${encodeURIComponent(CFG.DRIVE_API_KEY)}` +
      (pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : "");

    const res = await fetch(url);
    if (!res.ok) {
      // API/কনফিগ ইস্যু হলে পরিষ্কার এরর
      const body = await res.text().catch(() => "");
      throw new Error(body || `Drive API HTTP ${res.status}`);
    }

    const data = await res.json();

    (data.files || []).forEach((f) => {
      if (!seen.has(f.id)) all.push(f);
    });

    pageToken = data.nextPageToken;
    if (!pageToken) break;
  }

  // UX: প্রথম ইমেজটি আগে দেখাও (যদি থাকে)
  const firstImgIdx = all.findIndex((f) => (f.mimeType || "").startsWith("image/"));
  const ordered =
    firstImgIdx > 0
      ? [all[firstImgIdx], ...all.filter((_, i) => i !== firstImgIdx)]
      : all;

  let added = 0;
  for (const f of ordered) {
    renderCard(f);
    seen.add(f.id);
    added++;
  }

  if (added > 0) saveBoard();
  return added;
}

/**
 * একক ফাইল কার্ড DOM তৈরি ও অ্যাপেন্ড
 * @param {{id:string, mimeType:string, thumbnailLink?:string, webViewLink?:string}} file
 */
function renderCard(file) {
  if (!grid) return;
  const isVideo = (file.mimeType || "").startsWith("video/");

  const card = document.createElement("article");
  card.className = "card";
  card.dataset.type = isVideo ? VIEW.VIDEO : VIEW.IMAGE;

  const a = document.createElement("a");
  a.href = file.webViewLink || "#";
  a.target = "_blank";
  a.rel = "noopener";

  const img = document.createElement("img");
  // বড় থাম্বনেইল চাওয়া: =s2048
  const thumb = file.thumbnailLink
    ? file.thumbnailLink.replace(/=s\d+/, "=s2048")
    : `https://drive.google.com/thumbnail?id=${file.id}&sz=w1000`;
  img.src = thumb;
  img.alt = isVideo ? "ভিডিও" : "ছবি";
  img.loading = "lazy";

  // অল্প ভিজুয়াল ভ্যারাইটি: ৫-স্লট সাইজিং
  const slot = (renderCount % 5) + 1;
  img.classList.add(`size-${slot}`);

  a.appendChild(img);
  card.appendChild(a);

  // ভিডিও হলে প্লে-আইকন ওভারলে
  if (isVideo) {
    const iconWrap = document.createElement("div");
    iconWrap.className = "video-icon-overlay";
    iconWrap.innerHTML = `
      <svg viewBox="0 0 64 64" aria-hidden="true" focusable="false">
        <circle cx="32" cy="32" r="22" fill="#000" fill-opacity="0.35" />
        <circle cx="32" cy="32" r="22" fill="none" stroke="#fff" stroke-opacity="0.85" stroke-width="1.4"/>
        <path d="M28 23 L28 41 L44 32 Z" fill="#fff" fill-opacity="0.92" />
      </svg>
    `;
    card.appendChild(iconWrap);
  }

  grid.appendChild(card);
  renderCount++;
  observer.observe(card);
}

/* ============================================================================
 * UI অ্যাকশনস
 * ==========================================================================*/

/**
 * পাসওয়ার্ড ভ্যালিডেশন → কনফিগে থাকা ডিফল্ট ফিডগুলো থেকে ডেটা লোড
 *  - images / videos / favorites (যদি সেট থাকে)
 *  - শেষে, বর্তমান ভিউ অনুযায়ী ফিল্টার
 */
async function handleAdd() {
  if (!CFG) {
    showToast("Configuration missing");
    return;
  }

  const pwd = pwdInput?.value || "";
  if (pwd !== CFG.REQUIRED_PASSWORD && pwd !== CFG.ANOTHER_PASSWORD) {
    showToast("ভুল পাসওয়ার্ড ⚠️");
    return;
  }

  showSuccessOverlay();
  closeModal();
  showToast("Loading…");

  const feeds = [
    { url: CFG.DEFAULT_FEEDS?.images || CFG.DEFAULT_DRIVE_URL, type: VIEW.IMAGE },
    { url: CFG.DEFAULT_FEEDS?.videos || CFG.DEFAULT_DRIVE_URL, type: VIEW.VIDEO },
    { url: CFG.DEFAULT_FEEDS?.favorites || null, type: null },
  ];

  let totalAdded = 0;

  try {
    for (const f of feeds) {
      if (!f.url) continue;
      const folderId = getFolderIdFromUrl(f.url);
      if (!folderId) continue;
      const added = await listFolderFiles(folderId, f.type);
      totalAdded += added;
    }

    filterCards(currentView);
    showToast(
      totalAdded === 0
        ? "নতুন ফাইল পাওয়া যায়নি 💔"
        : `${totalAdded} টি নতুন আইটেম যোগ হয়েছে`
    );
  } catch (err) {
    console.error(err);
    showToast("লোড করতে সমস্যা (public folder? API key?)");
  }
}

/* ============================================================================
 * বুটস্ট্র্যাপ
 * ==========================================================================*/

/**
 * অ্যাপ ইনিট:
 *  1) Firestore runtime config লোড (STRICT: না পেলে ব্লকিং ওভারলে)
 *  2) DOM রেফারেন্স ক্যাশ, লিস্নার বাইন্ড
 *  3) লোকালস্টোরেজ থেকে বোর্ড রিস্টোর + ভিউ ফিল্টার
 */
async function init() {
  // 1) STRICT কনফিগ লোড (ফেল হলে UI ব্লক)
  try {
    CFG = await getRuntimeConfigStrictAsync();
  } catch (err) {
    const blocker = document.createElement("div");
    blocker.style.cssText = `
      position:fixed; inset:0; z-index:99999; display:grid; place-items:center;
      background:rgba(5,8,12,0.9); color:#fff; padding:24px; text-align:center;
    `;
    blocker.innerHTML = `
      <div style="max-width:720px; background:#0e141c; border:1px solid rgba(255,255,255,.08);
                  border-radius:16px; padding:24px">
        <h2 style="margin:0 0 10px">Configuration Required</h2>
        <p style="color:#cbd5e1; margin:0 0 4px">${(err && err.message) || "Missing Firestore settings"}</p>
        <p style="color:#94a3b8; margin:0 0 16px">Please open <b>settings.html</b> and fill all required fields (API Key, passwords, and all three feed URLs).</p>
        <a href="settings.html" class="btn" style="display:inline-block; padding:10px 14px; border:1px solid rgba(255,255,255,.12); border-radius:10px; text-decoration:none; color:#fff">Go to Settings</a>
      </div>
    `;
    document.body.appendChild(blocker);
    console.error("Config load failed (strict):", err);
    return; // stop boot
  }

  // 2) DOM refs + handlers
  grid = el("grid");
  toast = el("toast");
  overlay = el("overlay");
  pwdInput = el("password");
  mediaToggle = el("mediaToggle");
  fab = el("fab");

  el("btnCancel")?.addEventListener("click", closeModal);
  el("btnAdd")?.addEventListener("click", handleAdd);
  fab?.addEventListener("click", openModal);

  if (mediaToggle) {
    const apply = () => {
      const type = mediaToggle.classList.contains("active") ? VIEW.VIDEO : VIEW.IMAGE;
      filterCards(type);
    };

    // mouse/keyboard — toggle like an accessible switch
    mediaToggle.addEventListener("click", () => {
      mediaToggle.classList.toggle("active");
      apply();
    });
    mediaToggle.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        mediaToggle.classList.toggle("active");
        apply();
      }
      if (e.key === "ArrowLeft") {
        mediaToggle.classList.remove("active");
        apply();
      }
      if (e.key === "ArrowRight") {
        mediaToggle.classList.add("active");
        apply();
      }
    });
  }

  // 3) লোকাল ডেটা রিস্টোর + ভিউ সিঙ্ক
  loadBoard();
  filterCards(currentView); // also calls syncToggle()

  // সেফ-পার্সিস্ট
  window.addEventListener("beforeunload", saveBoard);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) saveBoard();
  });
}

// একবারই ইনিট — আগের কোডে ডুপ্লিকেট লিস্নার ছিল, তা সরানো হল
window.addEventListener("DOMContentLoaded", init);

// গ্লোবাল রিসেট এক্সপোজ (ডিবাগ/সেটিংস থেকে কল করার জন্য)
window.resetBoard = resetBoard;
