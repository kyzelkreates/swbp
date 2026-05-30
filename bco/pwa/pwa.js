// BCO PWA Shell — Run 4
// Lightweight progressive web app client layer.
// Handles: service worker, offline cache, push notifications, SSOT sync on reconnect.

import { createEvent } from "../core/events.js";
import { evaluateRules } from "../core/rules.js";
import { processAction } from "../core/actions.js";
import { storage, SSOT_KEYS, rawLog } from "../core/storage.js";

// ─────────────────────────────────────────────
// PWA INIT
// ─────────────────────────────────────────────

/**
 * initPWA()
 * Boots all PWA subsystems. Call once after initSSOT().
 */
export async function initPWA() {
  registerServiceWorker();
  enableOfflineCache();
  await initPushNotifications();
  syncStorageOnReconnect();
  console.log("[BCO PWA] Initialised.");
}

// ─────────────────────────────────────────────
// SERVICE WORKER
// ─────────────────────────────────────────────

export function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    console.warn("[BCO PWA] Service workers not supported.");
    return;
  }

  navigator.serviceWorker
    .register("/bco-sw.js")
    .then((reg) => {
      rawLog("PWA_SW_REGISTERED", { scope: reg.scope });
      console.log("[BCO PWA] Service worker registered:", reg.scope);
    })
    .catch((err) => {
      console.warn("[BCO PWA] Service worker registration failed:", err.message);
    });
}

// ─────────────────────────────────────────────
// OFFLINE CACHE
// ─────────────────────────────────────────────

/**
 * enableOfflineCache()
 * Marks the system as cache-enabled.
 * Actual caching strategy is defined in bco-sw.js (service worker).
 */
export function enableOfflineCache() {
  storage.update(SSOT_KEYS.LOGS, (logs) => [
    ...(logs || []),
    { type: "OFFLINE_CACHE_ENABLED", timestamp: new Date().toISOString() }
  ]);
}

// ─────────────────────────────────────────────
// PUSH NOTIFICATIONS (browser-native)
// ─────────────────────────────────────────────

export async function initPushNotifications() {
  if (!("Notification" in window)) {
    console.warn("[BCO PWA] Push notifications not supported.");
    return;
  }

  if (Notification.permission === "default") {
    const permission = await Notification.requestPermission();
    rawLog("PWA_NOTIFICATION_PERMISSION", { result: permission });
  }

  if (Notification.permission === "granted") {
    console.log("[BCO PWA] Push notifications enabled.");
  } else {
    console.warn("[BCO PWA] Push notifications denied — using in-app toasts only.");
  }
}

/**
 * sendNativePush(title, body, icon?)
 * Sends a native OS notification if permission is granted.
 * Falls back silently — in-app toasts (notifications.js) are always active.
 */
export function sendNativePush(title, body, icon = "/icons/icon-192.png") {
  if (Notification.permission !== "granted") return;
  new Notification(title, { body, icon });
}

// ─────────────────────────────────────────────
// OFFLINE → ONLINE SYNC
// ─────────────────────────────────────────────

/**
 * syncStorageOnReconnect()
 * Listens for the browser coming back online and triggers a sync event.
 * Run 5 (Supabase adapter) will handle the actual remote sync here.
 */
export function syncStorageOnReconnect() {
  window.addEventListener("online", () => {
    rawLog("PWA_RECONNECTED", { timestamp: new Date().toISOString() });
    console.log("[BCO PWA] Back online — sync triggered.");
    // Run 5 extension point: call SupabaseAdapter.sync() here
  });

  window.addEventListener("offline", () => {
    rawLog("PWA_OFFLINE", { timestamp: new Date().toISOString() });
    console.warn("[BCO PWA] Offline — writes buffered in LocalStorage.");
  });
}

// ─────────────────────────────────────────────
// QUICK ACTIONS (mobile / PWA shortcuts)
// ─────────────────────────────────────────────

/**
 * QUICK ACTION TYPES
 * Exposed as PWA shortcuts in manifest.json.
 */
export const QUICK_ACTIONS = [
  "create_event",
  "trigger_action",
  "view_alerts",
  "approve_action",
  "dismiss_alert"
];

/**
 * handleQuickAction(actionType, payload)
 * Processes a PWA quick action through the full pipeline.
 * Creates an event → evaluates rules → processes actions.
 */
export function handleQuickAction(actionType, payload = {}) {
  if (!QUICK_ACTIONS.includes(actionType)) {
    console.warn(`[BCO PWA] Unknown quick action: "${actionType}"`);
    return null;
  }

  const event = createEvent(actionType, "PWA", payload, "user");
  rawLog(actionType, payload, "PWA", "user");

  const actions = evaluateRules(event);
  const processed = actions.map((action) => processAction(action));

  return { event, actions: processed };
}
