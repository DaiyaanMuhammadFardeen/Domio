/**
 * @domio/animation-runtime — ReducedMotion tests.
 */

import { describe, it, expect, vi } from 'vitest';
import { ReducedMotion } from './ReducedMotion.js';

describe('ReducedMotion', () => {
  let changeHandler: ((e: { matches: boolean }) => void) | null = null;
  let mockMatchMedia: ReturnType<typeof vi.fn>;

  function createMockMatchMedia(initialMatches = false) {
    changeHandler = null;
    return vi.fn().mockReturnValue({
      matches: initialMatches,
      addEventListener: vi.fn((type: string, handler: (e: { matches: boolean }) => void) => {
        if (type === 'change') {
          changeHandler = handler;
        }
      }),
      removeEventListener: vi.fn(() => {
        changeHandler = null;
      }),
    });
  }

  describe('follow_os (default)', () => {
    it('follow_os is the default mode', () => {
      const rm = new ReducedMotion();
      expect(rm.getMode()).toBe('follow_os');
    });

    it('isReduced reflects OS preference', () => {
      mockMatchMedia = createMockMatchMedia(false);
      const rm = new ReducedMotion(mockMatchMedia);
      rm.attach();

      expect(rm.isReduced()).toBe(false);

      // Simulate OS change
      changeHandler?.({ matches: true });
      expect(rm.isReduced()).toBe(true);
    });

    it('matchMedia change flips the flag', () => {
      mockMatchMedia = createMockMatchMedia(false);
      const rm = new ReducedMotion(mockMatchMedia);
      rm.attach();

      const events: Array<{ type: string; reduced: boolean }> = [];
      rm.subscribe((e) => {
        if (e.type === 'reduced_motion_observed') {
          events.push(e);
        }
      });

      changeHandler?.({ matches: true });
      expect(events).toHaveLength(1);
      expect(events[0]?.reduced).toBe(true);

      changeHandler?.({ matches: false });
      expect(events).toHaveLength(2);
      expect(events[1]?.reduced).toBe(false);
    });
  });

  describe('always_full', () => {
    it('always_full ignores OS preference', () => {
      mockMatchMedia = createMockMatchMedia(true);
      const rm = new ReducedMotion(mockMatchMedia);
      rm.setMode('always_full');
      rm.attach();

      expect(rm.isReduced()).toBe(false);

      changeHandler?.({ matches: true });
      expect(rm.isReduced()).toBe(false);
    });
  });

  describe('always_reduced', () => {
    it('always_reduced always returns true', () => {
      mockMatchMedia = createMockMatchMedia(false);
      const rm = new ReducedMotion(mockMatchMedia);
      rm.setMode('always_reduced');
      rm.attach();

      expect(rm.isReduced()).toBe(true);

      changeHandler?.({ matches: false });
      expect(rm.isReduced()).toBe(true);
    });
  });

  describe('clampDuration', () => {
    it('clamps to 100ms in reduced mode', () => {
      mockMatchMedia = createMockMatchMedia(true);
      const rm = new ReducedMotion(mockMatchMedia);
      rm.attach();

      expect(rm.clampDuration(500)).toBe(100);
      expect(rm.clampDuration(50)).toBe(50); // Already under 100
    });

    it('does not clamp in full mode', () => {
      mockMatchMedia = createMockMatchMedia(false);
      const rm = new ReducedMotion(mockMatchMedia);
      rm.attach();

      expect(rm.clampDuration(500)).toBe(500);
    });
  });

  describe('disableParticles', () => {
    it('returns true in reduced mode', () => {
      mockMatchMedia = createMockMatchMedia(true);
      const rm = new ReducedMotion(mockMatchMedia);
      rm.attach();
      expect(rm.disableParticles()).toBe(true);
    });

    it('returns false in full mode', () => {
      mockMatchMedia = createMockMatchMedia(false);
      const rm = new ReducedMotion(mockMatchMedia);
      rm.attach();
      expect(rm.disableParticles()).toBe(false);
    });
  });

  describe('collapseScrollLinked', () => {
    it('returns true in reduced mode', () => {
      mockMatchMedia = createMockMatchMedia(true);
      const rm = new ReducedMotion(mockMatchMedia);
      rm.attach();
      expect(rm.collapseScrollLinked()).toBe(true);
    });

    it('returns false in full mode', () => {
      mockMatchMedia = createMockMatchMedia(false);
      const rm = new ReducedMotion(mockMatchMedia);
      rm.attach();
      expect(rm.collapseScrollLinked()).toBe(false);
    });
  });

  describe('reduced mode collapses scroll-linked', () => {
    it('in reduced mode, scroll-linked collapses to single set_value at 100%', () => {
      mockMatchMedia = createMockMatchMedia(true);
      const rm = new ReducedMotion(mockMatchMedia);
      rm.attach();

      // collapseScrollLinked() signals to use a single set_value at 100% progress
      expect(rm.collapseScrollLinked()).toBe(true);
    });
  });

  describe('setMode emits events', () => {
    it('emits reduced_motion_overridden on mode change', () => {
      const rm = new ReducedMotion();
      const events: Array<{ type: string; mode: string }> = [];
      rm.subscribe((e) => {
        if (e.type === 'reduced_motion_overridden') {
          events.push(e);
        }
      });

      rm.setMode('always_full');
      expect(events).toHaveLength(1);
      expect(events[0]?.mode).toBe('always_full');

      // Same mode — no event
      rm.setMode('always_full');
      expect(events).toHaveLength(1);
    });
  });

  describe('detach', () => {
    it('removes change listener', () => {
      mockMatchMedia = createMockMatchMedia(false);
      const rm = new ReducedMotion(mockMatchMedia);
      rm.attach();
      rm.detach();

      // After detach, change handler should not fire
      const events: Array<{ type: string }> = [];
      rm.subscribe((e) => events.push(e));

      changeHandler?.({ matches: true });
      expect(events).toHaveLength(0);
    });
  });

  describe('guard for environments without matchMedia', () => {
    it('attach is no-op without matchMedia', () => {
      const rm = new ReducedMotion();
      rm.attach(); // Should not throw
      expect(rm.isReduced()).toBe(false); // Default
    });
  });
});
