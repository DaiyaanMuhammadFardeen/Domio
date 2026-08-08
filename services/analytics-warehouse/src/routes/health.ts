/**
 * Analytics-warehouse — health endpoints (Phase 17 W2).
 */

import { Hono } from 'hono';
import type { ClickHouseClient } from '../client/clickhouse.js';

export function healthRoutes(ch: ClickHouseClient): Hono {
  const app = new Hono();

  app.get('/healthz', (c) => {
    return c.json({ ok: true });
  });

  app.get('/readyz', async (c) => {
    const ok = await ch.ping();
    if (!ok) {
      return c.json({ ok: false, ready: false, error: 'clickhouse_unreachable' }, 503);
    }
    return c.json({ ok: true, ready: true });
  });

  return app;
}