import { describe, it, expect } from 'vitest';
import {
  latLonToUnitSphere,
  interpolateArc,
  generateGlobe,
  generateArc,
} from './GlobePlot.js';

describe('latLonToUnitSphere', () => {
  it('maps (0, 0) to (1, 0, 0)', () => {
    const p = latLonToUnitSphere(0, 0);
    expect(p.x).toBeCloseTo(1, 5);
    expect(p.y).toBeCloseTo(0, 5);
    expect(p.z).toBeCloseTo(0, 5);
  });

  it('maps north pole (90, 0) to (0, 0, 1)', () => {
    const p = latLonToUnitSphere(90, 0);
    expect(p.x).toBeCloseTo(0, 5);
    expect(p.y).toBeCloseTo(0, 5);
    expect(p.z).toBeCloseTo(1, 5);
  });

  it('maps south pole (-90, 0) to (0, 0, -1)', () => {
    const p = latLonToUnitSphere(-90, 0);
    expect(p.x).toBeCloseTo(0, 5);
    expect(p.y).toBeCloseTo(0, 5);
    expect(p.z).toBeCloseTo(-1, 5);
  });

  it('maps (0, 90) to (0, 1, 0)', () => {
    const p = latLonToUnitSphere(0, 90);
    expect(p.x).toBeCloseTo(0, 5);
    expect(p.y).toBeCloseTo(1, 5);
    expect(p.z).toBeCloseTo(0, 5);
  });

  it('result is on the unit sphere', () => {
    const p = latLonToUnitSphere(45, 135);
    const len = Math.sqrt(p.x ** 2 + p.y ** 2 + p.z ** 2);
    expect(len).toBeCloseTo(1.0, 5);
  });
});

describe('interpolateArc', () => {
  it('returns the from point at t=0', () => {
    const a = interpolateArc(
      { lat: 0, lon: 0 },
      { lat: 90, lon: 0 },
      0,
    );
    expect(a.x).toBeCloseTo(1, 4);
    expect(a.z).toBeCloseTo(0, 4);
  });

  it('returns the to point at t=1', () => {
    const a = interpolateArc(
      { lat: 0, lon: 0 },
      { lat: 90, lon: 0 },
      1,
    );
    expect(a.z).toBeCloseTo(1, 4);
  });

  it('stays on the unit sphere', () => {
    const a = interpolateArc(
      { lat: 0, lon: 0 },
      { lat: 90, lon: 90 },
      0.5,
    );
    const len = Math.sqrt(a.x ** 2 + a.y ** 2 + a.z ** 2);
    expect(len).toBeCloseTo(1.0, 4);
  });
});

describe('generateGlobe', () => {
  it('generates positions for all points', () => {
    const points = [
      { lat: 0, lon: 0 },
      { lat: 45, lon: 90 },
      { lat: -30, lon: -60 },
    ];
    const lod = { level: 0 as const, triangleCount: 100, screenRadiusPx: 100, distance: 10 };
    const result = generateGlobe(points, lod);
    expect(result.positions).toHaveLength(3);
    expect(result.instanceCount).toBe(3);
  });

  it('scales instances by LOD level', () => {
    const points = Array.from({ length: 100 }, (_, i) => ({
      lat: (i % 10) * 18 - 81,
      lon: Math.floor(i / 10) * 36 - 162,
    }));
    const lod0 = { level: 0 as const, triangleCount: 100, screenRadiusPx: 100, distance: 10 };
    const lod1 = { level: 1 as const, triangleCount: 100, screenRadiusPx: 100, distance: 10 };
    const r0 = generateGlobe(points, lod0);
    const r1 = generateGlobe(points, lod1);
    expect(r0.instanceCount).toBe(100);
    expect(r1.instanceCount).toBe(50);
  });
});

describe('generateArc', () => {
  it('generates correct number of segments', () => {
    const arc = {
      from: { lat: 0, lon: 0 },
      to: { lat: 90, lon: 0 },
    };
    const pts = generateArc(arc, 10);
    expect(pts).toHaveLength(11);
  });
});
