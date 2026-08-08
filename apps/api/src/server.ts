/**
 * Domio control plane — Phase 0 stub.
 *
 * This is intentionally minimal: it exposes the wire-format contracts
 * (health, readiness, deck placeholder) so the monorepo boots end-to-end.
 * No business modules, no auth, no Postgres writes. Real modules land
 * in Phase 02+.
 */

import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { logger } from 'hono/logger';
import { cors } from 'hono/cors';
import { healthRoutes } from './routes/health.js';
import { deckRoutes } from './routes/decks.js';
import { rootRoutes } from './routes/root.js';
import { annotationRoutes } from './routes/annotations.js';
import { handoverRoutes } from './routes/presenter_handover.js';
import { failoverRoutes } from './routes/failover.js';
import { shutdown as shutdownObservability } from './observability.js';

const app = new Hono();

app.use('*', logger());
app.use('*', cors({ origin: ['http://localhost:3000'], credentials: true }));

app.route('/', rootRoutes);
app.route('/', healthRoutes);
app.route('/v1/decks', deckRoutes);
app.route('/', annotationRoutes);
app.route('/', handoverRoutes);
app.route('/', failoverRoutes);

const port = Number(process.env.PORT ?? 8080);
const host = process.env.HOST ?? '0.0.0.0';

serve({ fetch: app.fetch, port, hostname: host }, (info) => {
  console.log(`domio-api listening on http://${info.address}:${info.port}`);
});

// Graceful shutdown — flush OTLP buffers.
const onSignal = (sig: string) => () => {
  console.log(`received ${sig}, shutting down`);
  shutdownObservability()
    .catch((err: unknown) => console.error('observability shutdown error', err))
    .finally(() => process.exit(0));
};
process.once('SIGINT', onSignal('SIGINT'));
process.once('SIGTERM', onSignal('SIGTERM'));