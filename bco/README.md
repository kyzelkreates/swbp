# BCO Core — Brandable Control OS

> A modular, event-driven, self-operating platform OS.
> Built across 10 progressive runs. Governed, auditable, and production-ready.

---

## What This Is

BCO Core is a complete backend operating system designed to power brandable SaaS products. It is not a framework or a library — it is a full platform OS with its own state engine, rule system, AI analytics, multi-tenant SaaS layer, no-code automation, autonomous agents, and enterprise governance.

Every layer was built to a strict architecture contract (Run 0) that is immutable across all runs.

---

## System Architecture

```
Run 0   Architecture Contract (immutable — governs all runs)
Run 1   SSOT State Engine          core/
Run 2   Rule + Action Engine       core/rules.js, core/actions.js
Run 3   Module System              core/modules.js
Run 4   UI + PWA + Branding        ui/, pwa/, brand/
Run 5   AI Analytics               ai/
Run 6   Multi-Tenant SaaS          saas/, auth/, deploy/
Run 7   Marketplace Ecosystem      ecosystem/
Run 8   No-Code Automation         nocode/
Run 9   Autonomous Agent Layer     agents/
Run 10  Enterprise Governance      governance/
```

---

## File Structure

```
bco/
├── index.js                     ← Single import barrel for the entire system
│
├── core/                        ← Run 1–3: State, events, actions, rules, modules
│   ├── storage.js               ← SSOT — single source of truth
│   ├── storage-adapter.js       ← Swappable storage (Local → Supabase → custom)
│   ├── events.js                ← Universal event dispatcher
│   ├── actions.js               ← Action lifecycle (pending → approved → executed)
│   ├── rules.js                 ← Rule evaluation engine
│   ├── modules.js               ← Module registry and loader
│   ├── init.js                  ← System bootstrap
│   └── index.js                 ← Core barrel
│
├── ai/                          ← Run 5: AI analytics layer
│   ├── stats.js                 ← Statistical primitives
│   ├── patterns.js              ← Pattern + anomaly detection
│   ├── risk.js                  ← Risk scoring
│   ├── recommendations.js       ← Recommendation engine
│   ├── forecast.js              ← Behavioural forecasting
│   ├── cross-module.js          ← Cross-module analytics
│   └── insight-engine.js        ← Full insight pipeline
│
├── ui/                          ← Run 4: UI layer (render-only)
│   ├── dashboard.js
│   ├── widgets.js
│   ├── notifications.js
│   ├── ai-panel.js
│   └── dashboard.css
│
├── pwa/                         ← Run 4: Progressive Web App
│   ├── pwa.js
│   └── bco-sw.js                ← Service worker
│
├── brand/                       ← Run 4: Brand engine
│   └── brand-engine.js
│
├── auth/                        ← Run 6: Role-based access control
│   └── permissions.js           ← ROLES: admin, operator, member, viewer, external
│
├── saas/                        ← Run 6: Multi-tenant SaaS
│   ├── tenant.js
│   ├── tenant-storage.js
│   ├── billing.js
│   ├── marketplace.js
│   ├── usage.js
│   └── request-pipeline.js
│
├── deploy/                      ← Run 6: Deployment configuration
│   └── deployment.js
│
├── ecosystem/                   ← Run 7: Third-party module marketplace
│   ├── package-standard.js
│   ├── dependency-resolver.js
│   ├── sandbox.js               ← Isolated module execution (Worker + vm)
│   ├── registry.js
│   ├── revenue.js
│   └── install-engine.js
│
├── nocode/                      ← Run 8: No-code workflow automation
│   ├── workflow-schema.js       ← 20 node types, connection + workflow factories
│   ├── workflow-compiler.js     ← Topological sort, compilation
│   ├── workflow-engine.js       ← Execution engine, 8 action types
│   ├── workflow-registry.js     ← CRUD, versioning (10 snapshots), rollback
│   ├── workflow-scheduler.js    ← Time-based trigger driver
│   ├── workflow-templates.js    ← 4 built-in templates
│   ├── ai-workflow-advisor.js   ← AI suggestion engine (read-only)
│   └── rule-builder-ui.js       ← Canvas editor state model
│
├── agents/                      ← Run 9: Autonomous agent layer
│   ├── agent-core.js            ← Agent model, 6 types, goal engine, §13 safety gates
│   ├── metrics.js               ← System metrics collection
│   ├── self-optimise.js         ← Self-optimisation loop
│   ├── coordinator.js           ← Per-tenant pool map, multi-agent coordination
│   ├── recovery.js              ← Failure recovery, module isolation, rollback
│   ├── planner.js               ← Long-horizon planning, autopilot
│   └── agent-memory.js          ← 4-scope memory (global/tenant/module/session)
│
├── governance/                  ← Run 10: Enterprise governance layer
│   ├── governance-engine.js     ← Final authority — 5-check gate on every action
│   ├── audit.js                 ← Immutable append-only audit log + tamper detection
│   ├── autonomy-control.js      ← 4 autonomy modes (MANUAL → AUTONOMOUS)
│   ├── snapshot.js              ← Full system snapshots + rollback engine
│   ├── compliance.js            ← GDPR, data retention, tenant isolation enforcement
│   └── failure-prevention.js   ← Circuit breaker, runaway detection, failure response
│
└── modules/
    └── sleep.module.js          ← Example module (Run 3 module contract)
```

---

## Core Principles (from Run 0 Architecture Contract)

1. **Single Source of Truth** — all state lives in `storage.js`, no duplicates
2. **Event-First** — everything starts as an event; state changes only after event processing
3. **Storage Abstraction** — all storage through the adapter interface, never direct
4. **Module Isolation** — modules communicate only via events/actions, never direct writes
5. **AI Non-Destructive** — AI can suggest and analyse, never mutate state directly
6. **Rule Engine Authority** — rules evaluated before every action, blocking takes precedence
7. **UI Read-Only** — UI dispatches events and renders state, never mutates directly
8. **No Hard Coupling** — no direct storage calls, no cross-module writes, no hidden deps

---

## System Execution Flow

```
User / AI / Agent Action
        ↓
   Event System (Run 1)
        ↓
   Rule Engine (Run 2)
        ↓
  Action Engine (Run 2)
        ↓
 Governance Engine (Run 10)  ← 5-check gate: tenant, permission, billing, safety, autonomy
        ↓
   Audit Logging (Run 10)
        ↓
      Execution
        ↓
  State Update (Run 1)
        ↓
 AI Feedback Loop (Run 5/9)
```

---

## Autonomy Modes (Run 10)

| Mode | Agent Execution | AI Suggestions | Workflow Auto-run |
|------|----------------|----------------|-------------------|
| MANUAL | ✗ | ✗ | ✗ |
| ASSISTED | ✗ (suggest only) | ✓ | ✗ |
| AUTOMATED | ✓ (safe zone only) | ✓ | ✓ |
| AUTONOMOUS | ✓ (full, governed) | ✓ | ✓ |

Default mode for new tenants: **ASSISTED**

---

## Quick Start

```js
import {
  initSystem,
  dispatchEvent,
  governanceCheck,
  initAgentPool,
  createSnapshot
} from './bco/index.js';

// Boot the system
initSystem({ mode: 'LOCAL', tenantId: 'my-tenant' });

// Create a snapshot before changes
createSnapshot('my-tenant', 'manual');

// Initialise the agent pool for this tenant
const pool = initAgentPool('my-tenant');

// Dispatch an event through the full pipeline
dispatchEvent({
  type: 'USER_ACTION',
  source: 'user',
  module: 'CORE',
  payload: { action: 'something' }
});
```

---

## Safety Boundaries (§13 — immutable)

Agents and AI **can**: optimise performance, suggest improvements, execute low-risk tasks, rebalance load.

Agents and AI **cannot**: bypass the rule engine, override tenant isolation, mutate billing or permissions, execute destructive actions without explicit approval.

---

## Stats

- **Runs completed:** 10 of 10
- **JS files:** 59
- **Total files:** 61
- **Layers:** 13
- **Architecture contract:** Run 0 (immutable)
- **Lines of code:** ~11,000

---

*BCO Core — built by Kyzel Kreates*
