/**
 * gesture-service tests — Wave 11 §S11.4.
 *
 * The service is in-memory by design; tests exercise:
 *   - default map shape on first read
 *   - save / re-load round-trip preserves mappings
 *   - recordGestureEvent stores events and listGestureEvents returns
 *     them sorted by timestamp
 *   - sinceMs filter works
 *   - resolveAction returns the mapped action
 *   - coerceMappings drops unknown keys / values
 *   - clamping on confidence
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  DEFAULT_GESTURE_MAP,
  type GestureAction,
  type GestureEvent,
  type GestureKind,
  type GestureMap,
  __resetGestureServiceState,
  defaultMappings,
  getGestureMap,
  listGestureEvents,
  recordGestureEvent,
  resolveAction,
  saveGestureMap,
} from './gesture-service';

describe('gesture-service', () => {
  beforeEach(() => {
    __resetGestureServiceState();
  });

  afterEach(() => {
    __resetGestureServiceState();
  });

  describe('getGestureMap', () => {
    it('returns a default map the first time a session is seen', async () => {
      const map = await getGestureMap('s1');
      expect(map.mappings).toEqual(DEFAULT_GESTURE_MAP);
    });

    it('returns the same id on repeated calls for the same session', async () => {
      const first = await getGestureMap('s2');
      const second = await getGestureMap('s2');
      expect(second.id).toBe(first.id);
    });
  });

  describe('saveGestureMap', () => {
    it('persists custom mappings', async () => {
      const initial = await getGestureMap('s3');
      const custom: GestureMap = {
        id: initial.id,
        session_id: 's3',
        mappings: {
          ...DEFAULT_GESTURE_MAP,
          open_palm: 'mute',
          fist: 'start_poll',
        },
      };
      const saved = await saveGestureMap(custom);
      expect(saved.mappings.open_palm).toBe('mute');
      expect(saved.mappings.fist).toBe('start_poll');
      expect(saved.id).toBe(initial.id);

      const reloaded = await getGestureMap('s3');
      expect(reloaded.mappings).toEqual(custom.mappings);
    });

    it('drops unknown gesture keys and unknown action values', async () => {
      const initial = await getGestureMap('s4');
      const dirty = {
        id: initial.id,
        session_id: 's4',
        mappings: {
          ...DEFAULT_GESTURE_MAP,
          // The runtime coercion must drop both invalid keys and
          // values regardless of what TypeScript would allow.
          nonsense: 'fly_to_mars',
          open_palm: 'explode',
        },
      } as unknown as GestureMap;
      const saved = await saveGestureMap(dirty);
      expect(saved.mappings).not.toHaveProperty('nonsense');
      // open_palm falls back to default because the action was unknown.
      expect(saved.mappings.open_palm).toBe(DEFAULT_GESTURE_MAP.open_palm);
    });
  });

  describe('recordGestureEvent / listGestureEvents', () => {
    it('stores and returns events in chronological order', async () => {
      const events: GestureEvent[] = [
        {
          id: '',
          timestamp_ms: 300,
          gesture: 'open_palm',
          confidence: 0.91,
          action: 'advance',
        },
        {
          id: '',
          timestamp_ms: 100,
          gesture: 'fist',
          confidence: 0.83,
          action: 'back',
        },
        {
          id: '',
          timestamp_ms: 200,
          gesture: 'swipe_right',
          confidence: 0.77,
          action: 'next_section',
        },
      ];
      for (const ev of events) await recordGestureEvent('s5', ev);

      const list = await listGestureEvents('s5');
      expect(list.map((e) => e.timestamp_ms)).toEqual([100, 200, 300]);
    });

    it('filters by sinceMs', async () => {
      await recordGestureEvent('s6', {
        id: '',
        timestamp_ms: 100,
        gesture: 'open_palm',
        confidence: 0.9,
        action: 'advance',
      });
      await recordGestureEvent('s6', {
        id: '',
        timestamp_ms: 500,
        gesture: 'fist',
        confidence: 0.7,
        action: 'back',
      });

      const recent = await listGestureEvents('s6', 250);
      expect(recent).toHaveLength(1);
      expect(recent[0]?.timestamp_ms).toBe(500);
    });

    it('ignores unknown gesture kinds', async () => {
      await recordGestureEvent('s7', {
        id: '',
        timestamp_ms: 1,
        gesture: 'unknown' as unknown as GestureKind,
        confidence: 0.9,
        action: 'advance',
      });
      const list = await listGestureEvents('s7');
      expect(list).toHaveLength(0);
    });

    it('clamps confidence to [0, 1]', async () => {
      await recordGestureEvent('s8', {
        id: '',
        timestamp_ms: 1,
        gesture: 'open_palm',
        confidence: 1.4,
        action: 'advance',
      });
      await recordGestureEvent('s8', {
        id: '',
        timestamp_ms: 2,
        gesture: 'fist',
        confidence: -0.5,
        action: 'back',
      });
      const list = await listGestureEvents('s8');
      expect(list[0]?.confidence).toBe(1);
      expect(list[1]?.confidence).toBe(0);
    });

    it('keeps events scoped per session', async () => {
      await recordGestureEvent('s9', {
        id: '',
        timestamp_ms: 1,
        gesture: 'open_palm',
        confidence: 0.9,
        action: 'advance',
      });
      await recordGestureEvent('s10', {
        id: '',
        timestamp_ms: 2,
        gesture: 'fist',
        confidence: 0.9,
        action: 'back',
      });
      expect(await listGestureEvents('s9')).toHaveLength(1);
      expect(await listGestureEvents('s10')).toHaveLength(1);
    });
  });

  describe('resolveAction', () => {
    it('returns the mapped action for a gesture', () => {
      const map: Pick<GestureMap, 'mappings'> = {
        mappings: DEFAULT_GESTURE_MAP,
      };
      expect(resolveAction(map, 'open_palm')).toBe<GestureAction>('advance');
      expect(resolveAction(map, 'fist')).toBe<GestureAction>('back');
      expect(resolveAction(map, 'swipe_right')).toBe<GestureAction>('next_section');
    });

    it('returns null when the gesture is unmapped', () => {
      const empty: Pick<GestureMap, 'mappings'> = {
        mappings: {} as Partial<Record<GestureKind, GestureAction>> as Record<GestureKind, GestureAction>,
      };
      expect(resolveAction(empty, 'open_palm')).toBeNull();
    });
  });

  describe('defaultMappings', () => {
    it('returns a fresh copy of the default map each call', () => {
      const a = defaultMappings();
      const b = defaultMappings();
      expect(a).toEqual(b);
      expect(a).not.toBe(b);
      a.open_palm = 'mute';
      expect(b.open_palm).toBe('advance');
    });
  });
});