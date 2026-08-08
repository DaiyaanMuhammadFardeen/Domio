/**
 * Semantic conflict detection (Phase 18 #182).
 *
 * Pure functions for detecting conflicts between suggestions.
 * Same target_id + same property path + different after_state → conflict.
 * Move vs resize on same element → conflict.
 */

import type { SuggestionOperation } from '../types.js';

// ---------------------------------------------------------------------------
// Conflict detection
// ---------------------------------------------------------------------------

/**
 * Two operations conflict if:
 * 1. Same target_id AND same op type AND same property path AND different after_state values.
 * 2. Move vs resize on the same element (regardless of property paths).
 */
export function detectOpConflict(opA: SuggestionOperation, opB: SuggestionOperation): boolean {
  // Case 1: move vs resize on same element always conflicts
  if (
    (opA.type === 'move' && opB.type === 'resize') ||
    (opA.type === 'resize' && opB.type === 'move')
  ) {
    // They conflict if they share any property key in after_state
    return hasCommonKey(opA.after_state, opB.after_state);
  }

  // Case 2: Same type, same property path, different after_state
  if (opA.type === opB.type) {
    const commonKeys = getCommonKeys(opA.after_state, opB.after_state);
    if (commonKeys.length === 0) return false;
    // Check if any common key has a different value
    for (const key of commonKeys) {
      const valA = JSON.stringify(opA.after_state[key]);
      const valB = JSON.stringify(opB.after_state[key]);
      if (valA !== valB) return true;
    }
  }

  return false;
}

/**
 * Given an accepted op, return IDs of suggestions that became semantically
 * conflicting with it.
 */
export function markConflictingObsolete(
  acceptedOp: SuggestionOperation,
  otherSuggestions: ReadonlyArray<{ id: string; operation: SuggestionOperation }>,
): string[] {
  const obsoleteIds: string[] = [];
  for (const other of otherSuggestions) {
    if (detectOpConflict(acceptedOp, other.operation)) {
      obsoleteIds.push(other.id);
    }
  }
  return obsoleteIds;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getCommonKeys(a: Record<string, unknown>, b: Record<string, unknown>): string[] {
  const keys: string[] = [];
  for (const key of Object.keys(a)) {
    if (key in b) keys.push(key);
  }
  return keys;
}

function hasCommonKey(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  for (const key of Object.keys(a)) {
    if (key in b) return true;
  }
  return false;
}
