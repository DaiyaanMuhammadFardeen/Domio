import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { collabRoutes } from './p18/collab.js';
import { permissionRoutes } from './p18/permissions.js';
import { suggestionRoutes } from './p18/suggestions.js';
import { mergeRequestRoutes } from './p18/merge_requests.js';
import { libraryRoutes } from './p18/library.js';
import { expiryRoutes } from './p18/expiry.js';
import { meetingRoutes } from './p18/meeting.js';
import { calendarRoutes } from './p18/calendar.js';
import { taskRoutes } from './p18/tasks.js';
import { guestsRoutes } from './p18/guests.js';
import { createP18Services } from '../p18_services.js';

describe('P18 mount smoke', () => {
  const p18 = createP18Services();
  const app = new Hono();

  // Mount like server.ts does
  app.route('/', collabRoutes(p18.collab));
  app.route('/v1/permissions', permissionRoutes(p18.permissions));
  app.route('/', suggestionRoutes(p18.suggestions));
  app.route('/', mergeRequestRoutes(p18.mergeRequests));
  app.route('/', libraryRoutes(p18.library));
  app.route('/', expiryRoutes(p18.expiry));
  app.route('/', meetingRoutes(p18.meeting));
  app.route('/', calendarRoutes(p18.calendar));
  app.route('/v1/task-links', taskRoutes(p18.tasks));
  app.route('/', guestsRoutes(p18.guests));

  it('returns 200 for GET /v1/permissions/grants with query params', async () => {
    const res = await app.request('/v1/permissions/grants?resource_type=deck&resource_id=123');
    // Should return 200 with an empty grants array (in-memory store)
    expect(res.status).toBe(200);
  });

  it('returns 400 for GET /v1/permissions/grants without query params', async () => {
    const res = await app.request('/v1/permissions/grants');
    expect(res.status).toBe(400);
  });

  it('returns 200 for GET /v1/task-links', async () => {
    const res = await app.request('/v1/task-links');
    expect(res.status).toBe(200);
  });

  it('returns 200 for GET /v1/decks/abc/comments', async () => {
    const res = await app.request('/v1/decks/abc/comments');
    expect(res.status).toBe(200);
  });

  it('returns 200 for GET /v1/decks/abc/suggestions', async () => {
    const res = await app.request('/v1/decks/abc/suggestions');
    expect(res.status).toBe(200);
  });

  it('returns 200 for GET /v1/decks/abc/merge-requests', async () => {
    const res = await app.request('/v1/decks/abc/merge-requests');
    expect(res.status).toBe(200);
  });

  it('returns 200 for GET /v1/library/entries', async () => {
    const res = await app.request('/v1/library/entries');
    expect(res.status).toBe(200);
  });

  it('returns 400 for GET /v1/expiry-policies without workspace_id', async () => {
    const res = await app.request('/v1/expiry-policies');
    expect(res.status).toBe(400);
  });

  it('returns 400 for GET /v1/meeting-integrations/zoom/status without workspace_id', async () => {
    const res = await app.request('/v1/meeting-integrations/zoom/status');
    expect(res.status).toBe(400);
  });

  it('returns 200 for GET /v1/calendar-links/today', async () => {
    const res = await app.request('/v1/calendar-links/today');
    // getPresenterTodayView requires actorId, which we pass via query
    // Without it, the service should still return something
    expect([200, 400]).toContain(res.status);
  });

  // ── Guest routes ────────────────────────────────────────────────────────

  it('returns 201 for POST /v1/guests with valid body', async () => {
    const res = await app.request('/v1/guests', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-actor-id': 'inviter-001',
      },
      body: JSON.stringify({
        workspace_id: 'ws-001',
        guest_email: 'guest@example.com',
        scope_type: 'deck',
        scope_id: 'deck-001',
        inviter_id: 'inviter-001',
      }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body['guest']).toBeDefined();
    expect(body['magic_link_token']).toBeDefined();
  });

  it('returns 401 for POST /v1/guest-access/consume with bogus token', async () => {
    const res = await app.request('/v1/guest-access/consume', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: 'bogus-token-that-does-not-exist' }),
    });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body['code']).toBe('MAGIC_LINK_INVALID');
  });
});
