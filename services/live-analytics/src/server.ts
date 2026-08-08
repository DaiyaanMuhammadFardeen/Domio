/**
 * Live-analytics — Hono app factory (Phase 17 W10).
 */

import { Hono } from 'hono';
import type { Orchestrator } from './orchestrator.js';
import { liveRoutes } from './routes/live.js';

export interface LiveAppDeps {
  orch: Orchestrator;
}

export function buildApp(deps: LiveAppDeps): Hono {
  const app = new Hono();
  app.onError((err, c) => {
    const message = err instanceof Error ? err.message : String(err);
    return c.json({ error: { code: 'internal_error', message } }, 500);
  });
  app.route('/', liveRoutes(deps));
  return app;
}