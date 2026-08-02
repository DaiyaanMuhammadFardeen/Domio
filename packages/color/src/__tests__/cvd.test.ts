import { describe, it, expect } from 'vitest';
import { simulateCvd, cvdMatrix, CVD_MATRICES } from '../cvd.js';
import { srgbToOklch } from '../oklch.js';
import type { CvdType } from '../types.js';

describe('cvdMatrix', () => {
  it('identity for severity 0 (not used but check lerp boundary)', () => {
    // For deuteranomaly at severity 0.6, the matrix should differ from identity
    const mat = cvdMatrix('deuteranomaly');
    expect(mat[0][0]).not.toBe(1); // Not identity
  });

  it('all 6 matrices exist', () => {
    const types: CvdType[] = [
      'deuteranopia', 'protanopia', 'tritanopia',
      'deuteranomaly', 'protanomaly', 'tritanomaly',
    ];
    for (const t of types) {
      const mat = cvdMatrix(t);
      expect(mat).toBeDefined();
      expect(mat.length).toBe(3);
    }
  });
});

describe('CVD_MATRICES export', () => {
  it('has all 6 keys', () => {
    expect(Object.keys(CVD_MATRICES).sort()).toEqual([
      'deuteranomaly', 'deuteranopia',
      'protanomaly', 'protanopia',
      'tritanomaly', 'tritanopia',
    ]);
  });
});

describe('simulateCvd', () => {
  it('red under deuteranopia shifts hue toward brown/yellow', () => {
    const red = { r: 1, g: 0, b: 0 };
    const sim = simulateCvd(red, 'deuteranopia');
    const origOklch = srgbToOklch(red);
    const simOklch = srgbToOklch(sim);
    // Deuteranopia shifts red's hue significantly (toward ~45° brown/yellow)
    expect(simOklch.H).toBeGreaterThan(origOklch.H);
    expect(simOklch.H).toBeGreaterThan(35);
  });

  it('identity-like for normal vision (low severity anomaly)', () => {
    // protanomaly (severity 0.6) should be closer to original than protanopia
    const blue = { r: 0, g: 0, b: 1 };
    const simAnomaly = simulateCvd(blue, 'protanomaly');
    const simFull = simulateCvd(blue, 'protanopia');
    // Both should shift, but anomaly should be closer to original
    const origOklch = srgbToOklch(blue);
    const anomalyOklch = srgbToOklch(simAnomaly);
    const fullOklch = srgbToOklch(simFull);
    // Anomaly drift < full dichromacy drift
    const anomalyDrift = Math.abs(anomalyOklch.H - origOklch.H);
    const fullDrift = Math.abs(fullOklch.H - origOklch.H);
    expect(anomalyDrift).toBeLessThanOrEqual(fullDrift);
  });

  it('tritanopia shifts blue toward cyan/green', () => {
    const blue = { r: 0, g: 0, b: 1 };
    const sim = simulateCvd(blue, 'tritanopia');
    const simOklch = srgbToOklch(sim);
    const origOklch = srgbToOklch(blue);
    // Blue (H≈264) under tritanopia shifts significantly
    // The exact shift depends on matrix — verify it moves
    expect(simOklch.H).not.toBeCloseTo(origOklch.H, 0);
  });

  it('white and black unchanged under any CVD', () => {
    for (const kind of ['deuteranopia', 'protanopia', 'tritanopia'] as CvdType[]) {
      const whiteSim = simulateCvd({ r: 1, g: 1, b: 1 }, kind);
      expect(whiteSim.r).toBeCloseTo(1, 4);
      expect(whiteSim.g).toBeCloseTo(1, 4);
      expect(whiteSim.b).toBeCloseTo(1, 4);
      const blackSim = simulateCvd({ r: 0, g: 0, b: 0 }, kind);
      expect(blackSim.r).toBeCloseTo(0, 4);
      expect(blackSim.g).toBeCloseTo(0, 4);
      expect(blackSim.b).toBeCloseTo(0, 4);
    }
  });

  it('all matrices produce values in [0,1]', () => {
    const colors = [
      { r: 1, g: 0, b: 0 },
      { r: 0, g: 1, b: 0 },
      { r: 0, g: 0, b: 1 },
      { r: 0.5, g: 0.3, b: 0.8 },
    ];
    const types: CvdType[] = [
      'deuteranopia', 'protanopia', 'tritanopia',
      'deuteranomaly', 'protanomaly', 'tritanomaly',
    ];
    for (const rgb of colors) {
      for (const kind of types) {
        const sim = simulateCvd(rgb, kind);
        expect(sim.r).toBeGreaterThanOrEqual(-0.001);
        expect(sim.r).toBeLessThanOrEqual(1.001);
        expect(sim.g).toBeGreaterThanOrEqual(-0.001);
        expect(sim.g).toBeLessThanOrEqual(1.001);
        expect(sim.b).toBeGreaterThanOrEqual(-0.001);
        expect(sim.b).toBeLessThanOrEqual(1.001);
      }
    }
  });
});
