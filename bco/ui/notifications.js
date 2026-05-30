// BCO Notification System — Run 4
// Real-time UI layer for alerts and system events.
// Decoupled from storage — reads from SSOT, pushes to DOM.

import { storage, SSOT_KEYS, rawLog } from "../core/storage.js";

// ─────────────────────────────────────────────
// NOTIFICATION STORE (in-memory render queue)
// ─────────────────────────────────────────────

const _subscribers = [];

// ─────────────────────────────────────────────
// PUSH NOTIFICATION
// ─────────────────────────────────────────────

/**
 * pushNotification(payload)
 * Writes to SSOT alerts + triggers UI toast.
 * Rule 7 compliance: UI reads state, does not own it.
 *
 * @param {{ message, severity: "info"|"warning"|"error"|"critical", module? }} payload
 */
export function pushNotification(payload) {
  const notification = {
    id: crypto.randomUUID(),
    message: payload.message,
    severity: payload.severity || "info",
    module:   payload.module   || null,
    read:     false,
    timestamp: new Date().toISOString()
  };

  // Persist to SSOT
  storage.update(SSOT_KEYS.ALERTS, (alerts) => [...(alerts || []), notification]);
  rawLog("NOTIFICATION_PUSHED", { id: notification.id, severity: notification.severity });

  // Notify subscribers (UI layer)
  _subscribers.forEach((fn) => fn(notification));

  // DOM toast
  showToast(notification);

  return notification;
}

// ─────────────────────────────────────────────
// TOAST RENDERER
// ─────────────────────────────────────────────

/**
 * showToast(notification)
 * Injects a dismissible toast into #bco-toast-container.
 * Auto-removes after 4s.
 */
export function showToast(notification) {
  let container = document.getElementById("bco-toast-container");
  if (!container) {
    container = document.createElement("div");
    container.id = "bco-toast-container";
    container.style.cssText = `
      position: fixed; bottom: 1.5rem; right: 1.5rem;
      z-index: 9999; display: flex; flex-direction: column; gap: 0.5rem;
      max-width: 360px;
    `;
    document.body.appendChild(container);
  }

  const icons = { info: "ℹ️", warning: "⚠️", error: "🔴", critical: "🚨" };
  const colors = {
    info:     "#2563eb",
    warning:  "#d97706",
    error:    "#dc2626",
    critical: "#7c3aed"
  };

  const toast = document.createElement("div");
  toast.className = `bco-toast bco-toast--${notification.severity}`;
  toast.style.cssText = `
    background: #1e1b4b; color: #fff; border-radius: 8px; padding: 0.75rem 1rem;
    display: flex; align-items: flex-start; gap: 0.5rem;
    border-left: 4px solid ${colors[notification.severity] || colors.info};
    box-shadow: 0 4px 20px rgba(0,0,0,0.3);
    animation: bco-slide-in 0.2s ease;
    font-family: var(--font-base, system-ui, sans-serif);
    font-size: 0.875rem; line-height: 1.4;
  `;
  toast.innerHTML = `
    <span>${icons[notification.severity] || "ℹ️"}</span>
    <span style="flex:1">${notification.message}</span>
    <button onclick="this.closest('.bco-toast').remove()"
            style="background:none;border:none;color:#9ca3af;cursor:pointer;font-size:1rem;line-height:1">✕</button>
  `;

  container.appendChild(toast);

  // Auto-dismiss
  setTimeout(() => toast.remove(), 4000);
}

// ─────────────────────────────────────────────
// SUBSCRIPTION (UI polling alternative)
// ─────────────────────────────────────────────

/**
 * onNotification(fn)
 * Subscribe to live notification events.
 * Returns unsubscribe function.
 */
export function onNotification(fn) {
  _subscribers.push(fn);
  return () => {
    const i = _subscribers.indexOf(fn);
    if (i > -1) _subscribers.splice(i, 1);
  };
}

// ─────────────────────────────────────────────
// MARK AS READ
// ─────────────────────────────────────────────

export function markRead(notificationId) {
  storage.update(SSOT_KEYS.ALERTS, (alerts) =>
    (alerts || []).map((a) => a.id === notificationId ? { ...a, read: true } : a)
  );
}

export function getUnreadCount() {
  const alerts = storage.get(SSOT_KEYS.ALERTS) || [];
  return alerts.filter((a) => !a.read).length;
}
