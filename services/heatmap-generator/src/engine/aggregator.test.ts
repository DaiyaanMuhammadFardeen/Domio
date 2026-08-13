/**
 * Heatmap generator — aggregator tests (Phase 17 W5).
 */

import { describe, expect, it } from 'vitest';
import { aggregate, buildExport, stitchBuckets } from './aggregator.js';
import type { HeatmapRow } from '../types.js';

function row(partial: Partial<HeatmapRow> & Pick<HeatmapRow, 'tile_x' | 'tile_y'>): HeatmapRow {
  return {
    workspace_id: 'ws-1',
    deck_id: 'deck-1',
    slide_id: 'slide-1',
    bucket: '2026-01-01',
    impressions: 0,
    pause_count: 0,
    pause_total_ms: 0,
    scrollthrough_ms: 0,
    ...partial,
  };
}

describe('heatmap aggregator', () => {
  it('returns no buckets for empty input', () => {
    const agg = aggregate([]);
    expect(agg.size).toBe(0);
  });

  it('groups duplicate (slide, x, y) rows by summing engagement fields', () => {
    const rows: HeatmapRow[] = [
      row({
        tile_x: 1,
        tile_y: 2,
        impressions: 5,
        pause_count: 2,
        pause_total_ms: 1000,
        scrollthrough_ms: 2000,
      }),
      // Same key — appears before SummingMergeTree flush.
      row({
        tile_x: 1,
        tile_y: 2,
        impressions: 3,
        pause_count: 1,
        pause_total_ms: 500,
        scrollthrough_ms: 700,
      }),
      row({
        tile_x: 3,
        tile_y: 4,
        impressions: 7,
        pause_count: 0,
        pause_total_ms: 0,
        scrollthrough_ms: 900,
      }),
    ];
    const agg = aggregate(rows);
    expect(agg.size).toBe(2);
    const a = agg.get('slide-1|1|2');
    expect(a).toBeDefined();
    expect(a!.impressions).toBe(8);
    expect(a!.pause_count).toBe(3);
    expect(a!.pause_total_ms).toBe(1500);
    expect(a!.scrollthrough_ms).toBe(2700);
  });

  it('drops out-of-grid coordinates', () => {
    const rows: HeatmapRow[] = [
      row({ tile_x: 0, tile_y: 0, impressions: 1, pause_total_ms: 10 }),
      row({ tile_x: 32, tile_y: 0, impressions: 1, pause_total_ms: 10 }),
      row({ tile_x: 0, tile_y: 18, impressions: 1, pause_total_ms: 10 }),
      row({ tile_x: -1, tile_y: 0, impressions: 1, pause_total_ms: 10 }),
    ];
    const agg = aggregate(rows, { gridWidth: 32, gridHeight: 18 });
    expect(agg.size).toBe(1);
  });

  it('drops negative engagement fields (defensive parse)', () => {
    const rows: HeatmapRow[] = [
      row({ tile_x: 0, tile_y: 0, impressions: -1, pause_total_ms: 10 }),
      row({ tile_x: 0, tile_y: 0, impressions: 1, pause_total_ms: -5 }),
    ];
    const agg = aggregate(rows);
    expect(agg.size).toBe(0);
  });

  it('passes through distinct slide_ids without merging', () => {
    const rows: HeatmapRow[] = [
      row({ slide_id: 'a', tile_x: 0, tile_y: 0, impressions: 1, pause_total_ms: 10 }),
      row({ slide_id: 'b', tile_x: 0, tile_y: 0, impressions: 1, pause_total_ms: 10 }),
    ];
    const agg = aggregate(rows);
    expect(agg.size).toBe(2);
    expect(agg.get('a|0|0')).toBeDefined();
    expect(agg.get('b|0|0')).toBeDefined();
  });
});

describe('heatmap buildExport', () => {
  it('omits zero-engagement tiles', () => {
    const rows: HeatmapRow[] = [
      row({ tile_x: 0, tile_y: 0, impressions: 1, pause_total_ms: 10 }),
      row({
        tile_x: 1,
        tile_y: 0,
        impressions: 0,
        pause_count: 0,
        pause_total_ms: 0,
        scrollthrough_ms: 0,
      }),
    ];
    const agg = aggregate(rows);
    const exp = buildExport('deck-1', 'slide-1', '2026-01-01', agg);
    expect(exp.tiles.length).toBe(1);
    expect(exp.tiles[0]).toEqual({ x: 0, y: 0, dwell_ms: 10, viewers: 1, pause_count: 0 });
  });

  it('sorts tiles by (y, x)', () => {
    const rows: HeatmapRow[] = [
      row({ tile_x: 5, tile_y: 1, impressions: 1, pause_total_ms: 10 }),
      row({ tile_x: 0, tile_y: 0, impressions: 1, pause_total_ms: 10 }),
      row({ tile_x: 2, tile_y: 0, impressions: 1, pause_total_ms: 10 }),
      row({ tile_x: 0, tile_y: 1, impressions: 1, pause_total_ms: 10 }),
    ];
    const agg = aggregate(rows);
    const exp = buildExport('deck-1', 'slide-1', '2026-01-01', agg);
    expect(exp.tiles.map((t) => `${t.x},${t.y}`)).toEqual(['0,0', '2,0', '0,1', '5,1']);
  });

  it('summarizes total_dwell_ms and total_viewer_touches', () => {
    const rows: HeatmapRow[] = [
      row({ tile_x: 0, tile_y: 0, impressions: 2, pause_total_ms: 100 }),
      row({ tile_x: 1, tile_y: 0, impressions: 4, pause_total_ms: 250 }),
      row({ tile_x: 2, tile_y: 0, impressions: 1, pause_total_ms: 50 }),
    ];
    const agg = aggregate(rows);
    const exp = buildExport('deck-1', 'slide-1', '2026-01-01', agg);
    expect(exp.total_dwell_ms).toBe(400);
    expect(exp.total_viewer_touches).toBe(7);
  });

  it('embeds deck_id, slide_id, bucket, grid dims', () => {
    const exp = buildExport('deck-1', 'slide-1', '2026-01-01', new Map(), {
      gridWidth: 32,
      gridHeight: 18,
    });
    expect(exp.deck_id).toBe('deck-1');
    expect(exp.slide_id).toBe('slide-1');
    expect(exp.bucket).toBe('2026-01-01');
    expect(exp.grid_width).toBe(32);
    expect(exp.grid_height).toBe(18);
  });
});

describe('heatmap stitchBuckets', () => {
  it('merges rows across buckets for the same tile', () => {
    const day1: HeatmapRow[] = [
      row({ tile_x: 0, tile_y: 0, impressions: 3, pause_total_ms: 100, bucket: '2026-01-01' }),
    ];
    const day2: HeatmapRow[] = [
      row({ tile_x: 0, tile_y: 0, impressions: 5, pause_total_ms: 200, bucket: '2026-01-02' }),
    ];
    const exp = stitchBuckets('deck-1', 'slide-1', ['2026-01-01', '2026-01-02'], [day1, day2]);
    expect(exp.tiles.length).toBe(1);
    expect(exp.tiles[0]!.dwell_ms).toBe(300);
    expect(exp.tiles[0]!.viewers).toBe(8);
    expect(exp.bucket).toBe('2026-01-01..2026-01-02');
  });

  it('single-bucket range produces just the date', () => {
    const rows: HeatmapRow[] = [row({ tile_x: 0, tile_y: 0, impressions: 1, pause_total_ms: 10 })];
    const exp = stitchBuckets('deck-1', 'slide-1', ['2026-01-01'], [rows]);
    expect(exp.bucket).toBe('2026-01-01');
  });
});
