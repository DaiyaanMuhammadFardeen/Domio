import { describe, it, expect } from 'vitest';
import { getUpAxisRotation, needsUpAxisConversion } from './UpAxis.js';
import {
  getUnitScale,
  convertUnits,
  convertUnitsVec3,
} from './UnitScale.js';

// ---------------------------------------------------------------------------
// UpAxis tests
// ---------------------------------------------------------------------------

describe('UpAxis', () => {
  it('y-up returns identity quaternion', () => {
    const q = getUpAxisRotation({ upAxis: 'y-up' });
    expect(q.x).toBe(0);
    expect(q.y).toBe(0);
    expect(q.z).toBe(0);
    expect(q.w).toBe(1);
  });

  it('z-up returns ~90° rotation around X axis', () => {
    const q = getUpAxisRotation({ upAxis: 'z-up' });
    // -π/4 for half angle: sin(-π/4) = -√2/2, cos(-π/4) = √2/2
    const expected = Math.sqrt(2) / 2;
    expect(Math.abs(q.x - (-expected))).toBeLessThan(1e-10);
    expect(q.y).toBe(0);
    expect(q.z).toBe(0);
    expect(Math.abs(q.w - expected)).toBeLessThan(1e-10);
  });

  it('manual override returns identity even for z-up', () => {
    const q = getUpAxisRotation({ upAxis: 'z-up', manualOverride: true });
    expect(q.x).toBe(0);
    expect(q.w).toBe(1);
  });

  it('needsUpAxisConversion returns true for z-up', () => {
    expect(needsUpAxisConversion({ upAxis: 'z-up' })).toBe(true);
  });

  it('needsUpAxisConversion returns false for y-up', () => {
    expect(needsUpAxisConversion({ upAxis: 'y-up' })).toBe(false);
  });

  it('needsUpAxisConversion returns false with manual override', () => {
    expect(needsUpAxisConversion({ upAxis: 'z-up', manualOverride: true })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// UnitScale tests
// ---------------------------------------------------------------------------

describe('UnitScale', () => {
  it('meters to meters is identity', () => {
    expect(getUnitScale('meters', 'meters')).toBe(1.0);
  });

  it('centimeters to meters divides by 100', () => {
    expect(getUnitScale('centimeters', 'meters')).toBe(0.01);
  });

  it('millimeters to meters divides by 1000', () => {
    expect(getUnitScale('millimeters', 'meters')).toBe(0.001);
  });

  it('inches to meters converts correctly', () => {
    expect(getUnitScale('inches', 'meters')).toBeCloseTo(0.0254, 6);
  });

  it('centimeters to millimeters multiplies by 10', () => {
    expect(getUnitScale('centimeters', 'millimeters')).toBeCloseTo(10, 6);
  });

  it('convertUnits applies scale factor', () => {
    expect(convertUnits(100, 'centimeters', 'meters')).toBeCloseTo(1.0, 6);
    expect(convertUnits(1, 'meters', 'centimeters')).toBeCloseTo(100, 6);
  });

  it('convertUnitsVec3 applies scale factor to all components', () => {
    const result = convertUnitsVec3(
      { x: 100, y: 200, z: 300 },
      'centimeters',
      'meters',
    );
    expect(result.x).toBeCloseTo(1.0, 6);
    expect(result.y).toBeCloseTo(2.0, 6);
    expect(result.z).toBeCloseTo(3.0, 6);
  });
});
