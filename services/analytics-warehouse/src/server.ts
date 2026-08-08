/**
 * Analytics-warehouse — Hono app factory (Phase 17 W2).
 */

import { Hono } from 'hono';
import type { ClickHouseClient } from './client/clickhouse.js';
import { restRoutes, graphqlRoute } from './routes/analytics.js';
import { healthRoutes } from './routes/health.js';
import type { AnalyticsDao } from './dao/queries.js';

export interface AppDeps {
  ch: ClickHouseClient;
  dao: AnalyticsDao;
}

export function buildApp(deps: AppDeps): Hono {
  const app = new Hono();

  app.onError((err, c) => {
    const message = err instanceof Error ? err.message : String(err);
    return c.json({ error: { code: 'internal_error', message } }, 500);
  });

  app.route('/', healthRoutes(deps.ch));
  app.route('/', restRoutes({ dao: deps.dao }));
  app.route('/', graphqlRoute({ dao: deps.dao }));

  return app;
}
