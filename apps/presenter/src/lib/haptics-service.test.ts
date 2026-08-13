/**
 * haptics-service tests — Wave 11 §S11.13.
 *
 * Covers the in-memory pattern + checkpoint persistence, the preset
 * library, and the Vibration API helper.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  BUILTIN_PATTERNS,
  LONG_PATTERN,
  MEDIUM_PATTERN,
  PRESET_PATTERN_IDS,
  SHORT_PATTERN,
  blankCheckpoint,
  blankPattern,
  deletePattern,
  getPattern,
  listPacingCheckpoints,
  listPatterns,
  patternToVibrateSequence,
  savePacingCheckpoints,
  savePattern,
  triggerAdvanceVibrate,
  triggerVibrate,
  __resetHapticsServiceState,
} from './haptics-service';

describe('haptics-service', () => {
  beforeEach(() => {
    __resetHapticsServiceState();
  });

  afterEach(() => {
    __resetHapticsServiceState();
  });

  describe('built-in presets', () => {
    it('ships short / medium / long presets', () => {
      expect(BUILTIN_PATTERNS).toHaveLength(3);
      expect(PRESET_PATTERN_IDS).toContain(SHORT_PATTERN.id);
      expect(PRESET_PATTERN_IDS).toContain(MEDIUM_PATTERN.id);
      expect(PRESET_PATTERN_IDS).toContain(LONG_PATTERN.id);
    });

    it('lists presets via listPatterns', async () => {
      const list = await listPatterns();
      const ids = list.map((p) => p.id);
      expect(ids).toContain(SHORT_PATTERN.id);
      expect(ids).toContain(MEDIUM_PATTERN.id);
      expect(ids).toContain(LONG_PATTERN.id);
    });

    it('returns deep copies so callers can\'t mutate the store', async () => {
      const list = await listPatterns();
      const first = list[0];
      if (!first) throw new Error('expected at least one pattern');
      // Mutate the returned object.
      const pulses = first.pulses as { vibrate_ms: number; pause_ms: number }[];
      pulses[0] = { vibrate_ms: 9999, pause_ms: 9999 };
      // Re-fetch and confirm the store is unchanged.
      const again = await listPatterns();
      const same = again.find((p) => p.id === first.id);
      expect(same?.pulses[0]?.vibrate_ms).not.toBe(9999);
    });
  });

  describe('savePattern / deletePattern', () => {
    it('inserts a new custom pattern', async () => {
      const saved = await savePattern(blankPattern('Take a breath'));
      expect(saved.id).toMatch(/^pat_/);
      expect(saved.name).toBe('Take a breath');
      expect(saved.pulses).toHaveLength(1);
    });

    it('updates an existing pattern by id', async () => {
      const first = await savePattern({
        id: 'pat_test',
        name: 'Old',
        pulses: [{ vibrate_ms: 10, pause_ms: 0 }],
      });
      const second = await savePattern({
        id: first.id,
        name: 'New',
        pulses: [
          { vibrate_ms: 20, pause_ms: 5 },
          { vibrate_ms: 30, pause_ms: 0 },
        ],
      });
      expect(second.id).toBe(first.id);
      expect(second.name).toBe('New');
      expect(second.pulses).toHaveLength(2);
      const fetched = await getPattern(first.id);
      expect(fetched?.name).toBe('New');
    });

    it('refuses to delete a built-in preset', async () => {
      const before = await listPatterns();
      await deletePattern(SHORT_PATTERN.id);
      const after = await listPatterns();
      expect(after.length).toBe(before.length);
      expect(after.find((p) => p.id === SHORT_PATTERN.id)).toBeDefined();
    });

    it('deletes a custom pattern', async () => {
      const saved = await savePattern(blankPattern('Throwaway'));
      await deletePattern(saved.id);
      const fetched = await getPattern(saved.id);
      expect(fetched).toBeNull();
    });

    it('coerces garbage pulse values to safe defaults', async () => {
      const saved = await savePattern({
        id: 'pat_garbage',
        name: 'Garbage',
        pulses: [
          // @ts-expect-error — intentionally bad input
          { vibrate_ms: 'oops', pause_ms: -9 },
          // @ts-expect-error — missing pause
          { vibrate_ms: 25 },
        ],
      });
      expect(saved.pulses[0]?.vibrate_ms).toBe(0);
      expect(saved.pulses[0]?.pause_ms).toBe(0);
      expect(saved.pulses[1]?.vibrate_ms).toBe(25);
      expect(saved.pulses[1]?.pause_ms).toBe(0);
    });

    it('assigns an id when none is provided', async () => {
      const saved = await savePattern({
        id: '',
        name: 'No id',
        pulses: [{ vibrate_ms: 10, pause_ms: 0 }],
      });
      expect(saved.id.length).toBeGreaterThan(0);
    });
  });

  describe('pacing checkpoints', () => {
    it('returns an empty list for a deck that has no checkpoints', async () => {
      const list = await listPacingCheckpoints('deck-empty');
      expect(list).toEqual([]);
    });

    it('persists checkpoints per deck and round-trips', async () => {
      const a = blankCheckpoint('deck-1', 'slide-1');
      const b = blankCheckpoint('deck-1', 'slide-2');
      const saved = await savePacingCheckpoints([a, b]);
      expect(saved).toHaveLength(2);
      const list = await listPacingCheckpoints('deck-1');
      expect(list).toHaveLength(2);
      const slideIds = list.map((c) => c.slide_id).sort();
      expect(slideIds).toEqual(['slide-1', 'slide-2']);
    });

    it('replaces (does not merge) existing checkpoints for the deck', async () => {
      const initial = [blankCheckpoint('deck-1', 'slide-1')];
      await savePacingCheckpoints(initial);
      const replacement = [blankCheckpoint('deck-1', 'slide-3')];
      await savePacingCheckpoints(replacement);
      const list = await listPacingCheckpoints('deck-1');
      expect(list).toHaveLength(1);
      expect(list[0]?.slide_id).toBe('slide-3');
    });

    it('keeps checkpoints for other decks untouched', async () => {
      await savePacingCheckpoints([blankCheckpoint('deck-1', 'slide-1')]);
      await savePacingCheckpoints([blankCheckpoint('deck-2', 'slide-2')]);
      const list1 = await listPacingCheckpoints('deck-1');
      const list2 = await listPacingCheckpoints('deck-2');
      expect(list1).toHaveLength(1);
      expect(list2).toHaveLength(1);
    });

    it('rejects checkpoints missing deck_id or slide_id', async () => {
      const good = blankCheckpoint('deck-1', 'slide-1');
      const bad = { ...good, id: 'pc_bad', deck_id: '' };
      const saved = await savePacingCheckpoints([good, bad]);
      expect(saved).toHaveLength(1);
      expect(saved[0]?.id).toBe(good.id);
    });

    it('clamps negative time offsets to 0', async () => {
      const cp = { ...blankCheckpoint('deck-1', 'slide-1'), time_offset_sec: -7 };
      const saved = await savePacingCheckpoints([cp]);
      expect(saved[0]?.time_offset_sec).toBe(0);
    });

    it('caps label length', async () => {
      const longLabel = 'x'.repeat(500);
      const cp = { ...blankCheckpoint('deck-1', 'slide-1'), label: longLabel };
      const saved = await savePacingCheckpoints([cp]);
      expect((saved[0]?.label ?? '').length).toBeLessThanOrEqual(120);
    });
  });

  describe('patternToVibrateSequence', () => {
    it('flattens a pulse list into the [vibrate, pause, ...] shape', () => {
      const pattern: ReturnType<typeof blankPattern> = {
        id: 'pat_x',
        name: 'X',
        pulses: [
          { vibrate_ms: 50, pause_ms: 30 },
          { vibrate_ms: 50, pause_ms: 0 },
        ],
      };
      const seq = patternToVibrateSequence(pattern);
      expect(seq).toEqual([50, 30, 50]);
    });

    it('drops zero-length pauses', () => {
      const seq = patternToVibrateSequence(SHORT_PATTERN);
      expect(seq).toEqual([30]);
    });

    it('returns an empty array for a pattern with no pulses', () => {
      const seq = patternToVibrateSequence({ id: 'p', name: 'p', pulses: [] });
      expect(seq).toEqual([]);
    });
  });

  describe('triggerVibrate', () => {
    it('returns false when navigator.vibrate is missing', () => {
      const original = (navigator as unknown as { vibrate?: unknown }).vibrate;
      Object.defineProperty(navigator, 'vibrate', {
        value: undefined,
        configurable: true,
        writable: true,
      });
      try {
        expect(triggerVibrate(SHORT_PATTERN)).toBe(false);
      } finally {
        Object.defineProperty(navigator, 'vibrate', {
          value: original,
          configurable: true,
          writable: true,
        });
      }
    });

    it('invokes navigator.vibrate with the flattened sequence', () => {
      const spy = vi.fn(() => true);
      const original = (navigator as unknown as { vibrate?: unknown }).vibrate;
      Object.defineProperty(navigator, 'vibrate', {
        value: spy,
        configurable: true,
        writable: true,
      });
      try {
        const result = triggerVibrate(MEDIUM_PATTERN);
        expect(result).toBe(true);
        expect(spy).toHaveBeenCalledTimes(1);
        expect(spy).toHaveBeenCalledWith([50, 30, 50]);
      } finally {
        Object.defineProperty(navigator, 'vibrate', {
          value: original,
          configurable: true,
          writable: true,
        });
      }
    });

    it('returns false when the pattern has no pulses', () => {
      const spy = vi.fn(() => true);
      const original = (navigator as unknown as { vibrate?: unknown }).vibrate;
      Object.defineProperty(navigator, 'vibrate', {
        value: spy,
        configurable: true,
        writable: true,
      });
      try {
        const result = triggerVibrate({ id: 'p', name: 'p', pulses: [] });
        expect(result).toBe(false);
        expect(spy).not.toHaveBeenCalled();
      } finally {
        Object.defineProperty(navigator, 'vibrate', {
          value: original,
          configurable: true,
          writable: true,
        });
      }
    });

    it('returns false and never throws when navigator.vibrate throws', () => {
      const original = (navigator as unknown as { vibrate?: unknown }).vibrate;
      Object.defineProperty(navigator, 'vibrate', {
        value: () => {
          throw new Error('blocked');
        },
        configurable: true,
        writable: true,
      });
      try {
        expect(triggerVibrate(SHORT_PATTERN)).toBe(false);
      } finally {
        Object.defineProperty(navigator, 'vibrate', {
          value: original,
          configurable: true,
          writable: true,
        });
      }
    });

    it('triggerAdvanceVibrate defaults to the short pattern', () => {
      const spy = vi.fn(() => true);
      const original = (navigator as unknown as { vibrate?: unknown }).vibrate;
      Object.defineProperty(navigator, 'vibrate', {
        value: spy,
        configurable: true,
        writable: true,
      });
      try {
        triggerAdvanceVibrate();
        expect(spy).toHaveBeenCalledWith([30]);
      } finally {
        Object.defineProperty(navigator, 'vibrate', {
          value: original,
          configurable: true,
          writable: true,
        });
      }
    });
  });

  describe('blank helpers', () => {
    it('blankPattern assigns a unique id and a single default pulse', () => {
      const a = blankPattern('A');
      const b = blankPattern('B');
      expect(a.id).not.toBe(b.id);
      expect(a.pulses).toHaveLength(1);
      expect(b.name).toBe('B');
    });

    it('blankCheckpoint seeds sane defaults', () => {
      const cp = blankCheckpoint('deck-1', 'slide-1');
      expect(cp.deck_id).toBe('deck-1');
      expect(cp.slide_id).toBe('slide-1');
      expect(cp.time_offset_sec).toBeGreaterThan(0);
      expect(cp.pattern_id).toBe(MEDIUM_PATTERN.id);
    });
  });
});
