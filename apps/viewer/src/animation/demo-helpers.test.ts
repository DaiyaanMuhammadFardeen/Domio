/**
 * @domio/viewer — demo-helpers tests.
 *
 * Pure-logic tests only (no jsdom / react-testing-library).
 */

import { describe, it, expect, vi } from 'vitest';
import {
  throttleFrame,
  computeScrollDemoState,
  nextTransitionKind,
  DEMO_TRANSITION_KINDS,
  type ScrollBinding,
  type DemoTransitionKind,
} from './demo-helpers.js';

// ─── nextTransitionKind ─────────────────────────────────────────

describe('nextTransitionKind', () => {
  it('cycles through all kinds without skipping', () => {
    let current: DemoTransitionKind = DEMO_TRANSITION_KINDS[0]!;
    const seen = new Set<string>();
    for (let i = 0; i < DEMO_TRANSITION_KINDS.length; i++) {
      seen.add(current);
      current = nextTransitionKind(current);
    }
    // After a full cycle we should be back to the start
    expect(current).toBe(DEMO_TRANSITION_KINDS[0]);
    expect(seen.size).toBe(DEMO_TRANSITION_KINDS.length);
  });
});

// ─── throttleFrame ──────────────────────────────────────────────

describe('throttleFrame', () => {
  it('schedules a frame on first run and calls callback', () => {
    const cb = vi.fn();
    let rafCb: FrameRequestCallback | null = null;
    const raf = vi.fn<(cb: FrameRequestCallback) => number>((cb) => {
      rafCb = cb;
      return 1;
    });
    const caf = vi.fn();

    const handle = throttleFrame(cb, raf, caf);
    handle.run();

    expect(raf).toHaveBeenCalledTimes(1);
    expect(cb).not.toHaveBeenCalled();

    // Simulate frame firing
    rafCb!(16.7);
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('no-ops while a frame is already pending', () => {
    const cb = vi.fn();
    const raf = vi.fn<(cb: FrameRequestCallback) => number>(() => 1);
    const caf = vi.fn();

    const handle = throttleFrame(cb, raf, caf);
    handle.run();
    handle.run(); // should be ignored
    handle.run(); // should be ignored

    expect(raf).toHaveBeenCalledTimes(1);
  });

  it('cancel stops a pending frame', () => {
    const cb = vi.fn();
    const raf = vi.fn<(cb: FrameRequestCallback) => number>(() => 42);
    const caf = vi.fn();

    const handle = throttleFrame(cb, raf, caf);
    handle.run();
    handle.cancel();

    expect(caf).toHaveBeenCalledWith(42);
    expect(cb).not.toHaveBeenCalled();
  });
});

// ─── computeScrollDemoState ─────────────────────────────────────

function makeBinding(overrides?: Partial<ScrollBinding>): ScrollBinding {
  return {
    elementId: 'demo-card',
    property: 'opacity',
    start: 0,
    end: 1000,
    ...overrides,
  };
}

describe('computeScrollDemoState', () => {
  it('collapses to end-state when reduced', () => {
    const state = computeScrollDemoState(
      0,
      makeBinding(),
      new Map(),
      true, // isReduced
    );
    expect(state.transform).toBe('translateY(0px)');
    expect(state.opacity).toBe(1);
  });

  it('interpolates at midpoint when not reduced', () => {
    const state = computeScrollDemoState(
      500,
      makeBinding({ start: 0, end: 1000 }),
      new Map(),
      false,
    );
    expect(state.opacity).toBe(0.5);
    expect(state.transform).toBe('translateY(30px)');
  });

  it('clamps to start when scrollY < start', () => {
    const state = computeScrollDemoState(
      0,
      makeBinding({ start: 200, end: 800 }),
      new Map(),
      false,
    );
    expect(state.opacity).toBe(0);
    expect(state.transform).toBe('translateY(60px)');
  });

  it('clamps to end when scrollY > end', () => {
    const state = computeScrollDemoState(
      900,
      makeBinding({ start: 200, end: 800 }),
      new Map(),
      false,
    );
    expect(state.opacity).toBe(1);
    expect(state.transform).toBe('translateY(0px)');
  });
});
