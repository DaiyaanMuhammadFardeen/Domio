import { describe, it, expect } from 'vitest';
import { generateBarTerrain } from './BarTerrain.js';

function makeLod(level: 0 | 1 | 2 | 3) {
  return { level, triangleCount: 100, screenRadiusPx: 100, distance: 10 };
}

describe('generateBarTerrain', () => {
  it('generates bars from a 2x2 grid', () => {
    const grid = [[1, 2], [3, 4]];
    const result = generateBarTerrain({ grid }, makeLod(0));
    expect(result.bars).toHaveLength(4);
    expect(result.instanceCount).toBe(4);
  });

  it('positions bars correctly', () => {
    const grid = [[10]];
    const result = generateBarTerrain({ grid, spacingX: 2, spacingZ: 3 }, makeLod(0));
    const bar = result.bars[0]!;
    expect(bar.position.x).toBe(0);
    expect(bar.position.z).toBe(0);
    expect(bar.col).toBe(0);
    expect(bar.row).toBe(0);
  });

  it('normalises values', () => {
    const grid = [[0, 50, 100]];
    const result = generateBarTerrain({ grid }, makeLod(0));
    expect(result.bars[0]!.normalisedValue).toBe(0);
    expect(result.bars[1]!.normalisedValue).toBeCloseTo(0.5, 5);
    expect(result.bars[2]!.normalisedValue).toBe(1);
  });

  it('computes height from normalised value', () => {
    const grid = [[100]];
    const result = generateBarTerrain({ grid, maxHeight: 10 }, makeLod(0));
    expect(result.bars[0]!.height).toBeCloseTo(10, 5);
  });

  it('scales instances by LOD', () => {
    const grid = [[1, 2, 3, 4]];
    const r0 = generateBarTerrain({ grid }, makeLod(0));
    const r1 = generateBarTerrain({ grid }, makeLod(1));
    expect(r0.instanceCount).toBe(4);
    expect(r1.instanceCount).toBe(2);
  });
});
