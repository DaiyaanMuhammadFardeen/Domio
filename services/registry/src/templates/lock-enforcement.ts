/**
 * Brand-lock enforcement — validates that a proposed deck mutation does not
 * violate any active BrandLockRegion for the target deck.
 *
 * Three strictness levels:
 *  - `strict`: block unless the operation is in `lock.allowedOverrides`.
 *  - `color-only`: block recolor unless actorId === lock.ownerUserId (owner
 *    bypass); text content changes are allowed for anyone.
 *  - `text-only`: block any non-text edit unless actorId === lock.ownerUserId.
 */

import type { ServiceDeps } from '../deps.js';
import type { BrandLockRegion } from '../store/types.js';

// ---------------------------------------------------------------------------
// Operation classification
// ---------------------------------------------------------------------------

export type MutationOp =
  | 'color'
  | 'text'
  | 'layout'
  | 'image'
  | 'component'
  | 'delete'
  | 'rename'
  | string;

/** Returns whether the op is a text-content mutation. */
function isTextOp(op: MutationOp): boolean {
  return op === 'text';
}

/** Returns whether the op is a color/style mutation. */
function isColorOp(op: MutationOp): boolean {
  return op === 'color';
}

// ---------------------------------------------------------------------------
// Scene-graph selector matching (simplified)
// ---------------------------------------------------------------------------

/**
 * A simplified scene-graph selector evaluator.  Supports dot-separated paths
 * and wildcard `*` for any single segment.  Within brackets, `*` matches any
 * index/name.  The selector is matched against the element's semantic address.
 *
 * Examples:
 *  - `slide[0].text[title]`  — exact match
 *  - `slide[*].text[*]`      — any text element on any slide
 *  - `slide[0]`              — matches the slide itself
 */
function matchesSelector(
  semanticId: string | undefined,
  selector: string,
): boolean {
  if (!semanticId) return false;

  const selectorParts = selector.split('.');
  const targetParts = semanticId.split('.');

  if (selectorParts.length !== targetParts.length) return false;

  for (let i = 0; i < selectorParts.length; i++) {
    const sp = selectorParts[i]!;
    const tp = targetParts[i]!;
    if (segmentMatches(sp, tp)) continue;
    return false;
  }
  return true;
}

/**
 * Check if a selector segment matches a target segment.
 * Supports full-segment wildcard `*` and bracket-level wildcard `name[*]`.
 */
function segmentMatches(selector: string, target: string): boolean {
  if (selector === '*') return true;

  // Check for bracket wildcard: e.g. "slide[*]" matches "slide[0]"
  const selBracket = selector.match(/^(.+)\[(\*)\]$/);
  const tgtBracket = target.match(/^(.+)\[(.+)\]$/);
  if (selBracket && tgtBracket) {
    // The prefix (before brackets) must match
    return selBracket[1] === tgtBracket[1];
  }

  return selector === target;
}

// ---------------------------------------------------------------------------
// Enforcement
// ---------------------------------------------------------------------------

export interface EnforceInput {
  deckId: string;
  actorId: string;
  /** Semantic addresses of elements being mutated. */
  targets: string[];
  /** The type of mutation being attempted. */
  operation: MutationOp;
}

export interface EnforceResult {
  allowed: boolean;
  /** The lock that blocked the operation (if any). */
  blockedBy?: BrandLockRegion;
  reason?: string;
}

/**
 * Check a proposed mutation against all brand locks for the given deck.
 * Returns `{ allowed: true }` when no lock blocks the operation, or
 * `{ allowed: false, blockedBy, reason }` when a lock vetoes it.
 */
export async function enforceBrandLock(
  deps: ServiceDeps,
  input: EnforceInput,
): Promise<EnforceResult> {
  const locks = await deps.store.listBrandLocks(input.deckId);

  for (const lock of locks) {
    const targetsMatch = input.targets.some((t) =>
      matchesSelector(t, lock.sceneGraphSelector),
    );
    if (!targetsMatch) continue;

    const verdict = evaluateLock(lock, input.operation, input.actorId);
    if (!verdict.allowed) {
      return verdict;
    }
  }

  return { allowed: true };
}

/**
 * Evaluate a single lock against a proposed operation.
 */
function evaluateLock(
  lock: BrandLockRegion,
  operation: MutationOp,
  actorId: string,
): EnforceResult {
  const ownerBypass = actorId === lock.ownerUserId;

  // Owner bypass: the lock owner can always modify their own locked regions.
  if (ownerBypass) {
    return { allowed: true };
  }

  switch (lock.strictness) {
    case 'strict': {
      if (lock.allowedOverrides.includes(operation)) {
        return { allowed: true };
      }
      return {
        allowed: false,
        blockedBy: lock,
        reason: `Operation "${operation}" is not in the allowed overrides for this brand lock`,
      };
    }

    case 'color-only': {
      if (isTextOp(operation)) {
        return { allowed: true };
      }
      if (isColorOp(operation)) {
        return {
          allowed: false,
          blockedBy: lock,
          reason: 'Color changes are restricted to the lock owner',
        };
      }
      // All other ops are blocked.
      return {
        allowed: false,
        blockedBy: lock,
        reason: `Operation "${operation}" is not permitted under color-only brand lock`,
      };
    }

    case 'text-only': {
      if (isTextOp(operation)) {
        return { allowed: true };
      }
      return {
        allowed: false,
        blockedBy: lock,
        reason: `Operation "${operation}" is not permitted under text-only brand lock`,
      };
    }

    default: {
      // Unknown strictness — deny by default.
      return {
        allowed: false,
        blockedBy: lock,
        reason: `Unknown strictness "${(lock as BrandLockRegion).strictness}"`,
      };
    }
  }
}
