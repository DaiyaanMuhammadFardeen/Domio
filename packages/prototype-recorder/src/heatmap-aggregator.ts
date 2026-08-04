/**
 * Heatmap aggregator — aggregates clicks, dwell time, and slide-drop
 * rates onto a discretized grid over the canvas viewport.
 *
 * Cell size defaults to 64×64 in canvas-relative normalized space
 * (`width * 64` cells, `height * 64` cells). Output is a flat list of
 * cells — the renderer scales to its own size.
 */

import type { HeatCell, HeatmapBucket, RecorderEvent } from './types.js';

const GRID = 64; // cells per unit of normalized viewport (per axis)

export class HeatmapAggregator {
  private readonly width: number;
  private readonly height: number;
  private readonly cells: Map<string, HeatCell> = new Map();
  private lastSlideEnter: number | null = null;
  private lastHoverAt: Map<string, number> = new Map();

  constructor(opts: { width?: number; height?: number } = {}) {
    this.width = opts.width ?? GRID;
    this.height = opts.height ?? GRID;
  }

  /** Reset all cell counts. */
  reset(): void {
    this.cells.clear();
    this.lastSlideEnter = null;
    this.lastHoverAt.clear();
  }

  /** Feed one or many events. */
  feed(events: readonly RecorderEvent[]): void {
    for (const e of events) this.feedOne(e);
  }

  feedOne(event: RecorderEvent): void {
    if (event.eventType === 'click') {
      const x = Number(event.payload['x']);
      const y = Number(event.payload['y']);
      if (Number.isFinite(x) && Number.isFinite(y)) {
        this.bump(x, y, 'clicks', 1);
        // Rage-click heuristic: rapid clicks in same cell.
        const repeats = Number(event.payload['repeats'] ?? 0);
        if (repeats > 2) {
          this.bump(x, y, 'slideDrops', 1);
        }
      }
    }
    if (event.eventType === 'slide_enter') {
      this.lastSlideEnter = event.createdAt;
    }
    if (event.eventType === 'slide_exit') {
      const dwell = Number(event.payload['dwellMs'] ?? 0);
      if (this.lastSlideEnter !== null && dwell < 3000) {
        // A slide drop: tally at the slide's centroid (we use 0.5, 0.5
        // as a placeholder — real impl uses slide-specific coords).
        this.bump(0.5, 0.5, 'slideDrops', 1);
      }
      this.lastSlideEnter = null;
    }
    if (event.eventType === 'hover') {
      const x = Number(event.payload['x']);
      const y = Number(event.payload['y']);
      const key = `${x},${y}`;
      const prev = this.lastHoverAt.get(key);
      if (typeof x === 'number' && typeof y === 'number') {
        if (prev !== undefined) {
          const dwell = event.createdAt - prev;
          this.bump(x, y, 'dwellMs', dwell);
        }
        this.lastHoverAt.set(key, event.createdAt);
      }
    }
  }

  /** Number of unique cells with at least one interaction. */
  size(): number { return this.cells.size; }

  /** Serialize to a heatmap bucket. */
  toBucket(): HeatmapBucket {
    return {
      width: this.width,
      height: this.height,
      cells: Array.from(this.cells.values()),
    };
  }

  private bump(x: number, y: number, key: 'clicks' | 'dwellMs' | 'slideDrops', by: number): void {
    const cellX = Math.max(0, Math.min(this.width - 1, Math.floor(x * this.width)));
    const cellY = Math.max(0, Math.min(this.height - 1, Math.floor(y * this.height)));
    const ck = `${cellX}:${cellY}`;
    const existing = this.cells.get(ck);
    const nx = cellX / this.width;
    const ny = cellY / this.height;
    if (!existing) {
      this.cells.set(ck, {
        x: nx,
        y: ny,
        clicks: key === 'clicks' ? by : 0,
        dwellMs: key === 'dwellMs' ? by : 0,
        slideDrops: key === 'slideDrops' ? by : 0,
      });
      return;
    }
    this.cells.set(ck, {
      ...existing,
      clicks: existing.clicks + (key === 'clicks' ? by : 0),
      dwellMs: existing.dwellMs + (key === 'dwellMs' ? by : 0),
      slideDrops: existing.slideDrops + (key === 'slideDrops' ? by : 0),
    });
  }
}
