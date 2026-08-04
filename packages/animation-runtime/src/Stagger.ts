/**
 * @domio/animation-runtime — Stagger utility.
 *
 * Reorders startOffsetMs for a set of timelines based on direction.
 * Never changes z-order.
 */

import type { Timeline } from './types.js';

export type StaggerDirection = 'forward' | 'reverse' | 'center-out' | 'random';

export interface StaggerOptions {
  readonly direction: StaggerDirection;
  readonly intervalMs: number;
  /** Seed for deterministic random. */
  readonly seed?: number;
}

/** Simple seeded PRNG (mulberry32). */
function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Apply stagger to an array of timelines.
 *
 * Returns a new array of { timeline, startOffsetMs } objects with
 * reordered offsets. The original timeline objects are NOT mutated.
 *
 * Single-element arrays are returned as-is (no-op).
 */
export function applyStagger(
  timelines: readonly Timeline[],
  options: StaggerOptions,
): Array<{ timeline: Timeline; startOffsetMs: number }> {
  // Single element — no-op
  if (timelines.length <= 1) {
    return timelines.map((t) => ({ timeline: t, startOffsetMs: t.startOffsetMs }));
  }

  const { direction, intervalMs, seed } = options;

  // Build index array for reordering
  const indices = timelines.map((_, i) => i);

  switch (direction) {
    case 'forward':
      // Already in order — just apply offsets
      break;

    case 'reverse':
      indices.reverse();
      break;

    case 'center-out': {
      // Sort by distance from center
      const center = (timelines.length - 1) / 2;
      indices.sort((a, b) => {
        const distA = Math.abs(a - center);
        const distB = Math.abs(b - center);
        return distA - distB;
      });
      break;
    }

    case 'random': {
      // Seeded shuffle (Fisher-Yates)
      const rng = mulberry32(seed ?? 42);
      for (let i = indices.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        const temp = indices[i] as number;
        indices[i] = indices[j] as number;
        indices[j] = temp;
      }
      break;
    }
  }

  // Assign staggered offsets in the reordered sequence
  return indices.map((originalIndex, staggerIndex) => ({
    timeline: timelines[originalIndex] as Timeline,
    startOffsetMs: staggerIndex * intervalMs,
  }));
}
