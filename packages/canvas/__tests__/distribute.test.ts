import { describe, it, expect } from 'vitest';
import { distributeEvenly, distributeToCanvas } from '../src/guides/distribute.js';
import { asULID, type Transform2D } from '@domio/schema';

describe('distribute', () => {
  const idA = asULID('01H00000000000000000000010');
  const idB = asULID('01H00000000000000000000011');
  const idC = asULID('01H00000000000000000000012');

  it('equalizes spacing horizontally', () => {
    const entries = [
      { id: idA, transform: { x: 0, y: 0, w: 100, h: 50, rotation: 0, scale: 1 } as Transform2D },
      { id: idB, transform: { x: 200, y: 0, w: 100, h: 50, rotation: 0, scale: 1 } as Transform2D },
      { id: idC, transform: { x: 600, y: 0, w: 100, h: 50, rotation: 0, scale: 1 } as Transform2D },
    ];
    const out = distributeEvenly(entries, 'horizontal');
    expect(out).toHaveLength(3);
    expect(out[0]!.transform.x).toBe(0);
    expect(out[1]!.transform.x).toBe(300);
    expect(out[2]!.transform.x).toBe(600);
  });

  it('fills canvas width with distributeToCanvas', () => {
    const entries = [
      { id: idA, transform: { x: 0, y: 0, w: 100, h: 50, rotation: 0, scale: 1 } as Transform2D },
      { id: idB, transform: { x: 200, y: 0, w: 100, h: 50, rotation: 0, scale: 1 } as Transform2D },
    ];
    const out = distributeToCanvas(entries, { x: 0, y: 0, w: 600, h: 50 }, 'horizontal');
    expect(out[0]!.transform.x).toBe(0);
    expect(out[1]!.transform.x).toBe(500);
  });
});
