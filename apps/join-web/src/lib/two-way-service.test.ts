/**
 * two-way-service tests — Wave 11 §S11.7.
 *
 * Covers the local-only audience-side service: deterministic seed,
 * audience-side adjustment, presenter-side sync, adjustment timeline,
 * save-to-deck, and clamps/rounding.
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
  syncPresenterValue,
} from './two-way-service';
import type { BidirSlider } from './two-way-service';

const SLIDE = 'slide_pricing_join';

const SAMPLE: BidirSlider[] = [
  {
    id: `${SLIDE}__price`,
    label: 'Price point',
    min: 0,
    max: 199,
    step: 1,
    unit: '$/mo',
    presenter_value: 50,
    audience_value: 50,
    midpoint: 50,
    converged: true,
  },
];

describe('two-way-service (join-web)', () => {
  beforeEach(() => {
    __resetBidirServiceState();
  });

  describe('listBidirSliders', () => {
    it('returns a deterministic seed for an unknown slide', async () => {
      const sliders = await listBidirSliders(SLIDE);
      expect(sliders.length).toBeGreaterThanOrEqual(2);
      for (const s of sliders) {
        expect(s.id.startsWith(SLIDE)).toBe(true);
        expect(s.max).toBeGreaterThan(s.min);
      }
    });

    it('returns the same seed across calls', async () => {
      const first = await listBidirSliders(SLIDE);
      const second = await listBidirSliders(SLIDE);
      expect(first.map((s) => s.id)).toEqual(second.map((s) => s.id));
    });
  });

  describe('adjustBidirSlider', () => {
    it('moves the audience-side and recomputes the midpoint', async () => {
      __seedBidirSliders(SLIDE, SAMPLE);
      const updated = await adjustBidirSlider(SLIDE, `${SLIDE}__price`, 70);
      expect(updated.audience_value).toBe(70);
      expect(updated.presenter_value).toBe(50);
      expect(updated.midpoint).toBe(60);
      expect(updated.converged).toBe(false);
    });

    it('marks converged once both sides match within one step', async () => {
      __seedBidirSliders(SLIDE, SAMPLE);
      const updated = await adjustBidirSlider(SLIDE, `${SLIDE}__price`, 51);
      expect(updated.converged).toBe(true);
    });

    it('clamps values to [min, max]', async () => {
      __seedBidirSliders(SLIDE, SAMPLE);
      const tooHigh = await adjustBidirSlider(SLIDE, `${SLIDE}__price`, 9999);
      expect(tooHigh.audience_value).toBe(199);
      const tooLow = await adjustBidirSlider(SLIDE, `${SLIDE}__price`, -50);
      expect(tooLow.audience_value).toBe(0);
    });

    it('rounds to the slider step', async () => {
      __seedBidirSliders(SLIDE, [{ ...SAMPLE[0]!, step: 5 }]);
      const updated = await adjustBidirSlider(SLIDE, `${SLIDE}__price`, 73);
      expect(updated.audience_value).toBe(75);
    });

    it('appends an adjustment entry', async () => {
      __seedBidirSliders(SLIDE, SAMPLE);
      await adjustBidirSlider(SLIDE, `${SLIDE}__price`, 80);
      const adj = await listBidirAdjustments(SLIDE);
      expect(adj).toHaveLength(1);
      expect(adj[0]!.slider_id).toBe(`${SLIDE}__price`);
      expect(adj[0]!.from_value).toBe(50);
      expect(adj[0]!.to_value).toBe(80);
      expect(adj[0]!.new_midpoint).toBe(65);
      expect(adj[0]!.actor.type).toBe('audience');
    });

    it('throws BidirServiceError for an unknown slider', async () => {
      __seedBidirSliders(SLIDE, SAMPLE);
      await expect(adjustBidirSlider(SLIDE, 'nope', 10)).rejects.toBeInstanceOf(
        BidirServiceError,
      );
    });
  });

  describe('syncPresenterValue', () => {
    it('updates only the presenter-side', async () => {
      __seedBidirSliders(SLIDE, SAMPLE);
      const updated = await syncPresenterValue(SLIDE, `${SLIDE}__price`, 90);
      expect(updated.presenter_value).toBe(90);
      expect(updated.audience_value).toBe(50);
      expect(updated.midpoint).toBe(70);
    });

    it('marks converged when presenter matches audience', async () => {
      __seedBidirSliders(SLIDE, SAMPLE);
      const updated = await syncPresenterValue(SLIDE, `${SLIDE}__price`, 51);
      expect(updated.converged).toBe(true);
    });

    it('throws when the slider does not exist', async () => {
      __seedBidirSliders(SLIDE, SAMPLE);
      await expect(syncPresenterValue(SLIDE, 'missing', 10)).rejects.toBeInstanceOf(
        BidirServiceError,
      );
    });
  });

  describe('listBidirAdjustments', () => {
    it('starts empty for a fresh slide', async () => {
      __seedBidirSliders(SLIDE, SAMPLE);
      const adj = await listBidirAdjustments(SLIDE);
      expect(adj).toHaveLength(0);
    });

    it('preserves chronological order', async () => {
      __seedBidirSliders(SLIDE, SAMPLE);
      await adjustBidirSlider(SLIDE, `${SLIDE}__price`, 60);
      await adjustBidirSlider(SLIDE, `${SLIDE}__price`, 70);
      await adjustBidirSlider(SLIDE, `${SLIDE}__price`, 80);
      const adj = await listBidirAdjustments(SLIDE);
      expect(adj.map((a) => a.to_value)).toEqual([60, 70, 80]);
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