/**
 * Event-ingest — Hono app assembly (Phase 17 W1).
 *
 * Mirrors services/registry/src/server.ts so a single Hono + node:http
 * pattern works across the platform.
 */

import { Hono } from 'hono';
import type { IngestDeps } from './deps.js';
import { toIngestError } from './errors.js';
import { eventsRoutes } from './routes/events.js';
import { healthRoutes } from './routes/health.js';

export function buildApp(deps: IngestDeps): Hono {
  const app = new Hono();

  app.onError((err, c) => {
    const wrapped = toIngestError(err);
    deps.metrics.recordRoute('error', wrapped.status);
    return c.json({ error: { code: wrapped.code, message: wrapped.message } }, wrapped.status);
  });

  app.route('/', healthRoutes(deps));
  app.route('/', eventsRoutes(deps));

  return app;
}