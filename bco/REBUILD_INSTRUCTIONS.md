# BCO Core — Builder Reconstruction Guide

> For any developer picking up this codebase and rebuilding or extending it correctly.
> Read this before touching a single file.

---

## 1. The Architecture Contract is Immutable

The file `.agents/rules/bco-core-run0-architecture.md` (or `bco/` root equivalent) is **Run 0** — the system contract.

Every decision in this codebase flows from it. Before writing any code:

- Read Run 0 in full.
- If you want to change the architecture — write a new versioned contract document first.
- Do not modify existing files to break the contract. If in doubt, add a new file.

The eight core rules (summarised):

1. One global state store — `storage.js` — no duplicates
2. Everything is an event — state changes only after event processing
3. Storage is always abstracted — never call `localStorage` or a DB directly
4. Modules are isolated — communicate only via events/actions
5. AI is non-destructive — suggest only, never mutate
6. Rule engine has authority — evaluated before every action
7. UI is read-only — renders state, dispatches events only
8. No hard coupling — no direct storage calls, no cross-module writes

---

## 2. Run Sequence — Build in Order

Each run builds on the previous. Never skip a run. Never implement a higher run before the lower one is stable.

| Run | Layer | What it adds |
|-----|-------|-------------|
| 0 | Architecture Contract | Immutable rules — read before anything else |
| 1 | State Engine | `storage.js`, `storage-adapter.js`, `events.js` |
| 2 | Rule + Action Engine | `rules.js`, `actions.js` |
| 3 | Module System | `modules.js`, `init.js` |
| 4 | UI + PWA + Brand | `ui/`, `pwa/`, `brand/` |
| 5 | AI Analytics | `ai/` — stats, patterns, risk, forecast, insights |
| 6 | Multi-Tenant SaaS | `saas/`, `auth/`, `deploy/` |
| 7 | Marketplace Ecosystem | `ecosystem/` — sandbox, registry, revenue |
| 8 | No-Code Automation | `nocode/` — schema, compiler, engine, scheduler |
| 9 | Autonomous Agents | `agents/` — core, coordinator, planner, recovery |
| 10 | Governance Layer | `governance/` — audit, compliance, snapshots, failure prevention |

---

## 3. Layer Dependency Rules (strict)

```
governance/  ← imports from: agents/, saas/, auth/, core/, nocode/
agents/      ← imports from: core/, ai/, saas/, ui/, nocode/
nocode/      ← imports from: core/, saas/, ui/
ecosystem/   ← imports from: core/, saas/
saas/        ← imports from: core/, auth/
ai/          ← imports from: core/
ui/          ← imports from: core/, ai/
brand/       ← imports from: (standalone)
auth/        ← imports from: core/
deploy/      ← imports from: core/
core/        ← imports from: (nothing internal — foundation only)
```

**Never allow a lower layer to import from a higher one.**
For example: `core/` must never import from `agents/` or `governance/`.
If you need to audit this, run:

```bash
grep -rn "from.*governance/" bco/core/ bco/ai/ bco/saas/
# Should return nothing
```

---

## 4. Event + Action Universal Format

Every event must match this exact shape:

```js
{
  id:        crypto.randomUUID(),   // always generate fresh
  type:      "STRING_CONSTANT",     // ALL_CAPS_SNAKE_CASE
  source:    "user" | "ai" | "system" | "agent" | "workflow",
  module:    "MODULE_NAME",
  payload:   {},                    // arbitrary object
  timestamp: new Date().toISOString()
}
```

Every action must match this shape:

```js
{
  id:          crypto.randomUUID(),
  type:        "STRING_CONSTANT",
  status:      "pending" | "approved" | "rejected" | "executed",
  triggeredBy: "event_id",
  payload:     {},
  timestamp:   new Date().toISOString()
}
```

Never invent your own format. Never add a `data:` wrapper. These shapes are fixed by Run 0.

---

## 5. Storage Adapter Contract

The system exposes exactly five storage methods. Use only these:

```js
StorageAdapter.get(key)
StorageAdapter.set(key, value)
StorageAdapter.update(key, partialValue)
StorageAdapter.delete(key)
StorageAdapter.subscribe(key, callback)
```

**Never call `localStorage`, `supabase`, or any DB directly.**
The adapter is swappable — that is the whole point.

Tenant-scoped keys use the prefix `t:{tenantId}:{key}`.
Global keys have no prefix.

---

## 6. Adding a New Module

A module must follow the module contract from Run 0:

```js
export default {
  name:        "MY_MODULE",
  entities:    [],          // data schemas
  actions:     [],          // action types this module handles
  rules:       [],          // rules this module registers
  ui_blocks:   [],          // UI components it provides
  permissions: []           // who can access it
};
```

- Register it via `registerModule()` from `core/modules.js`
- Never write directly to another module's state
- Communicate only via `dispatchEvent()` / `dispatchAction()`

---

## 7. Adding a New Agent Type (Run 9+)

1. Add a new entry to `AGENT_TYPES` in `agents/agent-core.js`
2. Add its allowed capabilities to `AGENT_CAPABILITIES`
3. Confirm nothing in the new capabilities list appears in `AGENT_FORBIDDEN`
4. The agent will automatically be safety-checked by `_assertCapability()` and `_assertNotForbidden()` at execution time

**Never give an agent direct storage access.** All mutations go through `dispatchAction()`.

---

## 8. Adding a New Governance Check (Run 10+)

`governance/governance-engine.js` runs five checks in order:
`tenant → permission → billing → safety → autonomy`

To add a sixth:

1. Write `_checkYourThing(action, context)` returning `{ ok: boolean, reason: string }`
2. Call it inside `governanceCheck()` after the five existing checks
3. Add `"your_check"` to `violations` if it fails
4. Add it to the `allowed` condition
5. Every action still gets audit-logged regardless of result — do not change that

---

## 9. Audit Log is Immutable — Do Not Break This

`governance/audit.js` uses `Object.freeze()` on every entry. The log is append-only.

Rules:
- `auditLog()` only. Never push to the store array manually.
- GDPR erasure uses `purgeAuditEntriesForUser()` — this redacts identity but keeps the entry skeleton.
- `verifyAuditIntegrity()` re-hashes every entry. If you modify a frozen entry the hash will fail.
- Do not change the hash algorithm without re-hashing all existing entries.

---

## 10. No-Code Workflow Nodes (Run 8+)

There are 20 node types across 5 categories. To add a new one:

1. Add to `NODE_TYPES` and the appropriate `NODE_CATEGORIES` bucket in `nocode/workflow-schema.js`
2. Add a handler case in `nocode/workflow-engine.js` inside `_executeActionNode()`
3. If it's a trigger type, add it to `evaluateTrigger()` as well
4. Add a matching template entry to `nocode/workflow-templates.js` if it's a common pattern

---

## 11. Environment / Runtime Notes

- All files use ES module syntax (`import`/`export`). No CommonJS (`require`/`module.exports`).
- No build step is required — the system is plain JS modules.
- Compatible with: modern browsers (via bundler), Deno, Node 18+, Bun.
- For browser use: bundle with Vite, Rollup, or esbuild. Set `"type": "module"` in `package.json`.
- The sandbox (`ecosystem/sandbox.js`) uses the Web Worker API in browsers and `node:vm` in Node — ensure your runtime supports whichever you target.
- `crypto.randomUUID()` is used throughout — available natively in modern browsers and Node 15+.
- `performance.memory` (in `agents/metrics.js`) is browser-only. In Node it returns `-1` — that is expected, not a bug.

---

## 12. What Comes After Run 10

The system is production-ready at Run 10. Suggested future runs:

| Run | Suggested Layer |
|-----|----------------|
| 11 | Real-time collaboration (WebSocket event sync across tabs/users) |
| 12 | Plugin marketplace UI (frontend install/uninstall flows) |
| 13 | Advanced cron scheduler (full 5-field cron for TRIGGER_TIME nodes) |
| 14 | Observability export (OpenTelemetry, Datadog, Sentry adapters) |
| 15 | White-label export (generate a branded SDK from BCO Core) |

Whatever you build — follow Run 0. Always.

---

## 13. Quick Rebuild Checklist

If you are rebuilding from scratch in a new environment:

- [ ] Copy all files preserving the exact directory structure
- [ ] Keep `bco/index.js` as the single public import surface
- [ ] Do not rename files — cross-file imports are explicit by path
- [ ] Read `.agents/rules/bco-core-run0-architecture.md` before writing any code
- [ ] Run the audit check from `README.md` to verify no back-references
- [ ] Set your storage adapter target (`LOCAL` or `SUPABASE`) in `deploy/deployment.js`
- [ ] Call `initSystem()` once at boot before any other BCO call
- [ ] Set the autonomy mode for each tenant via `setAutonomyMode()` — default is `ASSISTED`
- [ ] Create an initial snapshot per tenant after boot: `createSnapshot(tenantId, 'initial')`

---

*BCO Core — built by Kyzel Kreates | Architecture contract: Run 0 (immutable)*
