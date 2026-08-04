/**
 * @domio/animation-runtime — TriggerResolver tests.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TriggerResolver } from './TriggerResolver.js';

describe('TriggerResolver', () => {
  let resolver: TriggerResolver;
  let onFire: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    onFire = vi.fn();
    resolver = new TriggerResolver(onFire);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('on_data_change', () => {
    it('resolves to matching (sourceId, fieldPath)', () => {
      resolver.registerTrigger('tl-1', {
        kind: 'on_data_change',
        sourceId: 'user',
        fieldPath: 'name',
      });

      resolver.fire('on_data_change', { sourceId: 'user', fieldPath: 'name' });
      expect(onFire).toHaveBeenCalledWith('tl-1', expect.objectContaining({ kind: 'on_data_change' }));
    });

    it('does not fire on non-matching (sourceId, fieldPath)', () => {
      resolver.registerTrigger('tl-1', {
        kind: 'on_data_change',
        sourceId: 'user',
        fieldPath: 'name',
      });

      resolver.fire('on_data_change', { sourceId: 'user', fieldPath: 'email' });
      expect(onFire).not.toHaveBeenCalled();
    });

    it('does not fire on non-matching sourceId', () => {
      resolver.registerTrigger('tl-1', {
        kind: 'on_data_change',
        sourceId: 'user',
        fieldPath: 'name',
      });

      resolver.fire('on_data_change', { sourceId: 'post', fieldPath: 'name' });
      expect(onFire).not.toHaveBeenCalled();
    });

    it('debounces at 250ms', () => {
      resolver.registerTrigger('tl-1', {
        kind: 'on_data_change',
        sourceId: 'user',
        fieldPath: 'name',
      });

      resolver.fire('on_data_change', { sourceId: 'user', fieldPath: 'name' });
      expect(onFire).toHaveBeenCalledTimes(1);

      // Fire again within debounce window
      vi.advanceTimersByTime(100);
      resolver.fire('on_data_change', { sourceId: 'user', fieldPath: 'name' });
      expect(onFire).toHaveBeenCalledTimes(1); // Still 1

      // Fire after debounce window
      vi.advanceTimersByTime(200);
      resolver.fire('on_data_change', { sourceId: 'user', fieldPath: 'name' });
      expect(onFire).toHaveBeenCalledTimes(2);
    });
  });

  describe('on_timer', () => {
    it('rejects negative offsetMs', () => {
      resolver.registerTrigger('tl-1', {
        kind: 'on_timer',
        offsetMs: -100,
      });

      resolver.fire('on_timer');
      expect(onFire).not.toHaveBeenCalled();
    });

    it('allows non-negative offsetMs', () => {
      resolver.registerTrigger('tl-1', {
        kind: 'on_timer',
        offsetMs: 0,
      });

      resolver.fire('on_timer');
      expect(onFire).toHaveBeenCalledTimes(1);
    });

    it('allows positive offsetMs', () => {
      resolver.registerTrigger('tl-1', {
        kind: 'on_timer',
        offsetMs: 500,
      });

      resolver.fire('on_timer');
      expect(onFire).toHaveBeenCalledTimes(1);
    });
  });

  describe('16-trigger cap', () => {
    it('drops triggers beyond 16 simultaneous', () => {
      // Register 20 triggers
      for (let i = 0; i < 20; i++) {
        resolver.registerTrigger(`tl-${i}`, {
          kind: 'on_click',
        });
      }

      const fired = resolver.fire('on_click');
      expect(fired.length).toBe(16);
      expect(onFire).toHaveBeenCalledTimes(16);
    });
  });

  describe('unregisterTimeline', () => {
    it('removes all triggers for a timeline', () => {
      resolver.registerTrigger('tl-1', { kind: 'on_click' });
      resolver.registerTrigger('tl-1', { kind: 'on_hover' });
      resolver.registerTrigger('tl-2', { kind: 'on_click' });

      resolver.unregisterTimeline('tl-1');

      resolver.fire('on_click');
      expect(onFire).toHaveBeenCalledTimes(1); // Only tl-2
    });
  });

  describe('returns fired timeline IDs', () => {
    it('returns list of triggered timeline IDs', () => {
      resolver.registerTrigger('tl-1', { kind: 'on_enter' });
      resolver.registerTrigger('tl-2', { kind: 'on_enter' });

      const fired = resolver.fire('on_enter');
      expect(fired).toEqual(['tl-1', 'tl-2']);
    });
  });
});
