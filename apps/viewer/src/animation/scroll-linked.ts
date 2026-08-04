/**
 * @domio/viewer — Scroll-linked animation binding resolver.
 *
 * Resolves a scroll-Y position to an interpolated property value,
 * applying easing from @domio/easing with bucket-cached results.
 */

import { cubicBezier, linearEase } from '@domio/easing';

// ─── Types ──────────────────────────────────────────────────────

export type ScrollProperty = 'transform' | 'opacity' | 'translateY';

export interface ScrollBinding {
  readonly elementId: string;
  readonly property: ScrollProperty;
  /** Scroll-Y pixel value where progress starts (0). */
  readonly start: number;
  /** Scroll-Y pixel value where progress ends (1). */
  readonly end: number;
  /** Easing name: 'linear' | 'ease' | 'ease-in' | 'ease-out' | 'ease-in-out'. */
  readonly easing?: string;
}

export type ScrollProgressCache = Map<string, number | string>;

// ─── Constants ──────────────────────────────────────────────────

const MAX_CACHE_ENTRIES = 32;
const BUCKET_COUNT = 32;

// ─── Easing lookup ──────────────────────────────────────────────

const EASING_FNS: ReadonlyMap<string, (t: number) => number> = new Map([
  ['linear', linearEase],
  ['ease', cubicBezier(0.25, 0.1, 0.25, 1)],
  ['ease-in', cubicBezier(0.42, 0, 1, 1)],
  ['ease-out', cubicBezier(0, 0, 0.58, 1)],
  ['ease-in-out', cubicBezier(0.42, 0, 0.58, 1)],
]);

function resolveEasing(name: string | undefined): (t: number) => number {
  if (name === undefined) return linearEase;
  return EASING_FNS.get(name) ?? linearEase;
}

// ─── Errors ─────────────────────────────────────────────────────

export class ScrollLinkedError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'ScrollLinkedError';
    this.code = code;
  }
}

// ─── Public API ─────────────────────────────────────────────────

/**
 * Resolve a scroll binding to an interpolated value.
 *
 * @param binding  - The scroll-binding descriptor.
 * @param scrollY  - Current scroll-Y position in pixels.
 * @param progressCache - Mutable bucket cache (shared across calls).
 * @returns The interpolated value for the binding's property.
 *
 * @throws {ScrollLinkedError} CAP_EXCEEDED when cache exceeds 32 entries.
 * @throws {ScrollLinkedError} DEPENDENCY_CHAIN when same element has
 *   multiple scroll-linked properties in the cache.
 */
export function resolveScrollBinding(
  binding: ScrollBinding,
  scrollY: number,
  progressCache: ScrollProgressCache,
): number | string {
  const { elementId, property, start, end, easing } = binding;

  // ── Progress calculation ──────────────────────────────────────
  const range = end - start;
  const rawProgress = range === 0
    ? (scrollY >= start ? 1 : 0)
    : (scrollY - start) / range;
  const progress = Math.max(0, Math.min(1, rawProgress));

  // ── Bucket quantisation ──────────────────────────────────────
  const bucket = Math.min(Math.floor(progress * BUCKET_COUNT), BUCKET_COUNT);
  const cacheKey = `${elementId}:${property}:${bucket}`;

  // ── Dependency chain check ────────────────────────────────────
  for (const [key] of progressCache) {
    const parts = key.split(':');
    const cachedElementId = parts[0];
    const cachedProperty = parts[1];
    if (cachedElementId === elementId && cachedProperty !== property) {
      throw new ScrollLinkedError(
        'DEPENDENCY_CHAIN',
        `Dependency chain: element "${elementId}" already has scroll-linked property "${cachedProperty}" in cache`,
      );
    }
  }

  // ── Cache hit ─────────────────────────────────────────────────
  const cached = progressCache.get(cacheKey);
  if (cached !== undefined) {
    return cached;
  }

  // ── Cache cap check ──────────────────────────────────────────
  if (progressCache.size >= MAX_CACHE_ENTRIES) {
    throw new ScrollLinkedError(
      'CAP_EXCEEDED',
      `Scroll progress cache exceeded cap of ${MAX_CACHE_ENTRIES} entries`,
    );
  }

  // ── Easing & interpolation ───────────────────────────────────
  const easingFn = resolveEasing(easing);
  const easedProgress = easingFn(progress);

  // For opacity: interpolate 0→1 range
  // For transform/translateY: the caller gets the eased progress as a number
  const value: number | string = property === 'opacity'
    ? easedProgress
    : easedProgress;

  progressCache.set(cacheKey, value);
  return value;
}
