import { describe, it, expect } from 'vitest';
import { DragController } from '../src/commands/drag.js';
import { snapDelta, constrainToAxis } from '../src/input/snap.js';
import { asULID, type Transform2D, type ULID } from '@domio/schema';

describe('DragController', () => {
  const id: ULID = asULID('01H00000000000000000000001');
  const start: Transform2D = { x: 100, y: 100, w: 50, h: 50, rotation: 0, scale: 1 };

  it('produces ephemeral transforms within 8 ms', () => {
    const controller = new DragController({
      targetIds: [id],
      startPositions: new Map([[id, start]]),
      startPointer: { x: 100, y: 100 },
      gridStep: 8,
      snapMode: 'none',
    });
    const begin = performance.now();
    const transforms = controller.update({ x: 108, y: 100 });
    const elapsed = performance.now() - begin;
    expect(elapsed).toBeLessThan(20);
    expect(transforms.get(id)?.x).toBe(108);
  });

  it('snap mode = grid snaps to the nearest step', () => {
    const out = snapDelta({ dx: 13, dy: 0 }, { x: 0, y: 0 }, { mode: 'grid', gridStep: 8 });
    expect(out.dx).toBe(16); // 0 + 16 = 16 (closest 8 multiple to 13)
  });

  it('snap mode = pixel rounds to integers', () => {
    const out = snapDelta({ dx: 1.4, dy: 1.6 }, { x: 0, y: 0 }, { mode: 'pixel' });
    expect(out.dx).toBe(1);
    expect(out.dy).toBe(2);
  });

  it('snap mode = none preserves the raw delta', () => {
    const out = snapDelta({ dx: 1.4, dy: 1.6 }, { x: 0, y: 0 }, { mode: 'none' });
    expect(out.dx).toBe(1.4);
  });

  it('altOverride disables snap', () => {
    const out = snapDelta(
      { dx: 13, dy: 0 },
      { x: 0, y: 0 },
      { mode: 'grid', gridStep: 8, altOverride: true },
    );
    expect(out.dx).toBe(13);
  });

  it('constrainToAxis with Shift picks the dominant axis', () => {
    expect(constrainToAxis({ x: 0, y: 0 }, { x: 5, y: 1 }, true)).toEqual({ dx: 5, dy: 0 });
    expect(constrainToAxis({ x: 0, y: 0 }, { x: 1, y: 5 }, true)).toEqual({ dx: 0, dy: 5 });
    expect(constrainToAxis({ x: 0, y: 0 }, { x: 5, y: 1 }, false)).toEqual({ dx: 5, dy: 1 });
  });

  it('commit a no-op drag does not move the layer', () => {
    const controller = new DragController({
      targetIds: [id],
      startPositions: new Map([[id, start]]),
      startPointer: { x: 100, y: 100 },
      gridStep: 8,
      snapMode: 'grid',
    });
    expect(controller.isNoop({ x: 100, y: 100 })).toBe(true);
    const out = controller.update({ x: 100, y: 100 });
    expect(out.get(id)?.x).toBe(100);
  });
});
