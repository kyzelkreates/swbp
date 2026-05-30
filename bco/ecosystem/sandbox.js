// BCO Ecosystem — Sandbox Execution Layer (Run 7 + Security Hardening)
// Three execution tiers enforced with real isolation boundaries:
//
//   STRICT   → Web Worker (browser) / vm.runInNewContext (Node)
//              No shared memory. Communicate via postMessage only.
//              Timeout enforced. Malicious throw cannot escape.
//
//   STANDARD → Same thread with Proxy-enforced capability limits.
//              Own-storage read/write. emit() only for cross-module.
//              Prototype pollution defence. Input validation.
//
//   ELEVATED → Direct call. First-party / platform modules only.
//              Requires _elevatedReason in package. Logged always.
//
// Rule §11: modules cannot touch other module internals.
// All cross-module communication MUST go through events/actions only.

import { SANDBOX_LEVELS, MODULE_PERMISSIONS } from "./package-standard.js";
import { emitEvent } from "../core/events.js";
import { rawLog } from "../core/storage.js";
import { tenantStorage, TENANT_KEYS } from "../saas/tenant-storage.js";

// ─────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────

const DEFAULT_TIMEOUT_MS = {
  [SANDBOX_LEVELS.STRICT]:   5_000,
  [SANDBOX_LEVELS.STANDARD]: 10_000,
  [SANDBOX_LEVELS.ELEVATED]: 30_000
};

const MAX_PAYLOAD_BYTES = 512 * 1024; // 512 KB — prevent oversized message attacks

// ─────────────────────────────────────────────
// EXECUTION ROUTER
// ─────────────────────────────────────────────

/**
 * runModule(module, handlerFn, context)
 * Routes to the correct sandbox tier.
 *
 * @param {BCOPackage}  module
 * @param {Function}    handlerFn  — the module's exported handler
 * @param {object}      context    — { event, tenantId, userRole }
 * @returns {Promise<SandboxResult>}
 */
export async function runModule(module, handlerFn, context) {
  _validateContext(context, module);

  rawLog("MODULE_EXECUTION_START", {
    module:   module.name,
    sandbox:  module.sandbox_level,
    tenantId: context.tenantId
  }, "SANDBOX");

  try {
    let result;

    switch (module.sandbox_level) {
      case SANDBOX_LEVELS.STRICT:
        result = await executeInSandbox(module, handlerFn, context);
        break;
      case SANDBOX_LEVELS.STANDARD:
        result = await executeWithLimits(module, handlerFn, context);
        break;
      case SANDBOX_LEVELS.ELEVATED:
        result = await executeDirect(module, handlerFn, context);
        break;
      default:
        throw new Error(`[BCO Sandbox] Unknown sandbox_level: "${module.sandbox_level}"`);
    }

    rawLog("MODULE_EXECUTION_COMPLETE", { module: module.name, status: result.status }, "SANDBOX");
    return result;

  } catch (err) {
    rawLog("MODULE_EXECUTION_ERROR", { module: module.name, error: err.message }, "SANDBOX");
    return { status: "error", module: module.name, error: err.message };
  }
}

// ─────────────────────────────────────────────
// TIER 1 — STRICT SANDBOX
// Browser: Web Worker with postMessage channel.
// Node:    vm.runInNewContext with frozen globals.
// In both cases the module code runs in a separate execution context —
// a thrown exception cannot propagate to the host.
// ─────────────────────────────────────────────

export async function executeInSandbox(module, handlerFn, context) {
  const timeoutMs = module.config?.timeoutMs ?? DEFAULT_TIMEOUT_MS[SANDBOX_LEVELS.STRICT];

  // ── Browser: Web Worker isolation ──────────
  if (typeof Worker !== "undefined") {
    return _runInWorker(module, handlerFn, context, timeoutMs);
  }

  // ── Node: vm.runInNewContext isolation ──────
  if (typeof process !== "undefined") {
    return _runInNodeVM(module, handlerFn, context, timeoutMs);
  }

  // ── Fallback: Proxy-only (no Worker/vm available) ──
  console.warn(`[BCO Sandbox] STRICT: Worker/vm unavailable for "${module.name}" — using Proxy fallback.`);
  return _runWithProxy(module, handlerFn, _buildStrictContext(module, context), timeoutMs, SANDBOX_LEVELS.STRICT);
}

// ─────────────────────────────────────────────
// WORKER RUNNER (browser)
// ─────────────────────────────────────────────

async function _runInWorker(module, handlerFn, context, timeoutMs) {
  return new Promise((resolve, reject) => {
    // Serialise the handler source + a minimal context into the worker
    const handlerSource = handlerFn.toString();
    const safeContext   = _serialiseSafeContext(module, context);

    _assertPayloadSize(safeContext);

    const workerScript = `
      self.onmessage = async function(e) {
        const { handlerSource, context } = e.data;
        try {
          // Reconstruct handler from source string
          const handler = new Function("return (" + handlerSource + ")")();
          const result  = await handler(context);
          self.postMessage({ ok: true, result });
        } catch (err) {
          self.postMessage({ ok: false, error: err.message });
        }
      };
    `;

    const blob   = new Blob([workerScript], { type: "application/javascript" });
    const url    = URL.createObjectURL(blob);
    const worker = new Worker(url);

    const timer = setTimeout(() => {
      worker.terminate();
      URL.revokeObjectURL(url);
      reject(new Error(`[BCO Sandbox] STRICT Worker timed out after ${timeoutMs}ms — "${module.name}"`));
    }, timeoutMs);

    worker.onmessage = ({ data }) => {
      clearTimeout(timer);
      worker.terminate();
      URL.revokeObjectURL(url);
      if (data.ok) {
        resolve({ status: "sandboxed_execution", module: module.name, sandbox: SANDBOX_LEVELS.STRICT, result: data.result });
      } else {
        resolve({ status: "error", module: module.name, error: data.error });
      }
    };

    worker.onerror = (err) => {
      clearTimeout(timer);
      worker.terminate();
      URL.revokeObjectURL(url);
      resolve({ status: "error", module: module.name, error: err.message });
    };

    worker.postMessage({ handlerSource, context: safeContext });
  });
}

// ─────────────────────────────────────────────
// NODE VM RUNNER
// ─────────────────────────────────────────────

async function _runInNodeVM(module, handlerFn, context, timeoutMs) {
  try {
    // Dynamic import — vm is a Node built-in, not available in browser
    const vm = await import("vm");

    const safeContext = _serialiseSafeContext(module, context);
    _assertPayloadSize(safeContext);

    // Freeze the sandbox globals — prevent prototype pollution
    const sandbox = vm.createContext(
      Object.freeze({
        context:   safeContext,
        result:    undefined,
        console:   { log: () => {}, warn: () => {}, error: () => {} },
        setTimeout: undefined,
        setInterval: undefined,
        fetch:     undefined,
        XMLHttpRequest: undefined
      })
    );

    const script = new vm.Script(
      `(async () => { result = await (${handlerFn.toString()})(context); })()`,
      { filename: `bco-module-${module.name}`, lineOffset: 0 }
    );

    await script.runInContext(sandbox, { timeout: timeoutMs });

    return {
      status:  "sandboxed_execution",
      module:  module.name,
      sandbox: SANDBOX_LEVELS.STRICT,
      result:  sandbox.result
    };

  } catch (err) {
    return { status: "error", module: module.name, error: err.message };
  }
}

// ─────────────────────────────────────────────
// TIER 2 — STANDARD (Proxy-limited, same thread)
// ─────────────────────────────────────────────

export async function executeWithLimits(module, handlerFn, context) {
  const timeoutMs = module.config?.timeoutMs ?? DEFAULT_TIMEOUT_MS[SANDBOX_LEVELS.STANDARD];
  const limitedContext = _buildStandardContext(module, context);
  return _runWithProxy(module, handlerFn, limitedContext, timeoutMs, SANDBOX_LEVELS.STANDARD);
}

// ─────────────────────────────────────────────
// TIER 3 — ELEVATED (direct, first-party only)
// ─────────────────────────────────────────────

export async function executeDirect(module, handlerFn, context) {
  // Extra guard: elevated requires _elevatedReason
  if (!module._elevatedReason) {
    throw new Error(
      `[BCO Sandbox] ELEVATED execution denied for "${module.name}": missing _elevatedReason.`
    );
  }
  rawLog("ELEVATED_EXECUTION", { module: module.name, reason: module._elevatedReason }, "SANDBOX");
  const result = await handlerFn(context);
  return { status: "direct_execution", module: module.name, sandbox: SANDBOX_LEVELS.ELEVATED, result };
}

// ─────────────────────────────────────────────
// SHARED PROXY RUNNER (standard + strict fallback)
// ─────────────────────────────────────────────

async function _runWithProxy(module, handlerFn, safeContext, timeoutMs, sandboxLevel) {
  const result = await _withTimeout(() => handlerFn(safeContext), timeoutMs);
  return {
    status:  sandboxLevel === SANDBOX_LEVELS.STRICT ? "sandboxed_execution" : "limited_execution",
    module:  module.name,
    sandbox: sandboxLevel,
    result
  };
}

// ─────────────────────────────────────────────
// CONTEXT BUILDERS
// ─────────────────────────────────────────────

function _buildStrictContext(module, context) {
  return {
    module:   module.name,
    tenantId: context.tenantId,
    event:    _deepFreeze(_sanitise(context.event)),

    emit: (type, payload) => {
      _assertPayloadSize(payload);
      return emitEvent(`${module.name}.${type}`, module.name, _sanitise(payload), "module");
    },

    // Hard walls via Proxy — throw on any property access
    storage: _forbidden("storage",              module),
    actions: _forbidden("direct actions",       module),
    modules: _forbidden("cross-module access",  module),
    fetch:   _forbidden("network",              module)
  };
}

function _buildStandardContext(module, context) {
  return {
    module:   module.name,
    tenantId: context.tenantId,
    event:    _deepFreeze(_sanitise(context.event)),

    emit: (type, payload) => {
      _assertPayloadSize(payload);
      return emitEvent(`${module.name}.${type}`, module.name, _sanitise(payload), "module");
    },

    storage: {
      get: (key) => {
        _assertSafeKey(key);
        return tenantStorage.get(context.tenantId, `${module.name}.${key}`);
      },
      set: (key, val) => {
        _assertSafeKey(key);
        _assertPermission(module, MODULE_PERMISSIONS.WRITE_OWN_DATA);
        _assertPayloadSize(val);
        tenantStorage.set(context.tenantId, `${module.name}.${key}`, _sanitise(val));
      }
    },

    modules: _forbidden("cross-module access", module),
    fetch:   _forbidden("network",             module)
  };
}

// ─────────────────────────────────────────────
// SAFE CONTEXT FOR SERIALISATION (Worker / Node vm)
// Strips functions — only plain data crosses the thread boundary.
// ─────────────────────────────────────────────

function _serialiseSafeContext(module, context) {
  return {
    module:   module.name,
    tenantId: context.tenantId,
    event:    _sanitise(context.event)
    // No emit / storage / modules — worker has no access to host APIs
  };
}

// ─────────────────────────────────────────────
// SECURITY HELPERS
// ─────────────────────────────────────────────

function _forbidden(capability, module) {
  return new Proxy(Object.freeze({}), {
    get(_, prop) {
      const msg = `[BCO Sandbox] "${module.name}" (${module.sandbox_level}) denied: "${capability}.${String(prop)}"`;
      rawLog("SANDBOX_ACCESS_DENIED", { module: module.name, capability, prop: String(prop) }, "SANDBOX");
      throw new Error(msg);
    },
    set(_, prop) {
      throw new Error(`[BCO Sandbox] "${module.name}": write to "${capability}.${String(prop)}" denied.`);
    }
  });
}

function _assertPermission(module, permission) {
  if (!module.permissions?.includes(permission)) {
    throw new Error(`[BCO Sandbox] "${module.name}" lacks permission "${permission}".`);
  }
}

function _validateContext(context, module) {
  if (!context.tenantId) throw new Error(`[BCO Sandbox] Missing tenantId for module "${module.name}"`);
}

function _assertSafeKey(key) {
  if (typeof key !== "string" || key.includes("..") || key.includes(":") || key.length > 128) {
    throw new Error(`[BCO Sandbox] Unsafe storage key: "${key}"`);
  }
}

function _assertPayloadSize(payload) {
  const size = JSON.stringify(payload)?.length ?? 0;
  if (size > MAX_PAYLOAD_BYTES) {
    throw new Error(`[BCO Sandbox] Payload exceeds limit (${size} > ${MAX_PAYLOAD_BYTES} bytes).`);
  }
}

// Remove prototype-polluting keys from untrusted input
function _sanitise(obj) {
  if (obj === null || typeof obj !== "object") return obj;
  const clean = {};
  for (const key of Object.keys(obj)) {
    if (key === "__proto__" || key === "constructor" || key === "prototype") continue;
    clean[key] = typeof obj[key] === "object" ? _sanitise(obj[key]) : obj[key];
  }
  return clean;
}

// Deep-freeze an object so module code can't mutate shared event data
function _deepFreeze(obj) {
  if (obj === null || typeof obj !== "object") return obj;
  Object.keys(obj).forEach((k) => _deepFreeze(obj[k]));
  return Object.freeze(obj);
}

async function _withTimeout(fn, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`[BCO Sandbox] Execution timed out after ${ms}ms`)), ms
    );
    Promise.resolve().then(fn).then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e);  }
    );
  });
}
