/**
 * Heatmap generator — health route (Phase 17 W5).
 */

import { Hono } from 'hono';
import type { HeatmapClient } from '../store/clickhouse.js';

export function healthRoutes(ch: HeatmapClient): Hono {
  const app = new Hono();
  app.get('/health', async (c) => {
    const ok = await ch.ping().catch(() => false);
    return c.json(
      { status: ok ? 'ok' : 'degraded', clickhouse: ok, service: 'heatmap-generator' },
      ok ? 200 : 503,
    );
  });
  return app;
}
