// scripts/config.js — STRICT Firestore-backed config (no fallbacks, no defaults)
// REQUIREMENT: settings/app ডকে এই ফিল্ডগুলো থাকতে হবে:
//   - DRIVE_API_KEY (string, non-empty)
//   - REQUIRED_PASSWORD (string, non-empty)
//   - ANOTHER_PASSWORD  (string, non-empty)
//   - DEFAULT_FEEDS (object/map) with: images, videos, favorites (non-empty strings)
//
// settings.html / index.html এ আগে compat SDK লোড থাকতে হবে:
// <script src="https://www.gstatic.com/firebasejs/11.0.1/firebase-app-compat.js"></script>
// <script src="https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore-compat.js"></script>

export const firebaseConfig = {
  apiKey: "AIzaSyBP2mcTImq6j_IqtUBi-UmfbHV_2pc1Zuw",
  authDomain: "minterest-beta.firebaseapp.com",
  projectId: "minterest-beta",
  storageBucket: "minterest-beta.firebasestorage.app",
  messagingSenderId: "822920853423",
  appId: "1:822920853423:web:9a426afa6fb3b8514ae15a",
  measurementId: "G-J3WZ8EL2XY",
};

// -------- Firebase bootstrap (compat) ----------
export function ensureFirebaseApp() {
  if (!firebase.apps || !firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
  }
  return firebase.app();
}
function getDb() {
  ensureFirebaseApp();
  return firebase.firestore();
}

// -------- Utils ----------
const reqStr = (obj, key, path) => {
  const v = obj?.[key];
  if (typeof v !== "string" || !v.trim()) {
    throw new Error(`Missing/empty string at ${path}.${key}`);
  }
  return v.trim();
};
const reqMapStr = (obj, key, subkeys, path) => {
  const m = obj?.[key];
  if (!m || typeof m !== "object") {
    throw new Error(`Missing object at ${path}.${key}`);
  }
  const out = {};
  for (const k of subkeys) {
    const v = m[k];
    if (typeof v !== "string" || !v.trim()) {
      throw new Error(`Missing/empty string at ${path}.${key}.${k}`);
    }
    out[k] = v.trim();
  }
  return out;
};

// -------- STRICT runtime config (throws if anything missing) ----------
export async function getRuntimeConfigStrictAsync() {
  const snap = await getDb().collection("settings").doc("app").get();
  if (!snap.exists) {
    throw new Error("Firestore doc settings/app not found");
  }
  const data = snap.data() || {};

  const cfg = {
    DRIVE_API_KEY:     reqStr(data, "DRIVE_API_KEY", "settings/app"),
    REQUIRED_PASSWORD: reqStr(data, "REQUIRED_PASSWORD", "settings/app"),
    ANOTHER_PASSWORD:  reqStr(data, "ANOTHER_PASSWORD",  "settings/app"),
    DEFAULT_FEEDS:     reqMapStr(data, "DEFAULT_FEEDS", ["images", "videos", "favorites"], "settings/app"),
  };

  // Convenience: popular helper for callers
  cfg.DEFAULT_DRIVE_URL = cfg.DEFAULT_FEEDS.images;
  return cfg;
}

// -------- Optional: live watch (strict) ----------
export function watchRuntimeConfigStrict(onChange, onError) {
  const ref = getDb().collection("settings").doc("app");
  return ref.onSnapshot({
    next: (snap) => {
      try {
        if (!snap.exists) throw new Error("settings/app doc deleted");
        const data = snap.data() || {};
        const nextCfg = {
          DRIVE_API_KEY:     reqStr(data, "DRIVE_API_KEY", "settings/app"),
          REQUIRED_PASSWORD: reqStr(data, "REQUIRED_PASSWORD", "settings/app"),
          ANOTHER_PASSWORD:  reqStr(data, "ANOTHER_PASSWORD",  "settings/app"),
          DEFAULT_FEEDS:     reqMapStr(data, "DEFAULT_FEEDS", ["images", "videos", "favorites"], "settings/app"),
        };
        nextCfg.DEFAULT_DRIVE_URL = nextCfg.DEFAULT_FEEDS.images;
        onChange && onChange(nextCfg);
      } catch (e) {
        onError ? onError(e) : console.error(e);
      }
    },
    error: (e) => (onError ? onError(e) : console.error(e)),
  });
}
