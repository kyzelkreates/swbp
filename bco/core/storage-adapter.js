// BCO Core — Run 1: LocalStorage Adapter
// Storage abstraction layer. Swap this for SupabaseAdapter in future runs.
// Run 6 patch: added keys(), clear(), and in-process subscribe() (same-tab reactive).

// ─────────────────────────────────────────────
// IN-PROCESS SUBSCRIBER MAP (same-tab reactivity)
// Solves the gap noted in Run 4: window "storage" events only fire
// across tabs, not within the same tab that made the write.
// ─────────────────────────────────────────────

const _subscribers = new Map(); // key → Set<callback>

function _notify(key, value) {
  _subscribers.get(key)?.forEach((fn) => fn(value));
  _subscribers.get("*")?.forEach((fn) => fn({ key, value }));
}

const LocalStorageAdapter = {

  get(key) {
    try {
      const data = localStorage.getItem(key);
      return data ? JSON.parse(data) : null;
    } catch {
      return null;
    }
  },

  set(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
    _notify(key, value);
  },

  update(key, fn) {
    const current = this.get(key);
    const updated = fn(current);
    this.set(key, updated);
    return updated;
  },

  delete(key) {
    localStorage.removeItem(key);
    _notify(key, null);
  },

  // ── Run 6 patch: needed by tenantStorage.purge() + .keys() ──
  keys(prefix = "") {
    return Object.keys(localStorage).filter((k) =>
      prefix ? k.startsWith(prefix) : true
    );
  },

  // Wipe all keys matching a prefix (or all BCO keys if no prefix)
  clear(prefix = "") {
    this.keys(prefix).forEach((k) => localStorage.removeItem(k));
  },

  // ── Enhanced subscribe: same-tab + cross-tab ─────────────────
  // Returns an unsubscribe function.
  subscribe(key, callback) {
    if (!_subscribers.has(key)) _subscribers.set(key, new Set());
    _subscribers.get(key).add(callback);

    // Also listen for cross-tab writes
    const crossTabHandler = (event) => {
      if (event.key === key) {
        try { callback(JSON.parse(event.newValue)); } catch { callback(null); }
      }
    };
    if (typeof window !== "undefined") {
      window.addEventListener("storage", crossTabHandler);
    }

    // Return unsubscribe
    return () => {
      _subscribers.get(key)?.delete(callback);
      if (typeof window !== "undefined") {
        window.removeEventListener("storage", crossTabHandler);
      }
    };
  },

  // Subscribe to ALL key writes ("*" wildcard) — used by UI live refresh
  subscribeAll(callback) {
    return this.subscribe("*", callback);
  }
};

// ── In-memory adapter (for Node / test environments) ─────────────────
const MemoryAdapter = {
  _store: new Map(),

  get(key)         { return this._store.get(key) ?? null; },
  set(key, value)  { this._store.set(key, value); _notify(key, value); },
  update(key, fn)  { const v = fn(this.get(key)); this.set(key, v); return v; },
  delete(key)      { this._store.delete(key); _notify(key, null); },
  keys(prefix = "") {
    return [...this._store.keys()].filter((k) => prefix ? k.startsWith(prefix) : true);
  },
  clear(prefix = "") { this.keys(prefix).forEach((k) => this._store.delete(k)); },
  subscribe(key, cb) {
    if (!_subscribers.has(key)) _subscribers.set(key, new Set());
    _subscribers.get(key).add(cb);
    return () => _subscribers.get(key)?.delete(cb);
  },
  subscribeAll(cb) { return this.subscribe("*", cb); }
};

// Active adapter — auto-select; swap explicitly via setStorageAdapter()
let StorageAdapter =
  typeof localStorage !== "undefined" ? LocalStorageAdapter : MemoryAdapter;

export function setStorageAdapter(adapter) {
  StorageAdapter = adapter;
}

export { LocalStorageAdapter, MemoryAdapter, StorageAdapter };
