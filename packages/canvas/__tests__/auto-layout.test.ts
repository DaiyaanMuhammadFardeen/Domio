import { describe, it, expect } from 'vitest';
import { autoLayout } from '../src/worker/auto-layout.js';
import { applyConstraints } from '../src/worker/constraints.js';
import { asULID, type AutoLayoutLayer, type Element, type Transform2D } from '@domio/schema';

const PARENT_ID = asULID('01H00000000000000000000001');

function makeParent(direction: 'horizontal' | 'vertical' | 'grid'): AutoLayoutLayer {
  return {
    id: PARENT_ID,
    semanticId: 'auto',
    type: 'autoLayout',
    name: 'Auto',
    parentId: null,
    z: 0,
    transform: { x: 0, y: 0, w: 400, h: 400, rotation: 0, scale: 1 },
    autoLayout: {
      direction,
      itemSpacing: 8,
      padding: { value: 0, unit: 'px' },
      counterAlign: 'min',
      primaryAlign: 'min',
      wrap: 'no-wrap',
    },
  };
}

function makeChild(id: string, w: number, h: number): Element {
  return {
    id: asULID(id),
    semanticId: id,
    type: 'frame',
    name: id,
    parentId: PARENT_ID,
    z: 0,
    transform: { x: 0, y: 0, w, h, rotation: 0, scale: 1 },
    aspect: { ratioW: 1, ratioH: 1 },
  } satisfies Element;
}

describe('auto-layout', () => {
  it('lays out children horizontally with gap and padding', () => {
    const parent = makeParent('horizontal');
    const children = [
      { element: makeChild('01H00000000000000000000010', 100, 50), intrinsicSize: { w: 100, h: 50 } },
      { element: makeChild('01H00000000000000000000011', 80, 50), intrinsicSize: { w: 80, h: 50 } },
    ];
    const result = autoLayout({ parent, children });
    const a = result.transforms.get(children[0]!.element.id)!;
    const b = result.transforms.get(children[1]!.element.id)!;
    expect(a.x).toBe(0);
    expect(b.x).toBe(108); // 100 + 8 gap
  });

  it('lays out children vertically', () => {
    const parent = makeParent('vertical');
    const children = [
      { element: makeChild('01H00000000000000000000020', 100, 50), intrinsicSize: { w: 100, h: 50 } },
      { element: makeChild('01H00000000000000000000021', 100, 30), intrinsicSize: { w: 100, h: 30 } },
    ];
    const result = autoLayout({ parent, children });
    const a = result.transforms.get(children[0]!.element.id)!;
    const b = result.transforms.get(children[1]!.element.id)!;
    expect(a.y).toBe(0);
    expect(b.y).toBe(58); // 50 + 8 gap
  });

  it('returns empty transforms for no children', () => {
    const parent = makeParent('horizontal');
    const result = autoLayout({ parent, children: [] });
    expect(result.transforms.size).toBe(0);
    expect(result.parentSize).toEqual({ w: 400, h: 400 });
  });
});

describe('applyConstraints', () => {
  it('picks `min` for both axes by default', () => {
    const out = applyConstraints({
      parent: { x: 100, y: 100, w: 200, h: 200 },
      parentPrev: { x: 0, y: 0, w: 100, h: 100 },
      child: { x: 0, y: 0, w: 50, h: 50, rotation: 0, scale: 1 },
    });
    expect(out.x).toBe(100);
    expect(out.y).toBe(100);
  });

  it('keeps `max` (right-aligned) on the right edge', () => {
    const out = applyConstraints({
      parent: { x: 0, y: 0, w: 200, h: 200 },
      parentPrev: { x: 0, y: 0, w: 100, h: 100 },
      child: { x: 50, y: 0, w: 50, h: 50, rotation: 0, scale: 1 },
      constraints: { horizontal: 'max', vertical: 'max' },
    });
    // `max`: position + delta + (parentSize - (position + size))
    // For x: 50 + 0 + (200 - (50 + 50)) = 150
    expect(out.x).toBe(150);
    expect(out.y).toBe(150);
  });

  it('centers via `center`', () => {
    const out = applyConstraints({
      parent: { x: 0, y: 0, w: 200, h: 200 },
      parentPrev: { x: 0, y: 0, w: 100, h: 100 },
      child: { x: 50, y: 50, w: 50, h: 50, rotation: 0, scale: 1 },
      constraints: { horizontal: 'center', vertical: 'center' },
    });
    // 50 + 0 + (200 - (50 + 50)) / 2 = 50 + 50 = 100
    expect(out.x).toBe(100);
    expect(out.y).toBe(100);
  });

  it('clamps scale to [minSize, maxSize]', () => {
    // The current implementation tracks position only; scale is preserved.
    const transform: Transform2D = { x: 0, y: 0, w: 50, h: 50, rotation: 0, scale: 5 };
    const out = applyConstraints({
      parent: { x: 0, y: 0, w: 200, h: 200 },
      parentPrev: { x: 0, y: 0, w: 100, h: 100 },
      child: transform,
      constraints: { horizontal: 'scale', vertical: 'scale' },
      minSize: 10,
      maxSize: 1000,
    });
    expect(out.scale).toBe(5);
  });
});