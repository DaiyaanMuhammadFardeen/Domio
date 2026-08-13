import { describe, it, expect } from 'vitest';
import { snapToGrid, DEFAULT_GRID, columnPosition } from '../src/grid/grid.js';

describe('grid', () => {
  it('snapToGrid with square spec rounds to the grid step', () => {
    expect(snapToGrid(13, { kind: 'square', size: 8 })).toBe(16);
    expect(snapToGrid(11, { kind: 'square', size: 8 })).toBe(8);
  });

  it('snapToGrid with baseline spec rounds to the baseline', () => {
    expect(snapToGrid(13, { kind: 'baseline', baseline: 4 })).toBe(12);
  });

  it('columnPosition returns a deterministic position', () => {
    expect(columnPosition(0, { kind: 'columns', columns: 12, size: 8 })).toBe(0);
    expect(columnPosition(1, { kind: 'columns', columns: 12, size: 8 })).toBe(16);
  });

  it('DEFAULT_GRID uses square 8 px', () => {
    expect(DEFAULT_GRID).toEqual({ kind: 'square', size: 8 });
    expect(snapToGrid(10, DEFAULT_GRID)).toBe(8);
  });
});
