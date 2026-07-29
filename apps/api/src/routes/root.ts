import { Hono } from 'hono';

/**
 * Root routes — landing JSON for unauthenticated GETs.
 *
 * Real auth + tenant routing lands in Phase 20.
 */

const root = new Hono();

root.get('/', (c) =>
  c.json({
    name: 'domio-api',
    version: '0.0.0',
    phase: 'Phase 0 — Repository, contracts, dev environment',
    docs: 'https://github.com/DaiyaanMuhammadFardeen/Domio/tree/main/docs',
    endpoints: {
      healthz: 'GET /healthz',
      readyz: 'GET /readyz',
      decks: 'GET /v1/decks/:org_id/:tenant_id/:deck_id',
    },
  }),
);

export { root as rootRoutes };