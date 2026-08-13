import { Hono } from 'hono';

/**
 * Health and readiness routes.
 *
 * `/healthz` is process liveness — returns 200 as long as the process
 * serves HTTP. Does not check downstream deps.
 *
 * `/readyz` is process readiness — returns 200 when every critical
 * downstream dependency is reachable. In Phase 0 we always return 200
 * (the stack is reachable if you're talking to us). Real checks land
 * in Phase 01 (observability) and Phase 02 (db connection).
 */

const startedAt = Date.now();

const health = new Hono();

health.get('/healthz', (c) => {
  const uptime = Math.floor((Date.now() - startedAt) / 1000);
  return c.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'domio-api',
    version: '0.0.0',
    uptime_seconds: uptime,
    components: [],
  });
});

health.get('/readyz', (c) => {
  // Phase 0: always ready once the process is alive.
  // Phase 01 will check Postgres, Redis, NATS, S3 connectivity.
  return c.json({
    status: 'healthy',
    ready: true,
    timestamp: new Date().toISOString(),
    service: 'domio-api',
    version: '0.0.0',
    components: [],
    not_ready_reasons: [],
  });
});

export { health as healthRoutes };
