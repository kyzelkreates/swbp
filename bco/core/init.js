// BCO Core — Run 3: System Initialisation (updated)
// Bootstraps SSOT keys + hydrates module registry from persisted state.

import { storage, SSOT_KEYS } from "./storage.js";
import { logEvent } from "./events.js";
import { moduleRegistry } from "./modules.js";

const MODE = "LOCAL";

export function initSSOT() {
  // Bootstrap all SSOT keys if not already present
  Object.values(SSOT_KEYS).forEach((key) => {
    if (!storage.get(key)) {
      storage.set(key, []);
    }
  });

  // Re-populate in-memory module registry from persisted SSOT on restart
  moduleRegistry.hydrate();

  logEvent("SYSTEM_INIT", { mode: MODE, timestamp: new Date().toISOString() });
  console.log(`[BCO] System initialised in ${MODE} mode. Modules loaded: ${moduleRegistry.getAll().length}`);
}
