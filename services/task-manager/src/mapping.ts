/**
 * Pure field-mapping logic for task links (Phase 18 #191).
 *
 * FIELD_MAP_KEYS defines the allowed keys in a field map.
 * - validateFieldMap: rejects unknown keys and non-string values.
 * - applyFieldMap: declarative mapping transformer.
 * - describeMapping: human-readable description.
 */

import type { FieldMap, FieldMapValue } from './types.js';
import { ValidationError } from './types.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const FIELD_MAP_KEYS = ['status', 'priority', 'assignee', 'due_date', 'title'] as const;

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Validate a field map: only allowed keys, values must be string or
 * {from, to} tuples.
 * Throws ValidationError on invalid input.
 */
export function validateFieldMap(fieldMap: FieldMap): void {
  const allowed = new Set<string>(FIELD_MAP_KEYS);
  for (const [key, value] of Object.entries(fieldMap)) {
    if (!allowed.has(key)) {
      throw new ValidationError(`Unknown field map key: ${key}`, 'INVALID_FIELD_MAP');
    }
    if (typeof value === 'object' && value !== null) {
      const v = value as FieldMapValue;
      if (typeof v.from !== 'string' || typeof v.to !== 'string') {
        throw new ValidationError(
          `Field map key "${key}" must have string "from" and "to" fields`,
          'INVALID_FIELD_MAP',
        );
      }
    } else if (typeof value !== 'string') {
      throw new ValidationError(
        `Field map key "${key}" must be a string or {from, to} tuple`,
        'INVALID_FIELD_MAP',
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Apply
// ---------------------------------------------------------------------------

/**
 * Apply a declarative field map transformer.
 * For each key in fieldMap:
 *  - If value is a string → copy sourceState[value] to targetState[key].
 *  - If value is {from, to} → copy sourceState[from] to targetState[to].
 * Returns a new merged state (does not mutate inputs).
 */
export function applyFieldMap(
  fieldMap: FieldMap,
  sourceState: Record<string, string>,
  targetState: Record<string, string>,
): Record<string, string> {
  const merged = { ...targetState };
  for (const [targetKey, mapping] of Object.entries(fieldMap)) {
    if (typeof mapping === 'string') {
      const sourceValue = sourceState[mapping];
      if (sourceValue !== undefined) {
        merged[targetKey] = sourceValue;
      }
    } else {
      // {from, to} tuple
      const sourceValue = sourceState[mapping.from];
      if (sourceValue !== undefined) {
        merged[mapping.to] = sourceValue;
      }
    }
  }
  return merged;
}

// ---------------------------------------------------------------------------
// Describe
// ---------------------------------------------------------------------------

/**
 * Return a human-readable list of mapping entries.
 * e.g. ["status → status (from 'status')", "priority → severity (from 'priority' via rename)"]
 */
export function describeMapping(fieldMap: FieldMap): string[] {
  const descriptions: string[] = [];
  for (const [targetKey, mapping] of Object.entries(fieldMap)) {
    if (typeof mapping === 'string') {
      descriptions.push(`${targetKey} ← source.${mapping}`);
    } else {
      descriptions.push(`${targetKey} ← source.${mapping.from} (renamed to ${mapping.to})`);
    }
  }
  return descriptions;
}
