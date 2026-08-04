/**
 * @domio/viewer — reduced-motion tests.
 */

import { describe, it, expect, vi } from 'vitest';
import { createReducedMotionGuard } from './reduced-motion.js';

// ─── Helpers ────────────────────────────────────────────────────

interface MockMediaQuery {
  matches: boolean;
  listeners: Map<string, Array<(e: { matches: boolean }) => void>>;
  addEventListener: (type: string, handler: (e: { matches: boolean }) => void) => void;
  removeEventListener: (type: string, handler: (e: { matches: boolean }) => void) => void;
  emitChange: (matches: boolean) => void;
}

function createMockMatchMedia(initialMatches = false): {
  matchMedia: (query: string) => MockMediaQuery;
  mq: MockMediaQuery;
} {
  const listeners = new Map<string, Array<(e: { matches: boolean }) => void>>();
  const mq: MockMediaQuery = {
    matches: initialMatches,
    listeners,
    addEventListener(type, handler) {
      const list = listeners.get(type) ?? [];
      list.push(handler);
      listeners.set(type, list);
    },
    removeEventListener(type, handler) {
      const list = listeners.get(type) ?? [];
      const idx = list.indexOf(handler);
      if (idx >= 0) list.splice(idx, 1);
    },
    emitChange(matches: boolean) {
      mq.matches = matches;
      for (const handler of listeners.get('change') ?? []) {
        handler({ matches });
      }
    },
  };
  return {
    matchMedia: (_query: string) => mq,
    mq,
  };
}

// ─── Tests ──────────────────────────────────────────────────────

describe('createReducedMotionGuard', () => {
  describe('follow_os mode', () => {
    it('reflects matchMedia reduce when follow_os', () => {
      const { matchMedia, mq } = createMockMatchMedia(true);
      const guard = createReducedMotionGuard({ matchMedia });

      expect(guard.isReduced()).toBe(true);

      mq.emitChange(false);
      expect(guard.isReduced()).toBe(false);
    });

    it('defaults to not reduced when OS is full', () => {
      const { matchMedia } = createMockMatchMedia(false);
      const guard = createReducedMotionGuard({ matchMedia });
      expect(guard.isReduced()).toBe(false);
    });

    it('emits change event when OS preference changes', () => {
      const { matchMedia, mq } = createMockMatchMedia(false);
      const onChange = vi.fn();
      createReducedMotionGuard({ matchMedia, onChange });

      mq.emitChange(true);
      expect(onChange).toHaveBeenCalledWith(true);

      mq.emitChange(false);
      expect(onChange).toHaveBeenCalledWith(false);
    });
  });

  describe('always_reduced override', () => {
    it('returns reduced regardless of OS', () => {
      const { matchMedia, mq } = createMockMatchMedia(false);
      const guard = createReducedMotionGuard({ matchMedia });
      guard.setMode('always_reduced');

      expect(guard.isReduced()).toBe(true);

      // Changing OS preference should not affect result
      mq.emitChange(false);
      expect(guard.isReduced()).toBe(true);
    });
  });

  describe('always_full override', () => {
    it('returns full regardless of OS', () => {
      const { matchMedia, mq } = createMockMatchMedia(true);
      const guard = createReducedMotionGuard({ matchMedia });
      guard.setMode('always_full');

      expect(guard.isReduced()).toBe(false);

      mq.emitChange(true);
      expect(guard.isReduced()).toBe(false);
    });

    it('emits change event when mode is set', () => {
      const { matchMedia } = createMockMatchMedia(true);
      const onChange = vi.fn();
      const guard = createReducedMotionGuard({ matchMedia, onChange });

      guard.setMode('always_full');
      expect(onChange).toHaveBeenCalledWith(false);
    });
  });

  describe('clampDuration', () => {
    it('collapses to 1 ms when reduced (R-09-4)', () => {
      const { matchMedia } = createMockMatchMedia(true);
      const guard = createReducedMotionGuard({ matchMedia });

      expect(guard.clampDuration(500)).toBe(1);
      expect(guard.clampDuration(1000)).toBe(1);
      expect(guard.clampDuration(100)).toBe(1);
    });

    it('passes through when not reduced', () => {
      const { matchMedia } = createMockMatchMedia(false);
      const guard = createReducedMotionGuard({ matchMedia });

      expect(guard.clampDuration(500)).toBe(500);
      expect(guard.clampDuration(1000)).toBe(1000);
    });

    it('collapses to 1 ms when always_reduced', () => {
      const { matchMedia } = createMockMatchMedia(false);
      const guard = createReducedMotionGuard({ matchMedia });
      guard.setMode('always_reduced');

      expect(guard.clampDuration(500)).toBe(1);
    });
  });

  describe('disableParticles', () => {
    it('returns true when reduced', () => {
      const { matchMedia } = createMockMatchMedia(true);
      const guard = createReducedMotionGuard({ matchMedia });
      expect(guard.disableParticles()).toBe(true);
    });

    it('returns false when not reduced', () => {
      const { matchMedia } = createMockMatchMedia(false);
      const guard = createReducedMotionGuard({ matchMedia });
      expect(guard.disableParticles()).toBe(false);
    });
  });

  describe('collapseScrollLinked', () => {
    it('returns true when reduced', () => {
      const { matchMedia } = createMockMatchMedia(true);
      const guard = createReducedMotionGuard({ matchMedia });
      expect(guard.collapseScrollLinked()).toBe(true);
    });

    it('returns false when not reduced', () => {
      const { matchMedia } = createMockMatchMedia(false);
      const guard = createReducedMotionGuard({ matchMedia });
      expect(guard.collapseScrollLinked()).toBe(false);
    });
  });

  describe('getMode / setMode', () => {
    it('defaults to follow_os', () => {
      const guard = createReducedMotionGuard();
      expect(guard.getMode()).toBe('follow_os');
    });

    it('persists mode changes', () => {
      const guard = createReducedMotionGuard();
      guard.setMode('always_reduced');
      expect(guard.getMode()).toBe('always_reduced');
      guard.setMode('always_full');
      expect(guard.getMode()).toBe('always_full');
    });

    it('does not emit when setting same mode', () => {
      const onChange = vi.fn();
      const guard = createReducedMotionGuard({ onChange });
      guard.setMode('follow_os');
      expect(onChange).not.toHaveBeenCalled();
    });
  });

  describe('destroy', () => {
    it('detaches matchMedia listener', () => {
      const { matchMedia, mq } = createMockMatchMedia(false);
      const onChange = vi.fn();
      const guard = createReducedMotionGuard({ matchMedia, onChange });

      guard.destroy();

      mq.emitChange(true);
      expect(onChange).not.toHaveBeenCalled();
    });
  });

  describe('no matchMedia', () => {
    it('works without matchMedia injected', () => {
      const guard = createReducedMotionGuard();
      expect(guard.isReduced()).toBe(false);
      expect(guard.clampDuration(500)).toBe(500);
      expect(guard.disableParticles()).toBe(false);
      expect(guard.collapseScrollLinked()).toBe(false);
    });
  });
});
