import { describe, it, expect } from 'vitest';
import {
  moveDelta,
  resizeDelta,
  rotateDelta,
  makeTransformDelta,
} from '../src/commands/transform.js';
import { asULID, type Transform2D } from '@domio/schema';

describe('transform commands', () => {
  const id = asULID('01H00000000000000000000001');
  const base: Transform2D = { x: 0, y: 0, w: 100, h: 100, rotation: 0, scale: 1 };

  it('moveDelta adds dx/dy', () => {
    expect(moveDelta(base, 10, 20)).toEqual({ ...base, x: 10, y: 20 });
  });

  it('resizeDelta on the east handle grows width', () => {
    expect(resizeDelta(base, 'e', 50)).toEqual({ ...base, w: 150 });
  });

  it('resizeDelta on the south handle grows height', () => {
    expect(resizeDelta(base, 's', 50)).toEqual({ ...base, h: 150 });
  });

  it('rotateDelta updates rotation', () => {
    expect(rotateDelta(base, 90).rotation).toBe(90);
  });

  it('makeTransformDelta captures the from/to pair', () => {
    const delta = makeTransformDelta(id, base, { ...base, x: 10, y: 20 }, 'move');
    expect(delta.kind).toBe('move');
    expect(delta.from.x).toBe(0);
    expect(delta.to.x).toBe(10);
  });
});
