/**
 * Heatmap generator — HTTP route tests (Phase 17 W5).
 */

import { describe, expect, it } from 'vitest';
import type { Hono } from 'hono';
import { enumerateDates, heatmapRoutes } from './heatmap.js';
import type { HeatmapStore } from '../store/clickhouse.js';
import type { HeatmapRow } from '../types.js';

function buildApp(store: HeatmapStore): Hono {
  return heatmapRoutes({ store, grid: { gridWidth: 32, gridHeight: 18 } });
}

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

describe('heatmapRoutes — JSON export shape', () => {
  it('returns the documented shape for a single day', async () => {
    const calls: Array<[string, string, string, string]> = [];
    const store: HeatmapStore = {
      fetchDay: async (w, d, s, b) => {
        calls.push(['day', w, d + '/' + s, b]);
        return [row({ tile_x: 5, tile_y: 9, impressions: 2, pause_total_ms: 500 })];
      },
      fetchRange: async () => [],
      fetchDeckDay: async () => [],
    };
    const app = buildApp(store);
    const res = await app.request('http://x/v1/heatmap/ws-1/deck-1/slide-1?date=2026-01-15');
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.deck_id).toBe('deck-1');
    expect(body.slide_id).toBe('slide-1');
    expect(body.bucket).toBe('2026-01-15');
    expect(body.grid_width).toBe(32);
    expect(body.grid_height).toBe(18);
    expect(Array.isArray(body.tiles)).toBe(true);
    const tiles = body.tiles as Array<Record<string, unknown>>;
    expect(tiles[0]).toEqual({ x: 5, y: 9, dwell_ms: 500, viewers: 2, pause_count: 0 });
    expect(typeof body.total_dwell_ms).toBe('number');
    expect(typeof body.total_viewer_touches).toBe('number');
    expect(calls).toEqual([['day', 'ws-1', 'deck-1/slide-1', '2026-01-15']]);
  });

  it('rejects unknown format with 400', async () => {
    const store: HeatmapStore = {
      fetchDay: async () => [],
      fetchRange: async () => [],
      fetchDeckDay: async () => [],
    };
    const app = buildApp(store);
    const res = await app.request('http://x/v1/heatmap/ws-1/deck-1/slide-1?date=2026-01-15&format=csv');
    expect(res.status).toBe(400);
    const body = (await res.json()) as Record<string, unknown>;
    expect((body.error as Record<string, string>).code).toBe('bad_request');
  });

  it('returns PNG bytes when format=png', async () => {
    const store: HeatmapStore = {
      fetchDay: async () => [row({ tile_x: 0, tile_y: 0, impressions: 1, pause_total_ms: 100 })],
      fetchRange: async () => [],
      fetchDeckDay: async () => [],
    };
    const app = buildApp(store);
    const res = await app.request('http://x/v1/heatmap/ws-1/deck-1/slide-1?date=2026-01-15&format=png');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/png');
    const buf = Buffer.from(await res.arrayBuffer());
    // PNG signature.
    expect(buf[0]).toBe(0x89);
    expect(buf[1]).toBe(0x50);
    expect(buf[2]).toBe(0x4e);
    expect(buf[3]).toBe(0x47);
  });

  it('returns per-slide exports for a deck day', async () => {
    const store: HeatmapStore = {
      fetchDay: async () => [],
      fetchRange: async () => [],
      fetchDeckDay: async (_w, _d, b) => [
        row({ tile_x: 1, tile_y: 1, impressions: 1, pause_total_ms: 50, slide_id: 'a', bucket: b }),
        row({ tile_x: 2, tile_y: 2, impressions: 2, pause_total_ms: 80, slide_id: 'b', bucket: b }),
      ],
    };
    const app = buildApp(store);
    const res = await app.request('http://x/v1/heatmap/ws-1/deck-1?date=2026-01-15');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { deck_id: string; bucket: string; slides: Record<string, { tiles: unknown[]; deck_id: string; slide_id: string; bucket: string }> };
    expect(body.deck_id).toBe('deck-1');
    expect(body.bucket).toBe('2026-01-15');
    expect(Object.keys(body.slides).sort()).toEqual(['a', 'b']);
    expect(body.slides.a!.deck_id).toBe('deck-1');
    expect(body.slides.a!.slide_id).toBe('a');
    expect(body.slides.a!.bucket).toBe('2026-01-15');
    expect(body.slides.a!.tiles.length).toBe(1);
    expect(body.slides.b!.tiles.length).toBe(1);
  });
});

describe('enumerateDates', () => {
  it('returns a single date when from === to', () => {
    expect(enumerateDates('2026-01-15', '2026-01-15')).toEqual(['2026-01-15']);
  });

  it('returns the inclusive range', () => {
    expect(enumerateDates('2026-01-15', '2026-01-17')).toEqual([
      '2026-01-15',
      '2026-01-16',
      '2026-01-17',
    ]);
  });

  it('throws on bad input', () => {
    expect(() => enumerateDates('not-a-date', '2026-01-15')).toThrow();
    expect(() => enumerateDates('2026-01-15', 'not-a-date')).toThrow();
    expect(() => enumerateDates('2026-01-16', '2026-01-15')).toThrow();
  });

  it('refuses ranges longer than 366 days', () => {
    expect(() => enumerateDates('2024-01-01', '2026-01-01')).toThrow(/366/);
  });
});