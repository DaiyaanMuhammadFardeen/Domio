/**
 * Heatmap generator — REST routes (Phase 17 W5).
 *
 * Exposes:
 *   GET /v1/heatmap/:workspace_id/:deck_id/:slide_id?date=YYYY-MM-DD&format=json|png
 *
 * JSON shape:
 *   {
 *     deck_id,
 *     slide_id,
 *     bucket,
 *     grid_width,
 *     grid_height,
 *     tiles: [{ x, y, dwell_ms, viewers, pause_count }],
 *     total_dwell_ms,
 *     total_viewer_touches
 *   }
 *
 * PNG: 32×18 RGB truecolor PNG (one pixel per tile, blue→red warmth).
 *
 * For multi-day windows we read multiple rollup buckets from ClickHouse
 * and stitch them via the aggregator.
 */

import { Hono } from 'hono';
import type { HeatmapStore } from '../store/clickhouse.js';
import { aggregate, buildExport, stitchBuckets } from '../engine/aggregator.js';
import { encodeHeatmapPng } from '../engine/png_export.js';
import type { AggregatorConfig } from '../engine/aggregator.js';
import { HEATMAP_GRID_HEIGHT, HEATMAP_GRID_WIDTH } from '../types.js';

export interface HeatmapRouteDeps {
  store: HeatmapStore;
  grid: AggregatorConfig;
}

export function heatmapRoutes(deps: HeatmapRouteDeps): Hono {
  const app = new Hono();

  app.get('/v1/heatmap/:workspace_id/:deck_id/:slide_id', async (c) => {
    const workspace_id = c.req.param('workspace_id');
    const deck_id = c.req.param('deck_id');
    const slide_id = c.req.param('slide_id');

    if (!workspace_id || !deck_id || !slide_id) {
      return c.json({ error: { code: 'bad_request', message: 'missing path param' } }, 400);
    }

    const from = c.req.query('from_date') ?? c.req.query('date') ?? today();
    const to = c.req.query('to_date') ?? from;
    const format = (c.req.query('format') ?? 'json').toLowerCase();

    if (format !== 'json' && format !== 'png') {
      return c.json({ error: { code: 'bad_request', message: `unknown format: ${format}` } }, 400);
    }

    const dates = enumerateDates(from, to);

    let exportShape;
    try {
      if (dates.length === 1) {
        const rows = await deps.store.fetchDay(workspace_id, deck_id, slide_id, dates[0]!);
        const agg = aggregate(rows, deps.grid);
        exportShape = buildExport(deck_id, slide_id, dates[0]!, agg, deps.grid);
      } else {
        const perBucketRows = await Promise.all(
          dates.map((d) => deps.store.fetchDay(workspace_id, deck_id, slide_id, d)),
        );
        exportShape = stitchBuckets(deck_id, slide_id, dates, perBucketRows, deps.grid);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ error: { code: 'upstream_error', message } }, 502);
    }

    if (format === 'png') {
      const png = encodeHeatmapPng(exportShape);
      return c.body(png, 200, {
        'content-type': 'image/png',
        'cache-control': 'public, max-age=60',
      });
    }
    return c.json(exportShape, 200);
  });

  app.get('/v1/heatmap/:workspace_id/:deck_id', async (c) => {
    const workspace_id = c.req.param('workspace_id');
    const deck_id = c.req.param('deck_id');
    if (!workspace_id || !deck_id) {
      return c.json({ error: { code: 'bad_request', message: 'missing path param' } }, 400);
    }
    const date = c.req.query('date') ?? today();
    const rows = await deps.store.fetchDeckDay(workspace_id, deck_id, date);
    // Group by slide_id.
    const bySlide = new Map<string, typeof rows>();
    for (const r of rows) {
      const arr = bySlide.get(r.slide_id) ?? [];
      arr.push(r);
      bySlide.set(r.slide_id, arr);
    }
    const out: Record<string, ReturnType<typeof buildExport>> = {};
    for (const [slide_id, slideRows] of bySlide) {
      const agg = aggregate(slideRows, deps.grid);
      out[slide_id] = buildExport(deck_id, slide_id, date, agg, deps.grid);
    }
    return c.json({ deck_id, bucket: date, slides: out }, 200);
  });

  return app;
}

export function defaultGrid(): AggregatorConfig {
  return { gridWidth: HEATMAP_GRID_WIDTH, gridHeight: HEATMAP_GRID_HEIGHT };
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Enumerate YYYY-MM-DD strings inclusive of `from` and `to`. We refuse
 * ranges longer than 366 days so a malformed request can't drag the
 * service to its knees.
 */
export function enumerateDates(from: string, to: string): string[] {
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  if (Number.isNaN(start) || Number.isNaN(end)) {
    throw new Error(`bad date range: from=${from} to=${to}`);
  }
  if (end < start) {
    throw new Error(`bad date range: from > to (${from} > ${to})`);
  }
  const out: string[] = [];
  const day = 24 * 60 * 60 * 1000;
  const maxDays = 366;
  for (let t = start; t <= end; t += day) {
    if (out.length >= maxDays) {
      throw new Error(`date range exceeds ${maxDays} days`);
    }
    out.push(new Date(t).toISOString().slice(0, 10));
  }
  return out;
}
