import { describe, it, expect } from 'vitest';
import type { Dataset, BindingSchema } from '../types.js';
import { hitTest, hitTestBar, hitTestPoint } from '../interaction/hit-test.js';
import { drill, drillMultiple } from '../interaction/drill.js';
import { toggleSeries, toggleElement } from '../interaction/toggle-series.js';
import { brushZoom, brushZoomByValue } from '../interaction/brush-zoom.js';
import type { SvgElement } from '../types.js';

function el(semanticId: string, x: number, y: number, w: number, h: number): SvgElement {
  return { id: `id-${semanticId}`, kind: 'rect', semanticId, x, y, width: w, height: h };
}

describe('hitTest', () => {
  it('finds element inside bounding box', () => {
    const elements = [el('bar_0', 10, 10, 50, 50)];
    const hit = hitTest(elements, 20, 20);
    expect(hit).not.toBeNull();
    expect(hit!.element.semanticId).toBe('bar_0');
    expect(hit!.distance).toBe(0);
  });

  it('finds nearest element outside bounding box', () => {
    const elements = [el('bar_0', 10, 10, 50, 50)];
    const hit = hitTest(elements, 80, 35, 50);
    expect(hit).not.toBeNull();
    expect(hit!.element.semanticId).toBe('bar_0');
  });

  it('returns null when no element nearby', () => {
    const elements = [el('bar_0', 10, 10, 50, 50)];
    const hit = hitTest(elements, 500, 500, 10);
    expect(hit).toBeNull();
  });
});

describe('hitTestBar', () => {
  it('finds bar by index', () => {
    const elements = [el('bar_0', 10, 10, 40, 80), el('bar_1', 60, 10, 40, 80)];
    expect(hitTestBar(elements, 30, 50)).toBe(0);
    expect(hitTestBar(elements, 80, 50)).toBe(1);
  });

  it('returns null for no bar', () => {
    const elements = [el('label_0', 10, 10, 40, 20)];
    expect(hitTestBar(elements, 30, 20)).toBeNull();
  });
});

describe('hitTestPoint', () => {
  it('finds point by index', () => {
    const elements = [el('point_0', 10, 10, 8, 8), el('point_1', 60, 10, 8, 8)];
    expect(hitTestPoint(elements, 14, 14)).toBe(0);
  });
});

describe('drill', () => {
  it('filters rows by column value', () => {
    const ds: Dataset = {
      columns: [{ name: 'cat', type: 'string' }, { name: 'val', type: 'number' }],
      rows: [
        { cat: 'A', val: 10 },
        { cat: 'B', val: 20 },
        { cat: 'A', val: 30 },
      ],
    };
    const b: BindingSchema = { type: 'bar', columns: [{ role: 'x', column: 'cat' }, { role: 'y', column: 'val' }] };
    const result = drill(ds, b, 'cat', 'A');
    expect(result.dataset.rows.length).toBe(2);
    expect(result.dataset.rows.every((r) => r.cat === 'A')).toBe(true);
  });
});

describe('drillMultiple', () => {
  it('filters by multiple criteria', () => {
    const ds: Dataset = {
      columns: [{ name: 'cat', type: 'string' }, { name: 'sub', type: 'string' }, { name: 'val', type: 'number' }],
      rows: [
        { cat: 'A', sub: 'X', val: 10 },
        { cat: 'A', sub: 'Y', val: 20 },
        { cat: 'B', sub: 'X', val: 30 },
      ],
    };
    const b: BindingSchema = { type: 'bar', columns: [{ role: 'x', column: 'cat' }, { role: 'y', column: 'val' }] };
    const result = drillMultiple(ds, b, { cat: 'A', sub: 'X' });
    expect(result.dataset.rows.length).toBe(1);
    expect(result.dataset.rows[0]!.val).toBe(10);
  });
});

describe('toggleSeries', () => {
  it('toggles visibility of matching elements', () => {
    const elements = [el('bar_0', 0, 0, 10, 10), el('bar_1', 0, 0, 10, 10), el('label_0', 0, 0, 10, 10)];
    const toggled = toggleSeries(elements, 'bar');
    expect(toggled[0]!.visible).toBe(false);
    expect(toggled[1]!.visible).toBe(false);
    expect(toggled[2]!.visible).not.toBe(false);
  });

  it('toggles back on second call', () => {
    const elements = [el('bar_0', 0, 0, 10, 10)];
    const first = toggleSeries(elements, 'bar');
    const second = toggleSeries(first, 'bar');
    expect(second[0]!.visible).toBe(true);
  });
});

describe('toggleElement', () => {
  it('toggles single element', () => {
    const elements = [el('bar_0', 0, 0, 10, 10)];
    const toggled = toggleElement(elements, 'bar_0');
    expect(toggled[0]!.visible).toBe(false);
  });
});

describe('brushZoom', () => {
  it('filters to range', () => {
    const ds: Dataset = {
      columns: [{ name: 'label', type: 'string' }, { name: 'value', type: 'number' }],
      rows: [
        { label: 'A', value: 10 },
        { label: 'B', value: 20 },
        { label: 'C', value: 30 },
        { label: 'D', value: 40 },
      ],
    };
    const b: BindingSchema = { type: 'bar', columns: [{ role: 'x', column: 'label' }, { role: 'y', column: 'value' }] };
    const result = brushZoom(ds, b, { start: 1, end: 2 });
    expect(result.rows.length).toBe(2);
    expect(result.rows[0]!.label).toBe('B');
    expect(result.rows[1]!.label).toBe('C');
  });
});

describe('brushZoomByValue', () => {
  it('filters by numeric range', () => {
    const ds: Dataset = {
      columns: [{ name: 'x', type: 'number' }, { name: 'y', type: 'number' }],
      rows: [
        { x: 1, y: 10 },
        { x: 5, y: 20 },
        { x: 10, y: 30 },
      ],
    };
    const b: BindingSchema = { type: 'scatter', columns: [{ role: 'x', column: 'x' }, { role: 'y', column: 'y' }] };
    const result = brushZoomByValue(ds, b, 'x', 3, 8);
    expect(result.rows.length).toBe(1);
    expect(result.rows[0]!.x).toBe(5);
  });
});
