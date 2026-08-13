/**
 * two-way-service tests — Wave 11 §S11.7.
 *
 * Covers the deterministic seed, the adjust → midpoint recompute path,
 * the adjustment timeline, and the save-to-deck endpoint. Network paths
 * fall back to in-memory state in the demo build.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import {
  BidirServiceError,
  __resetBidirServiceState,
  __seedBidirSliders,
  adjustBidirSlider,
  computeMidpoint,
  isConverged,
  listBidirAdjustments,
  listBidirSliders,
  saveBidirToDeck,
} from './two-way-service';
import type { BidirSlider } from './two-way-service';

const SLIDE = 'slide_pricing_1';

const SAMPLE: BidirSlider[] = [
  {
    id: `${SLIDE}__price`,
    label: 'Price point',
    min: 0,
    max: 199,
    step: 1,
    unit: '$/mo',
    presenter_value: 50,
    audience_value: 70,
    midpoint: 60,
    converged: false,
  },
];

describe('two-way-service', () => {
  beforeEach(() => {
    __resetBidirServiceState();
  });

  describe('listBidirSliders', () => {
    it('returns deterministic seed sliders for a fresh slide', async () => {
      const sliders = await listBidirSliders(SLIDE);
      expect(sliders.length).toBeGreaterThanOrEqual(2);
      for (const s of sliders) {
        expect(s.id.startsWith(SLIDE)).toBe(true);
        expect(s.max).toBeGreaterThan(s.min);
        expect(s.midpoint).toBeCloseTo((s.presenter_value + s.audience_value) / 2, 5);
      }
    });

    it('returns the same seed for repeat calls', async () => {
      const first = await listBidirSliders(SLIDE);
      const second = await listBidirSliders(SLIDE);
      expect(first.map((s) => s.id)).toEqual(second.map((s) => s.id));
      expect(first.map((s) => s.presenter_value)).toEqual(second.map((s) => s.presenter_value));
    });
  });

  describe('adjustBidirSlider', () => {
    it('updates the presenter side and recomputes the midpoint', async () => {
      __seedBidirSliders(SLIDE, SAMPLE);
      const updated = await adjustBidirSlider(SLIDE, `${SLIDE}__price`, 80, {
        type: 'presenter',
        id: 'p',
        name: 'Presenter',
      });
      expect(updated.presenter_value).toBe(80);
      expect(updated.midpoint).toBe(75); // (80 + 70) / 2
      expect(updated.converged).toBe(false);
    });

    it('updates the audience side when actor is audience', async () => {
      __seedBidirSliders(SLIDE, SAMPLE);
      const updated = await adjustBidirSlider(SLIDE, `${SLIDE}__price`, 60, {
        type: 'audience',
        id: 'a1',
        name: 'Audience A',
      });
      expect(updated.audience_value).toBe(60);
      expect(updated.presenter_value).toBe(50); // unchanged
      expect(updated.midpoint).toBe(55);
    });

    it('marks converged when both sides are within one step', async () => {
      __seedBidirSliders(SLIDE, SAMPLE);
      // bring audience to within step of presenter (50 → 51)
      const updated = await adjustBidirSlider(SLIDE, `${SLIDE}__price`, 51, {
        type: 'audience',
        id: 'a1',
        name: 'Audience A',
      });
      expect(updated.converged).toBe(true);
    });

    it('clamps values to [min, max]', async () => {
      __seedBidirSliders(SLIDE, SAMPLE);
      const tooHigh = await adjustBidirSlider(SLIDE, `${SLIDE}__price`, 9999, {
        type: 'presenter',
        id: 'p',
        name: 'Presenter',
      });
      expect(tooHigh.presenter_value).toBe(199);
      const tooLow = await adjustBidirSlider(SLIDE, `${SLIDE}__price`, -50, {
        type: 'audience',
        id: 'a1',
        name: 'Audience A',
      });
      expect(tooLow.audience_value).toBe(0);
    });

    it('rounds values to the slider step', async () => {
      __seedBidirSliders(SLIDE, [
        {
          ...SAMPLE[0]!,
          step: 5,
        },
      ]);
      const updated = await adjustBidirSlider(SLIDE, `${SLIDE}__price`, 73, {
        type: 'presenter',
        id: 'p',
        name: 'Presenter',
      });
      expect(updated.presenter_value).toBe(75);
    });

    it('appends an adjustment to the timeline', async () => {
      __seedBidirSliders(SLIDE, SAMPLE);
      await adjustBidirSlider(SLIDE, `${SLIDE}__price`, 60, {
        type: 'presenter',
        id: 'p',
        name: 'Presenter',
      });
      const adj = await listBidirAdjustments(SLIDE);
      expect(adj).toHaveLength(1);
      expect(adj[0]!.slider_id).toBe(`${SLIDE}__price`);
      expect(adj[0]!.from_value).toBe(50);
      expect(adj[0]!.to_value).toBe(60);
      expect(adj[0]!.new_midpoint).toBe(65);
      expect(adj[0]!.actor.type).toBe('presenter');
    });

    it('throws BidirServiceError when the slider is unknown', async () => {
      __seedBidirSliders(SLIDE, SAMPLE);
      await expect(
        adjustBidirSlider(SLIDE, 'nope', 10, {
          type: 'presenter',
          id: 'p',
          name: 'Presenter',
        }),
      ).rejects.toBeInstanceOf(BidirServiceError);
    });
  });

  describe('listBidirAdjustments', () => {
    it('starts empty for a fresh slide', async () => {
      __seedBidirSliders(SLIDE, SAMPLE);
      const adj = await listBidirAdjustments(SLIDE);
      expect(adj).toHaveLength(0);
    });

    it('preserves chronological order across multiple actors', async () => {
      __seedBidirSliders(SLIDE, SAMPLE);
      await adjustBidirSlider(SLIDE, `${SLIDE}__price`, 55, {
        type: 'presenter',
        id: 'p',
        name: 'Presenter',
      });
      await adjustBidirSlider(SLIDE, `${SLIDE}__price`, 60, {
        type: 'audience',
        id: 'a1',
        name: 'Audience A',
      });
      await adjustBidirSlider(SLIDE, `${SLIDE}__price`, 65, {
        type: 'audience',
        id: 'a1',
        name: 'Audience A',
      });
      const adj = await listBidirAdjustments(SLIDE);
      expect(adj.map((a) => a.to_value)).toEqual([55, 60, 65]);
      expect(adj[1]!.actor.type).toBe('audience');
    });
  });

  describe('saveBidirToDeck', () => {
    it('returns a monotonic timestamp', async () => {
      __seedBidirSliders(SLIDE, SAMPLE);
      const before = Date.now();
      const out = await saveBidirToDeck(SLIDE);
      expect(typeof out.saved_at_ms).toBe('number');
      expect(out.saved_at_ms).toBeGreaterThanOrEqual(before);
    });
  });

  describe('computeMidpoint / isConverged', () => {
    it('computeMidpoint averages the two values', () => {
      expect(computeMidpoint(50, 70)).toBe(60);
      expect(computeMidpoint(0, 0)).toBe(0);
    });

    it('isConverged is true within one step', () => {
      expect(isConverged(50, 50, 1)).toBe(true);
      expect(isConverged(50, 51, 1)).toBe(true);
      expect(isConverged(50, 70, 1)).toBe(false);
    });
  });
});