/**
 * Heatmap generator — Hono app factory (Phase 17 W5).
 */

import { Hono } from 'hono';
import type { HeatmapDeps } from './deps.js';
import { heatmapRoutes } from './routes/heatmap.js';
import { healthRoutes } from './routes/health.js';

export function buildApp(deps: HeatmapDeps): Hono {
  const app = new Hono();
  app.onError((err, c) => {
    const message = err instanceof Error ? err.message : String(err);
    return c.json({ error: { code: 'internal_error', message } }, 500);
  });
  app.route('/', healthRoutes(deps.ch));
  app.route('/', heatmapRoutes({ store: deps.store, grid: deps.grid }));
  return app;
}
