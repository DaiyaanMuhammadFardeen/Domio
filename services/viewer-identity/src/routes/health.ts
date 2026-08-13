/**
 * Viewer-identity — health endpoints (Phase 17 W3).
 */

import { Hono } from 'hono';

export function healthRoutes(): Hono {
  const app = new Hono();
  app.get('/healthz', (c) => c.json({ ok: true }));
  app.get('/readyz', (c) => c.json({ ok: true, ready: true }));
  return app;
}
