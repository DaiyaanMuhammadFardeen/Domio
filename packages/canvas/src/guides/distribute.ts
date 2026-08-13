/**
 * Distribution — equalize spacing between layers. See
 * docs/development_phases/phase-03 §C.3 (`evenly` and `toCanvas` modes).
 */

import type { Transform2D } from '@domio/schema';
import type { Aabb } from '../renderer/camera.js';

export type DistributeMode = 'horizontal' | 'vertical';

export interface DistributeEntry {
  id: string;
  transform: Transform2D;
}

export function distributeEvenly(
  entries: DistributeEntry[],
  mode: DistributeMode,
): DistributeEntry[] {
  if (entries.length < 3) return entries;
  const sorted = [...entries].sort((a, b) =>
    mode === 'horizontal' ? a.transform.x - b.transform.x : a.transform.y - b.transform.y,
  );
  const first = sorted[0]!.transform;
  const last = sorted[sorted.length - 1]!.transform;
  const totalSpan = mode === 'horizontal' ? last.x + last.w - first.x : last.y + last.h - first.y;
  const totalSize = sorted.reduce(
    (sum, t) => sum + (mode === 'horizontal' ? t.transform.w : t.transform.h),
    0,
  );
  const gap = (totalSpan - totalSize) / (sorted.length - 1);
  let cursor = mode === 'horizontal' ? first.x : first.y;
  return sorted.map((entry) => {
    const next: DistributeEntry = { id: entry.id, transform: { ...entry.transform } };
    if (mode === 'horizontal') {
      next.transform.x = cursor;
      cursor += entry.transform.w + gap;
    } else {
      next.transform.y = cursor;
      cursor += entry.transform.h + gap;
    }
    return next;
  });
}

export function distributeToCanvas(
  entries: DistributeEntry[],
  canvas: Aabb,
  mode: DistributeMode,
): DistributeEntry[] {
  if (entries.length < 2) return entries;
  const sorted = [...entries].sort((a, b) =>
    mode === 'horizontal' ? a.transform.x - b.transform.x : a.transform.y - b.transform.y,
  );
  const totalSize = sorted.reduce(
    (sum, t) => sum + (mode === 'horizontal' ? t.transform.w : t.transform.h),
    0,
  );
  const span = (mode === 'horizontal' ? canvas.w : canvas.h) - totalSize;
  const gap = Math.max(0, span / (sorted.length - 1));
  let cursor = mode === 'horizontal' ? canvas.x : canvas.y;
  return sorted.map((entry) => {
    const next: DistributeEntry = { id: entry.id, transform: { ...entry.transform } };
    if (mode === 'horizontal') {
      next.transform.x = cursor;
      cursor += entry.transform.w + gap;
    } else {
      next.transform.y = cursor;
      cursor += entry.transform.h + gap;
    }
    return next;
  });
}
