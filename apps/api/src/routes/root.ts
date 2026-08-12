import { Hono } from 'hono';

/**
 * Root routes — landing JSON for unauthenticated GETs.
 *
 * Returns the service's identity, version, and endpoint inventory so
 * operators can verify a deployment without auth.
 */

const root = new Hono();

root.get('/', (c) =>
  c.json({
    name: 'domio-api',
    version: '0.0.0',
    phase: 'Domio control plane',
    docs: 'https://github.com/DaiyaanMuhammadFardeen/Domio/tree/main/docs',
    endpoints: {
      healthz: 'GET /healthz',
      readyz: 'GET /readyz',
      decks: 'GET /v1/decks/:org_id/:tenant_id/:deck_id',
    },
  }),
);

export { root as rootRoutes };