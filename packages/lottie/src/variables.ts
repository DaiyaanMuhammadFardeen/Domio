/**
 * Lottie variable scrubbing.
 *
 * A Lottie JSON may reference named expression/variables. Given a variable
 * name → value map, return the set of animated properties to override.
 *
 * Convention: any property whose *value* (at any nesting depth) is a string
 * matching the pattern `${varName}` is considered a variable reference.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A concrete override entry for a single property path. */
export interface VariableOverride {
  /** Dot-delimited path to the property in the Lottie JSON tree. */
  path: string;
  /** The variable name (the bare name, e.g. "$progress"). */
  variableName: string;
  /** The replacement value to inject. */
  value: number | string | boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Recursively walk a JSON tree and collect every string value that matches
 * the pattern `${varName}` (where varName is one of the supplied variable
 * names).
 */
function collectRefs(
  node: unknown,
  path: string[],
  variableNames: string[],
  result: VariableOverride[],
): void {
  if (node === null || node === undefined) return;

  if (typeof node === 'string') {
    // Match pattern: exactly "${varName}" (no extra text)
    const match = node.match(/^\$\{(.+)\}$/);
    if (match) {
      const varName = match[1]!;
      if (variableNames.includes(varName)) {
        result.push({
          path: path.join('.'),
          variableName: varName,
          value: node, // caller will replace with concrete value
        });
      }
    }
    return;
  }

  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i++) {
      collectRefs(node[i], [...path, String(i)], variableNames, result);
    }
    return;
  }

  if (typeof node === 'object') {
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      collectRefs(value, [...path, key], variableNames, result);
    }
  }
}

/**
 * Recursively set a value at a dot-delimited path inside a mutable tree.
 */
function setAtPath(root: Record<string, unknown>, dotPath: string, value: unknown): void {
  const parts = dotPath.split('.');
  let current: Record<string, unknown> = root;

  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i]!;
    const next = current[key];
    if (next === null || typeof next !== 'object') {
      current[key] = {};
      current = current[key] as Record<string, unknown>;
    } else {
      current = next as Record<string, unknown>;
    }
  }

  current[parts[parts.length - 1]!] = value;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Given a (mutable) Lottie JSON object and a variable name → value map,
 * return the list of overrides that **would** be applied, and apply them
 * in-place.
 *
 * A variable is any string value in the Lottie tree matching the pattern
 * `${varName}`. The variable map keys are matched **without** the `${…}`
 * wrapper.
 *
 * @param lottieJson  The parsed Lottie JSON object (will be mutated).
 * @param variables   Map of variable names (without `${}`) to replacement values.
 * @returns           The list of overrides that were applied.
 */
export function applyVariables(
  lottieJson: Record<string, unknown>,
  variables: Map<string, number | string | boolean>,
): VariableOverride[] {
  const varNames = Array.from(variables.keys());
  const overrides: VariableOverride[] = [];

  // Phase 1: discover all references
  collectRefs(lottieJson, [], varNames, overrides);

  // Phase 2: apply overrides
  for (const override of overrides) {
    const val = variables.get(override.variableName);
    if (val !== undefined) {
      override.value = val;
      setAtPath(lottieJson, override.path, val);
    }
  }

  return overrides;
}

/**
 * Discover variable references in a Lottie JSON without modifying it.
 */
export function findVariableRefs(
  lottieJson: Record<string, unknown>,
  variableNames: string[],
): VariableOverride[] {
  const refs: VariableOverride[] = [];
  collectRefs(lottieJson, [], variableNames, refs);
  return refs;
}
