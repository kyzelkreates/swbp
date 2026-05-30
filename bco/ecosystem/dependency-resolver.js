// BCO Ecosystem — Dependency Resolution Engine (Run 7)
// Resolves the full dependency graph for a module before installation.
// Detects missing deps, version conflicts, and circular dependency chains.
// Pure logic — no installs happen here. Output goes to the install engine.

import { isCompatible, parseSemver } from "./package-standard.js";

// ─────────────────────────────────────────────
// DEPENDENCY RESOLVER
// ─────────────────────────────────────────────

/**
 * resolveDependencies(module, catalogue)
 * Recursively resolves all dependencies for a module.
 *
 * @param {BCOPackage}    module    — the module being installed
 * @param {BCOPackage[]}  catalogue — the full marketplace catalogue
 * @param {Set}           _visited  — internal cycle detection set
 * @returns {{ resolved: BCOPackage[], order: string[], missing: string[], conflicts: object[] }}
 */
export function resolveDependencies(module, catalogue, _visited = new Set()) {
  const resolved  = [];
  const missing   = [];
  const conflicts = [];

  if (_visited.has(module.id)) {
    throw new Error(
      `[BCO Deps] Circular dependency detected involving "${module.name}" (${module.id}).`
    );
  }

  _visited.add(module.id);

  for (const dep of (module.dependencies || [])) {
    const candidates = catalogue.filter((m) => m.name === dep.name);

    if (candidates.length === 0) {
      missing.push({ name: dep.name, requiredBy: module.name, requiredVersion: dep.version });
      continue;
    }

    // Find highest compatible version
    const compatible = candidates
      .filter((m) => !dep.version || isCompatible(m.version, dep.version))
      .sort((a, b) => _versionSort(b.version, a.version)); // newest first

    if (compatible.length === 0) {
      conflicts.push({
        dep:          dep.name,
        requiredBy:   module.name,
        required:     dep.version,
        available:    candidates.map((m) => m.version)
      });
      continue;
    }

    const best = compatible[0];

    // Recurse into the dependency's own deps
    const sub = resolveDependencies(best, catalogue, new Set(_visited));
    missing.push(...sub.missing);
    conflicts.push(...sub.conflicts);
    resolved.push(...sub.resolved, best);
  }

  // Deduplicate by id (keep highest version if same name appears multiple times)
  const deduped = _deduplicateByName(resolved);

  const order = _topologicalOrder(module, deduped);

  return { resolved: deduped, order, missing, conflicts };
}

/**
 * assertDependenciesResolved(result)
 * Throws a clear error if anything is missing or conflicting.
 */
export function assertDependenciesResolved(result) {
  const problems = [];

  if (result.missing.length > 0) {
    result.missing.forEach((m) =>
      problems.push(`Missing: "${m.name}"@${m.requiredVersion || "any"} (required by "${m.requiredBy}")`)
    );
  }

  if (result.conflicts.length > 0) {
    result.conflicts.forEach((c) =>
      problems.push(
        `Version conflict: "${c.dep}" requires ${c.required}, available: [${c.available.join(", ")}]`
      )
    );
  }

  if (problems.length > 0) {
    throw new Error(`[BCO Deps] Dependency resolution failed:\n  • ${problems.join("\n  • ")}`);
  }
}

// ─────────────────────────────────────────────
// TOPOLOGICAL ORDER
// ─────────────────────────────────────────────

/**
 * _topologicalOrder(root, deps)
 * Returns module names in install order: deepest dependencies first.
 */
function _topologicalOrder(root, deps) {
  // Deps are already recursively resolved bottom-up; just extract names + append root
  return [...deps.map((d) => d.name), root.name];
}

// ─────────────────────────────────────────────
// INTERNAL HELPERS
// ─────────────────────────────────────────────

function _versionSort(a, b) {
  const pa = parseSemver(a), pb = parseSemver(b);
  if (!pa || !pb) return 0;
  if (pa.major !== pb.major) return pb.major - pa.major;
  if (pa.minor !== pb.minor) return pb.minor - pa.minor;
  return pb.patch - pa.patch;
}

function _deduplicateByName(modules) {
  const seen = new Map();
  modules.forEach((m) => {
    const existing = seen.get(m.name);
    if (!existing || _versionSort(m.version, existing.version) > 0) {
      seen.set(m.name, m);
    }
  });
  return [...seen.values()];
}
