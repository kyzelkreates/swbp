// BCO — Top-level public API (Run 10 — COMPLETE)
// Single import surface for the entire system.

// ── Core engine (Runs 1–3) ───────────────────
export * from "./core/index.js";

// ── Brand engine (Run 4) ─────────────────────
export {
  getBrandConfig, setBrandConfig,
  applyBranding, applyFont, applyLayout
} from "./brand/brand-engine.js";

// ── Dashboard (Run 4) ────────────────────────
export {
  renderDashboard, getActiveModuleUI,
  getVisibleModules, mountDashboard,
  loadModuleView, initDashboard
} from "./ui/dashboard.js";

// ── Widgets (Run 4) ──────────────────────────
export {
  renderWidget, renderChart, renderList,
  renderTimeline, renderCard, renderAlertFeed,
  renderMap, WIDGET_TYPES
} from "./ui/widgets.js";

// ── Notifications (Run 4) ────────────────────
export {
  pushNotification, showToast,
  onNotification, markRead, getUnreadCount
} from "./ui/notifications.js";

// ── PWA (Run 4) ──────────────────────────────
export {
  initPWA, registerServiceWorker,
  enableOfflineCache, initPushNotifications,
  sendNativePush, syncStorageOnReconnect,
  handleQuickAction, QUICK_ACTIONS
} from "./pwa/pwa.js";

// ── AI Stats (Run 5) ─────────────────────────
export {
  mean, variance, stddev, median,
  linearSlope, trendLabel, pearsonCorrelation,
  analyseFrequency, forecastNextValue, assessConfidence
} from "./ai/stats.js";

// ── AI Pattern Detection (Run 5) ─────────────
export {
  detectPatterns, detectAnomalies,
  detectTrends, detectDeviationFromBaseline
} from "./ai/patterns.js";

// ── AI Risk Scoring (Run 5) ──────────────────
export { calculateRiskScore, severityBand } from "./ai/risk.js";

// ── AI Recommendations (Run 5) ───────────────
export {
  generateRecommendations, generateOptimisationPlan
} from "./ai/recommendations.js";

// ── AI Forecasting (Run 5) ───────────────────
export { forecastBehaviour } from "./ai/forecast.js";

// ── AI Cross-Module Analytics (Run 5) ────────
export {
  crossModuleAnalysis, analyseCrossCorrelation,
  calculateCorrelation
} from "./ai/cross-module.js";

// ── AI Insight Engine (Run 5) ────────────────
export {
  generateInsights, runFullAnalysis, insightFromEvent
} from "./ai/insight-engine.js";

// ── AI Panel UI (Run 5) ──────────────────────
export {
  renderAIPanel, updateAIPanelFromEvent
} from "./ui/ai-panel.js";

// ── Auth + Permissions (Run 6) ───────────────
export {
  ROLES, checkPermission, assertPermission,
  getPermissions, isAtLeast, higherRole,
  canAccessModule, canWriteModule,
  assertTenantMembership
} from "./auth/permissions.js";

// ── Tenant Core (Run 6) ──────────────────────
export {
  createTenant, getTenant, updateTenant,
  listTenants, suspendTenant, resolveTenant
} from "./saas/tenant.js";

// ── Tenant Storage (Run 6) ───────────────────
export {
  tenantStorage, getTenantKey, TENANT_KEYS
} from "./saas/tenant-storage.js";

// ── Billing (Run 6) ──────────────────────────
export {
  PLANS, calculateBilling,
  createSubscription, upgradeSubscription,
  cancelSubscription, getSubscription,
  assertPlanFeature, assertUserLimit,
  processPayment
} from "./saas/billing.js";

// ── Marketplace — first-party (Run 6) ────────
export {
  MARKETPLACE_CATALOGUE, listAvailableModules,
  installModule, uninstallModule, getInstalledModules
} from "./saas/marketplace.js";

// ── Usage Tracking (Run 6) ───────────────────
export {
  trackUsage, getUsage, getUsageSummary,
  assertRateLimit, USAGE_CATEGORIES
} from "./saas/usage.js";

// ── Deployment (Run 6) ───────────────────────
export {
  DEPLOY_MODES, STORAGE_BACKENDS,
  getDeploymentMode, setDeploymentConfig,
  isFeatureEnabled, bootstrapStorageAdapter
} from "./deploy/deployment.js";

// ── Request Pipeline (Run 6) ─────────────────
export { handleTenantRequest, initSaaS } from "./saas/request-pipeline.js";

// ── Ecosystem: Package Standard (Run 7) ──────
export {
  SANDBOX_LEVELS, MODULE_PERMISSIONS,
  validateModulePackage,
  parseSemver, isCompatible, compareVersions
} from "./ecosystem/package-standard.js";

// ── Ecosystem: Dependency Resolver (Run 7) ───
export {
  resolveDependencies, assertDependenciesResolved
} from "./ecosystem/dependency-resolver.js";

// ── Ecosystem: Sandbox (Run 7 + hardening) ───
export {
  runModule, executeInSandbox,
  executeWithLimits, executeDirect
} from "./ecosystem/sandbox.js";

// ── Ecosystem: Registry (Run 7) ──────────────
export {
  publishModule, discoverModules,
  getModule, getModuleByName, getAllApproved,
  rateModule, recordInstall,
  approveModule, rejectModule
} from "./ecosystem/registry.js";

// ── Ecosystem: Revenue (Run 7) ───────────────
export {
  REVENUE_CONFIG, LICENSE_TYPES,
  calculateRevenue, recordRevenueEvent,
  getDeveloperEarnings, getPlatformRevenueSummary,
  calculateEnterpriseLicense, processPayoutBatch
} from "./ecosystem/revenue.js";

// ── Ecosystem: Install Engine (Run 7) ────────
export {
  installMarketplaceModule,
  uninstallMarketplaceModule
} from "./ecosystem/install-engine.js";

// ── No-Code: Workflow Schema (Run 8) ─────────
export {
  NODE_TYPES, NODE_CATEGORIES,
  createNode, createConnection, createWorkflow,
  validateWorkflow
} from "./nocode/workflow-schema.js";

// ── No-Code: Compiler (Run 8) ────────────────
export {
  buildWorkflow, compileWorkflow
} from "./nocode/workflow-compiler.js";

// ── No-Code: Execution Engine (Run 8) ────────
export {
  executeWorkflow, evaluateTrigger, evaluateBranch
} from "./nocode/workflow-engine.js";

// ── No-Code: Registry (Run 8) ────────────────
export {
  saveWorkflow, getWorkflow, listWorkflows,
  deleteWorkflow, activateWorkflow, deactivateWorkflow,
  rollbackWorkflow, getActiveWorkflows
} from "./nocode/workflow-registry.js";

// ── No-Code: Templates (Run 8) ───────────────
export {
  loadTemplate, listTemplates
} from "./nocode/workflow-templates.js";

// ── No-Code: AI Advisor (Run 8) ──────────────
export {
  aiSuggestWorkflow, aiMatchWorkflowToEvent
} from "./nocode/ai-workflow-advisor.js";

// ── No-Code: Rule Builder UI (Run 8) ─────────
export {
  createEditorState, renderRuleBuilder,
  canvasActions, saveEditorState,
  activateEditorWorkflow
} from "./nocode/rule-builder-ui.js";

// ── No-Code: Scheduler (Run 8 patch) ─────────
export {
  startScheduler, stopScheduler, reschedule
} from "./nocode/workflow-scheduler.js";

// ── Agents: Core (Run 9) ─────────────────────
export {
  AGENT_TYPES, AGENT_STATUS, GOAL_STATUS, PRIORITY,
  AGENT_CAPABILITIES, AGENT_FORBIDDEN,
  createAgent, registerAgent, getAgent,
  listAgents, deregisterAgent,
  assignGoal, executeGoals
} from "./agents/agent-core.js";

// ── Agents: Metrics (Run 9) ──────────────────
export {
  collectSystemMetrics,
  measureLatency, measureErrors,
  measureModulePerformance, measureEventQueue, measureMemory,
  evaluateThresholds, isImbalanced, METRIC_THRESHOLDS
} from "./agents/metrics.js";

// ── Agents: Self-Optimisation (Run 9) ────────
export {
  selfOptimise, detectInefficiencies,
  generateOptimisationFix, applyFix,
  INEFFICIENCY_TYPES
} from "./agents/self-optimise.js";

// ── Agents: Coordinator (Run 9, fixed Run 10) ─
export {
  initAgentPool, getAgentPool, getAgentByType,
  destroyAgentPool, listAllPools,
  coordinateAgents, splitTaskIntoSubtasks,
  runAssignedGoals
} from "./agents/coordinator.js";

// ── Agents: Recovery (Run 9) ─────────────────
export {
  handleAnomaly, recoveryMode,
  isolateFaultyModule, restoreModule,
  rollbackLastSafeState, notifySystemAdmin
} from "./agents/recovery.js";

// ── Agents: Planner (Run 9) ──────────────────
export {
  generateLongTermPlan, calculateConfidence,
  generatePlan, systemAutopilot, PLAN_PHASES
} from "./agents/planner.js";

// ── Agents: Memory (Run 9) ───────────────────
export {
  createAgentMemory, getMemorySnapshot,
  clearAgentMemory, MEMORY_SCOPES
} from "./agents/agent-memory.js";

// ── Governance: Engine (Run 10) ──────────────
export {
  governanceCheck, assertGovernance
} from "./governance/governance-engine.js";

// ── Governance: Audit (Run 10) ───────────────
export {
  auditLog, getAuditLog, getAuditEntry,
  auditStats, purgeAuditEntriesForUser,
  purgeAuditEntriesOlderThan, verifyAuditIntegrity
} from "./governance/audit.js";

// ── Governance: Autonomy Control (Run 10) ────
export {
  AUTONOMY_MODES, DEFAULT_AUTONOMY_MODE,
  MODE_CAPABILITIES,
  getAutonomyMode, setAutonomyMode,
  getModeCapabilities, canAgentsExecute,
  canWorkflowsAutoRun
} from "./governance/autonomy-control.js";

// ── Governance: Snapshot (Run 10) ────────────
export {
  createSnapshot, listSnapshots,
  getSnapshot, getLatestSnapshot,
  rollbackToSnapshot
} from "./governance/snapshot.js";

// ── Governance: Compliance (Run 10) ──────────
export {
  DEFAULT_POLICY, getCompliancePolicy, setCompliancePolicy,
  checkTenantIsolation, checkAccessControl,
  checkAuditRequirement, enforceDataRetention,
  erasureRequest, generateComplianceReport
} from "./governance/compliance.js";

// ── Governance: Failure Prevention (Run 10) ──
export {
  FAILURE_THRESHOLDS,
  detectActionFlood, detectRunawayAgent,
  detectInfiniteLoop, detectRuleConflict,
  detectSystemInstability,
  handleFailure, circuitBreaker,
  isAgentFrozen, unfreezeAgent
} from "./governance/failure-prevention.js";
