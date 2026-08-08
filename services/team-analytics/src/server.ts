/**
 * Team-analytics — Hono app factory (Phase 17 W9).
 */

import { Hono } from 'hono';
import type { ClickHouseClient } from './store/clickhouse.js';
import type { TemplateDao } from './store/templates.js';
import { teamRoutes } from './routes/team.js';

export interface TeamAppDeps {
  ch: ClickHouseClient;
  dao: TemplateDao;
}

export function buildApp(deps: TeamAppDeps): Hono {
  const app = new Hono();
  app.onError((err, c) => {
    const message = err instanceof Error ? err.message : String(err);
    return c.json({ error: { code: 'internal_error', message } }, 500);
  });
  app.route('/', teamRoutes(deps));
  return app;
}