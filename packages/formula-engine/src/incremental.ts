/**
 * Incremental recomputation: dirty propagation for dependency-ordered recompute.
 */

import type { FormulaDependencyGraph } from './dag.js';
import type { Value } from './functions.js';

/**
 * Given a dependency graph, a set of changed fields, and an evaluate function,
 * return the ordered list of field ids that must be recomputed.
 *
 * The entry fields themselves are included, plus any downstream dependents.
 * Fields not downstream of any changed field are untouched.
 */
export function incrementalRecompute(
  graph: FormulaDependencyGraph,
  changedFieldIds: string[],
  _evaluateField?: (id: string) => Value
): string[] {
  // Collect all downstream dependents of changed fields
  const dirty = new Set<string>(changedFieldIds);
  const queue = [...changedFieldIds];

  while (queue.length > 0) {
    const current = queue.shift()!;
    const dependents = graph.getDependents(current);
    for (const dep of dependents) {
      if (!dirty.has(dep)) {
        dirty.add(dep);
        queue.push(dep);
      }
    }
  }

  // Sort dirty fields in dependency order
  const allFields = graph.topologicalOrder();
  return allFields.filter((f) => dirty.has(f));
}
