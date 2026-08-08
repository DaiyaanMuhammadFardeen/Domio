/**
 * Domio control plane — Phase 0 stub + Phase 18 service mounting.
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

// Phase 18 — P18 service mounting
import { createP18Services } from './p18_services.js';
import { collabRoutes } from './routes/p18/collab.js';
import { permissionRoutes } from './routes/p18/permissions.js';
import { suggestionRoutes } from './routes/p18/suggestions.js';
import { mergeRequestRoutes } from './routes/p18/merge_requests.js';
import { libraryRoutes } from './routes/p18/library.js';
import { expiryRoutes } from './routes/p18/expiry.js';
import { meetingRoutes } from './routes/p18/meeting.js';
import { calendarRoutes } from './routes/p18/calendar.js';
import { taskRoutes } from './routes/p18/tasks.js';
import { guestsRoutes } from './routes/p18/guests.js';

const app = new Hono();

app.use('*', logger());
app.use('*', cors({ origin: ['http://localhost:3000'], credentials: true }));

// ── Phase 0 routes ──────────────────────────────────────────────────────
app.route('/', rootRoutes);
app.route('/', healthRoutes);
app.route('/v1/decks', deckRoutes);
app.route('/', annotationRoutes);
app.route('/', handoverRoutes);
app.route('/', failoverRoutes);

// ── Phase 18 routes ─────────────────────────────────────────────────────
const p18 = createP18Services();

// collab — comments, approvals, assignments (multi-prefix: /v1/decks/…, /v1/comments/…, /v1/users/…)
app.route('/', collabRoutes(p18.collab));

// permissions — /v1/permissions/grants, /v1/permissions/check
app.route('/v1/permissions', permissionRoutes(p18.permissions));

// suggestions — /v1/decks/…/suggestions, /v1/suggestions/…
app.route('/', suggestionRoutes(p18.suggestions));

// merge-requests — /v1/decks/…/merge-requests, /v1/merge-requests/…
app.route('/', mergeRequestRoutes(p18.mergeRequests));

// library — /v1/library/…, /v1/auto-update/bindings, /v1/decks/…/insert-from-library
app.route('/', libraryRoutes(p18.library));

// expiry — /v1/expiry-policies, /v1/expiry-dashboard
app.route('/', expiryRoutes(p18.expiry));

// meeting — /v1/meeting-integrations/…, /v1/meeting-markers
app.route('/', meetingRoutes(p18.meeting));

// calendar — /v1/decks/…/calendar-links, /v1/calendar-links/…
app.route('/', calendarRoutes(p18.calendar));

// tasks — /v1/task-links/…
app.route('/v1/task-links', taskRoutes(p18.tasks));

// guests — /v1/guests/…, /v1/guest-access/…
app.route('/', guestsRoutes(p18.guests));

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
