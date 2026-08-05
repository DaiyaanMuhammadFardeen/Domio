/**
 * Broadphase collider-count guard.
 *
 * When a scene contains more than 10 000 colliders, rapier's broadphase
 * begins to show measurable overhead that can push frame times above the
 * 16 ms / 60 fps budget.  This module emits a warning so the runtime
 * (or the editor UI) can surface it to the user.
 *
 * Under 10 000 colliders, no warning is emitted.
 */

import type { BroadphaseWarning } from './types.js';

/** Default collider-count threshold above which broadphase overhead is flagged. */
export const BROADPHASE_WARNING_THRESHOLD = 10_000;

/**
 * Check whether a collider count exceeds the broadphase warning threshold.
 *
 * @param colliderCount - current total number of colliders in the scene
 * @returns a BroadphaseWarning if the threshold is exceeded, null otherwise
 */
export function checkBroadphase(
  colliderCount: number,
  threshold: number = BROADPHASE_WARNING_THRESHOLD,
): BroadphaseWarning | null {
  if (colliderCount > threshold) {
    return {
      message: 'Broadphase overhead may slow 60fps target',
      colliderCount,
    };
  }
  return null;
}
