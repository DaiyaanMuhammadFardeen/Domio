import { describe, it, expect } from 'vitest';
import { applyConstraints, clampSize } from '../src/worker/constraints.js';

describe('constraints', () => {
  it('applies left-pin (horizontal: min)', () => {
    const out = applyConstraints({
      parent: { x: 200, y: 100, w: 600, h: 400 },
      parentPrev: { x: 100, y: 100, w: 300, h: 200 },
      child: { x: 50, y: 50, w: 100, h: 100, rotation: 0, scale: 1 },
      constraints: { horizontal: 'min', vertical: 'min' },
    });
    expect(out.x).toBe(150); // 50 + 100
    expect(out.y).toBe(50);
  });

  it('applies right-pin (horizontal: max)', () => {
    const out = applyConstraints({
      parent: { x: 0, y: 0, w: 600, h: 400 },
      parentPrev: { x: 0, y: 0, w: 300, h: 200 },
      child: { x: 50, y: 50, w: 100, h: 100, rotation: 0, scale: 1 },
      constraints: { horizontal: 'max', vertical: 'min' },
    });
    expect(out.x).toBe(500); // 50 + 0 + (600 - (50 + 100))
  });

  it('applies center', () => {
    const out = applyConstraints({
      parent: { x: 0, y: 0, w: 600, h: 400 },
      parentPrev: { x: 0, y: 0, w: 300, h: 200 },
      child: { x: 50, y: 50, w: 100, h: 100, rotation: 0, scale: 1 },
      constraints: { horizontal: 'center', vertical: 'center' },
    });
    expect(out.x).toBe(275); // 50 + 0 + (600 - (50 + 100)) / 2
  });

  it('applies stretch (position deltas only; size handled separately)', () => {
    const out = applyConstraints({
      parent: { x: 0, y: 0, w: 600, h: 400 },
      parentPrev: { x: 0, y: 0, w: 300, h: 200 },
      child: { x: 50, y: 50, w: 100, h: 100, rotation: 0, scale: 1 },
      constraints: { horizontal: 'stretch', vertical: 'stretch' },
    });
    expect(out.x).toBe(50);
    expect(out.y).toBe(50);
  });

  it('clamps scale size to [minSize, maxSize]', () => {
    expect(clampSize(5, 10, 100)).toBe(10);
    expect(clampSize(500, 10, 100)).toBe(100);
    expect(clampSize(50, 10, 100)).toBe(50);
  });

  it('pinToCorners preserves the absolute offset', () => {
    const out = applyConstraints({
      parent: { x: 200, y: 100, w: 600, h: 400 },
      parentPrev: { x: 100, y: 50, w: 300, h: 200 },
      child: { x: 150, y: 75, w: 100, h: 100, rotation: 0, scale: 1 },
      constraints: { horizontal: 'min', vertical: 'min', pinToCorners: true },
    });
    expect(out.x).toBe(250); // 200 + 150 - 100
    expect(out.y).toBe(125); // 100 + 75 - 50
  });
});
