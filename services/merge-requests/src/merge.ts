/**
 * Merge strategies (Phase 18 W2).
 *
 * isFastForward: determines if a merge can fast-forward.
 */

export { isFastForward } from './diff.js';

/**
 * Check if all conflicts have been resolved.
 */
export function allConflictsResolved(
  conflictingSlideIds: string[],
  resolutions: Array<{ slide_id: string }>,
): boolean {
  const resolvedIds = new Set(resolutions.map((r) => r.slide_id));
  return conflictingSlideIds.every((id) => resolvedIds.has(id));
}
