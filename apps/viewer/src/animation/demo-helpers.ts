/**
 * @domio/viewer — Pure helpers for the Phase-09 animation demo.
 *
 * Extracted for testability: the demo page composes these with
 * the viewer animation modules (scroll-linked, reduced-motion,
 * playback, transitions) into a smoke surface.
 */

import { resolveScrollBinding } from './scroll-linked.js';
import type { ScrollBinding, ScrollProgressCache } from './scroll-linked.js';

export type { ScrollBinding, ScrollProgressCache } from './scroll-linked.js';

// ─── Types ──────────────────────────────────────────────────────

export interface ThrottleFrameHandle {
  /** Schedule a frame — no-ops while a frame is already pending. */
  run(): void;
  /** Cancel any pending frame. */
  cancel(): void;
}

export interface ScrollDemoState {
  readonly transform: string;
  readonly opacity: number;
}

// ─── Transition kind cycle ──────────────────────────────────────

export const DEMO_TRANSITION_KINDS = [
  'slide', 'fade', 'wipe', 'zoom', 'flip', 'bubble', 'cube', 'shutter',
] as const;

export type DemoTransitionKind = (typeof DEMO_TRANSITION_KINDS)[number];

/**
 * Cycle to the next transition kind in the demo order.
 */
export function nextTransitionKind(current: DemoTransitionKind): DemoTransitionKind {
  const idx = DEMO_TRANSITION_KINDS.indexOf(current);
  const next = DEMO_TRANSITION_KINDS[(idx + 1) % DEMO_TRANSITION_KINDS.length];
  // Array of const literals guarantees next is always defined
  return next!;
}

// ─── rAF throttle ───────────────────────────────────────────────

/**
 * Create an rAF-throttled handle.
 *
 * Injectable rAF/cancelRAF for testability; in the browser page
 * pass `requestAnimationFrame` / `cancelAnimationFrame`.
 */
export function throttleFrame(
  fn: () => void,
  raf: (cb: FrameRequestCallback) => number,
  caf: (id: number) => void,
): ThrottleFrameHandle {
  let rafId: number | null = null;

  return {
    run() {
      if (rafId !== null) return;
      rafId = raf(() => {
        rafId = null;
        fn();
      });
    },

    cancel() {
      if (rafId !== null) {
        caf(rafId);
        rafId = null;
      }
    },
  };
}

// ─── Scroll demo state ──────────────────────────────────────────

/**
 * Compute the scroll-linked demo card's visual state.
 *
 * When reduced-motion is active, collapses to the end-state
 * (fully scrolled: translateY 0, opacity 1) per R-09-4.
 */
export function computeScrollDemoState(
  scrollY: number,
  binding: ScrollBinding,
  cache: ScrollProgressCache,
  isReduced: boolean,
): ScrollDemoState {
  if (isReduced) {
    return { transform: 'translateY(0px)', opacity: 1 };
  }

  const progress = resolveScrollBinding(binding, scrollY, cache) as number;
  const translateY = (1 - progress) * 60;
  return {
    transform: `translateY(${translateY}px)`,
    opacity: progress,
  };
}
