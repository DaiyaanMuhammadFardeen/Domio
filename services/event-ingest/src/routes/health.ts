/**
 * Event-ingest — health/metrics routes (Phase 17 W1).
 */

import { Hono } from 'hono';
import type { IngestDeps } from '../deps.js';

export function healthRoutes(deps: IngestDeps): Hono {
  const app = new Hono();

  app.get(
    '/healthz',
    () =>
      new Response(JSON.stringify({ ok: true, service: 'event-ingest' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
  );

  app.get('/readyz', async (c) => {
    const kafkaOk = deps.publisher.ready();
    const spoolBytes = await deps.spool.size();
    return c.json({
      ok: kafkaOk || spoolBytes < 100 * 1024 * 1024, // ready if Kafka is up OR spool is small
      kafka: kafkaOk,
      spool_bytes: spoolBytes,
    });
  });

  app.get(
    '/metrics',
    () =>
      new Response(deps.metrics.render(), {
        status: 200,
        headers: { 'content-type': 'text/plain; version=0.0.4; charset=utf-8' },
      }),
  );

  return app;
}
