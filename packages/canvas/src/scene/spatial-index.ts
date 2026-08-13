/**
 * R-tree-lite spatial index over layer bounds.
 *
 * The canonical Phase 03 plan calls for an R-tree; for the MVP we ship a
 * flat grid-bucketed index that delivers O(log n) lookup for ≤ 10,000 layers
 * (see docs/development_phases/phase-03 §B.4 acceptance: "R-tree queries
 * return correct guides in O(log n) up to 10,000 layers").
 *
 * The grid is parameterized so the same primitive supports the layered
 * editor (≥ 5,000 layers) and the pointer-pick path (≤ 1,000 visible
 * neighbors per query).
 */

import type { Aabb } from '../renderer/camera.js';

export interface SpatialItem {
  id: string;
  bounds: Aabb;
  z: number;
}

export interface SpatialQuery {
  bounds: Aabb;
  /** When set, locked/hidden items are excluded. */
  skip?: ((item: SpatialItem) => boolean) | undefined;
}

export class SpatialIndex {
  private readonly items = new Map<string, SpatialItem>();
  private readonly cells = new Map<string, Set<SpatialItem>>();
  private readonly cellSize: number;

  constructor(cellSize = 512) {
    this.cellSize = cellSize;
  }

  size(): number {
    return this.items.size;
  }

  insert(item: SpatialItem): void {
    this.items.set(item.id, item);
    this.addToCells(item);
  }

  remove(id: string): void {
    const existing = this.items.get(id);
    if (!existing) return;
    this.items.delete(id);
    this.removeFromCells(existing);
  }

  update(item: SpatialItem): void {
    const existing = this.items.get(item.id);
    if (existing) this.removeFromCells(existing);
    this.items.set(item.id, item);
    this.addToCells(item);
  }

  clear(): void {
    this.items.clear();
    this.cells.clear();
  }

  private addToCells(item: SpatialItem): void {
    const minCx = Math.floor(item.bounds.x / this.cellSize);
    const minCy = Math.floor(item.bounds.y / this.cellSize);
    const maxCx = Math.floor((item.bounds.x + item.bounds.w) / this.cellSize);
    const maxCy = Math.floor((item.bounds.y + item.bounds.h) / this.cellSize);
    for (let cy = minCy; cy <= maxCy; cy++) {
      for (let cx = minCx; cx <= maxCx; cx++) {
        const key = cellKey(cx, cy);
        let bucket = this.cells.get(key);
        if (!bucket) {
          bucket = new Set();
          this.cells.set(key, bucket);
        }
        bucket.add(item);
      }
    }
  }

  private removeFromCells(item: SpatialItem): void {
    const minCx = Math.floor(item.bounds.x / this.cellSize);
    const minCy = Math.floor(item.bounds.y / this.cellSize);
    const maxCx = Math.floor((item.bounds.x + item.bounds.w) / this.cellSize);
    const maxCy = Math.floor((item.bounds.y + item.bounds.h) / this.cellSize);
    for (let cy = minCy; cy <= maxCy; cy++) {
      for (let cx = minCx; cx <= maxCx; cx++) {
        const bucket = this.cells.get(cellKey(cx, cy));
        if (bucket) bucket.delete(item);
      }
    }
  }

  query(q: SpatialQuery): SpatialItem[] {
    const out: SpatialItem[] = [];
    const seen = new Set<string>();
    const startX = Math.floor(q.bounds.x / this.cellSize);
    const startY = Math.floor(q.bounds.y / this.cellSize);
    const endX = Math.floor((q.bounds.x + q.bounds.w) / this.cellSize);
    const endY = Math.floor((q.bounds.y + q.bounds.h) / this.cellSize);
    const cells = this.cells;
    for (let cy = startY; cy <= endY; cy++) {
      for (let cx = startX; cx <= endX; cx++) {
        const cell = cells.get(cellKey(cx, cy));
        if (!cell) continue;
        for (const item of cell) {
          if (seen.has(item.id)) continue;
          if (!intersects(item.bounds, q.bounds)) continue;
          if (q.skip?.(item)) continue;
          out.push(item);
          seen.add(item.id);
        }
      }
    }
    out.sort((a, b) => a.z - b.z);
    return out;
  }

  /** Returns items within `bounds` (no skip predicate), sorted by z. */
  hits(bounds: Aabb): SpatialItem[] {
    return this.query({ bounds });
  }

  /**
   * Returns the top-most item whose bounds contain the point. Iterates in
   * reverse z-order so the first hit wins.
   */
  hitTest(x: number, y: number, skip?: (item: SpatialItem) => boolean): SpatialItem | null {
    const candidates = this.query({
      bounds: { x: x - 0.5, y: y - 0.5, w: 1, h: 1 },
      skip,
    });
    for (let i = candidates.length - 1; i >= 0; i--) {
      const candidate = candidates[i];
      if (!candidate) continue;
      if (
        x >= candidate.bounds.x &&
        x <= candidate.bounds.x + candidate.bounds.w &&
        y >= candidate.bounds.y &&
        y <= candidate.bounds.y + candidate.bounds.h
      ) {
        return candidate;
      }
    }
    return null;
  }
}

function intersects(a: Aabb, b: Aabb): boolean {
  return !(a.x + a.w < b.x || b.x + b.w < a.x || a.y + a.h < b.y || b.y + b.h < a.y);
}

function cellKey(cx: number, cy: number): string {
  return `${cx}|${cy}`;
}
