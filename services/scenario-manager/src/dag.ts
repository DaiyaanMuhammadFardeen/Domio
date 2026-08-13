/**
 * Scenario DAG — cycle detection, depth cap, ancestor/descendant traversal.
 *
 * The scenario tree is a DAG rooted at parentless scenarios (parentId ===
 * null).  Each scenario belongs to exactly one deck.  A child must reside
 * in the same deck as its parent.
 *
 * Constraints enforced:
 *   - MAX_DEPTH = 8  (root = depth 1)
 *   - No cycles: setting parentId to X is rejected when X is a descendant
 *     of the scenario being reparented.
 */

import type { ScenarioRecord } from './dal.js';

export const MAX_DEPTH = 8;

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class ScenarioCycleError extends Error {
  readonly code = 'SCENARIO_CYCLE' as const;
  constructor(public readonly cyclePath: readonly string[]) {
    super(`Scenario cycle detected: ${cyclePath.join(' → ')}`);
    this.name = 'ScenarioCycleError';
  }
}

export class ScenarioDepthExceededError extends Error {
  readonly code = 'SCENARIO_DEPTH_EXCEEDED' as const;
  constructor(
    public readonly scenarioId: string,
    public readonly depth: number,
    public readonly maxDepth: number,
  ) {
    super(`Scenario ${scenarioId} would reach depth ${depth}, exceeding max of ${maxDepth}`);
    this.name = 'ScenarioDepthExceededError';
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a child→parent lookup from a list of scenarios.
 */
function buildParentMap(scenarios: readonly ScenarioRecord[]): Map<string, string | null> {
  const map = new Map<string, string | null>();
  for (const s of scenarios) {
    map.set(s.id, s.parentId);
  }
  return map;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Validate that setting `scenario.parentId = parentId` is safe.
 *
 * Rejects if:
 *   1. It creates a cycle (reports the reachable path, e.g. A→B→A).
 *   2. It would push the scenario below the max depth cap (8 levels).
 *
 * @param scenario  The scenario being reparented.
 * @param parentId  The proposed new parent (null to make root).
 * @param allScenarios  All scenarios in the deck (needed for traversal).
 */
export function validateParent(
  scenario: ScenarioRecord,
  parentId: string | null,
  allScenarios: readonly ScenarioRecord[],
): void {
  // Null parent is always valid (making it a root).
  if (parentId === null) return;

  // Cannot be your own parent.
  if (parentId === scenario.id) {
    throw new ScenarioCycleError([scenario.id, scenario.id]);
  }

  const parentMap = buildParentMap(allScenarios);

  // Temporarily graft the new edge: scenario → parentId.
  // Check for cycles by walking from parentId upward.  If we reach
  // `scenario.id`, there's a cycle.
  const path: string[] = [parentId];
  const visited = new Set<string>([scenario.id]);
  let current = parentId;
  while (true) {
    if (visited.has(current)) {
      // We've revisited scenario.id → cycle.
      // Close the loop by appending the starting point (parentId).
      path.push(parentId);
      throw new ScenarioCycleError(path);
    }
    visited.add(current);
    const p = parentMap.get(current);
    if (p === undefined || p === null) break;
    path.push(p);
    current = p;
  }

  // Check depth.  Walk from scenario up through the proposed chain to
  // count how deep it would sit.
  let depth = 0;
  let node: string | null = scenario.id;
  const depthVisited = new Set<string>();
  while (node !== null) {
    if (depthVisited.has(node)) {
      // Defensive — should be caught by cycle check above, but guard.
      throw new ScenarioCycleError([node, node]);
    }
    depthVisited.add(node);
    depth++;
    if (node === scenario.id) {
      node = parentId;
    } else {
      node = parentMap.get(node) ?? null;
    }
  }

  if (depth > MAX_DEPTH) {
    throw new ScenarioDepthExceededError(scenario.id, depth, MAX_DEPTH);
  }
}

/**
 * Return the ancestor chain from `id` up to the root (inclusive of id).
 * The first element is `id`, the last is the root.
 */
export function ancestors(id: string, allScenarios: readonly ScenarioRecord[]): readonly string[] {
  const parentMap = buildParentMap(allScenarios);
  const chain: string[] = [id];
  let current = id;
  const visited = new Set<string>();
  while (true) {
    if (visited.has(current)) break; // defensive cycle guard
    visited.add(current);
    const parentId = parentMap.get(current);
    if (parentId === undefined || parentId === null) break;
    chain.push(parentId);
    current = parentId;
  }
  return chain;
}

/**
 * Return the descendants of `id` in BFS order (children before
 * grandchildren).  Does NOT include `id` itself.
 */
export function descendants(
  id: string,
  allScenarios: readonly ScenarioRecord[],
): readonly string[] {
  const childMap = new Map<string, string[]>();
  for (const s of allScenarios) {
    if (s.parentId !== null) {
      const siblings = childMap.get(s.parentId) ?? [];
      siblings.push(s.id);
      childMap.set(s.parentId, siblings);
    }
  }

  const result: string[] = [];
  const queue = [...(childMap.get(id) ?? [])];
  const visited = new Set<string>();
  while (queue.length > 0) {
    const next = queue.shift()!;
    if (visited.has(next)) continue;
    visited.add(next);
    result.push(next);
    const children = childMap.get(next) ?? [];
    queue.push(...children);
  }
  return result;
}
