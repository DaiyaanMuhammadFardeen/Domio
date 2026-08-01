/**
 * Grid systems. See docs/development_phases/phase-03 §C.6: square,
 * columns, baseline. Column grids apply to auto-layout.
 */

export type GridKind = 'square' | 'columns' | 'baseline';

export interface GridSpec {
  kind: GridKind;
  size?: number;
  columns?: number;
  rowHeight?: number;
  baseline?: number;
}

export const DEFAULT_GRID: GridSpec = { kind: 'square', size: 8 };

export function snapToGrid(value: number, spec: GridSpec = DEFAULT_GRID): number {
  if (spec.kind === 'square' && spec.size) {
    return Math.round(value / spec.size) * spec.size;
  }
  if (spec.kind === 'columns' && spec.columns) {
    const step = spec.size ?? 8;
    return Math.round(value / step) * step;
  }
  if (spec.kind === 'baseline' && spec.baseline) {
    return Math.round(value / spec.baseline) * spec.baseline;
  }
  return value;
}

export function columnPosition(column: number, spec: GridSpec & { columns: number; size: number }): number {
  return Math.floor(column * (spec.size * 2));
}