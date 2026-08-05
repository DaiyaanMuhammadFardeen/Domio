/**
 * AR Session — handler tests (Phase 11 M5.3).
 *
 * Exercises the Hono route handlers against an in-memory service.
 * Each test issues a request through the handler and asserts on the
 * HTTP status + body.
 *
 * Coverage:
 *   - POST /v1/ar_sessions → 201 with token + audienceUrl + expiresAt
 *   - POST /v1/ar_sessions → 400 for invalid body
 *   - GET /v1/ar_sessions/:id → 200 with session
 *   - GET /v1/ar_sessions/:id → 404 for unknown
 *   - DELETE /v1/ar_sessions/:id → 204
 *   - DELETE /v1/ar_sessions/:id → 404 for unknown
 */

import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { createArSessionRoutes } from './handlers.js';
import { SessionService } from './service.js';

// ── Helpers ──────────────────────────────────────────────────────────

const SLIDE_ID = '550e8400-e29b-41d4-a716-446655440000';
const MODEL_ID = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';
const NOW = 1700000000000;

function makeApp(opts?: { clock?: () => number }) {
  const service = new SessionService({
    clock: opts?.clock ?? (() => NOW),
    idGenerator: () => 'handler-test-id',
  });
  const app = new Hono();
  app.route('/', createArSessionRoutes({ service }));
  return { app, service };
}

async function post(app: Hono, path: string, body: unknown): Promise<Response> {
  return app.request(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function get(app: Hono, path: string): Promise<Response> {
  return app.request(path, { method: 'GET' });
}

async function del(app: Hono, path: string): Promise<Response> {
  return app.request(path, { method: 'DELETE' });
}

// ── POST /v1/ar_sessions ─────────────────────────────────────────────

describe('POST /v1/ar_sessions', () => {
  it('creates a session → 201 with correct fields', async () => {
    const { app } = makeApp();
    const res = await post(app, '/v1/ar_sessions', {
      slideId: SLIDE_ID,
      modelAssetId: MODEL_ID,
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      id: string;
      slideId: string;
      modelAssetId: string;
      token: string;
      audienceUrl: string;
      expiresAt: string;
      createdAt: string;
      qrPayload: string;
    };

    expect(body.id).toBe('handler-test-id');
    expect(body.slideId).toBe(SLIDE_ID);
    expect(body.modelAssetId).toBe(MODEL_ID);
    expect(body.token).toBeTypeOf('string');
    expect(body.token.length).toBeGreaterThan(0);
    expect(body.audienceUrl).toContain('/s/handler-test-id');
    expect(body.audienceUrl).toContain('token=');
    expect(body.expiresAt).toBeTypeOf('string');
    expect(body.createdAt).toBeTypeOf('string');
    expect(body.qrPayload).toBeTypeOf('string');

    // Verify expiresAt is30 min from NOW
    const expiresAt = new Date(body.expiresAt).getTime();
    expect(expiresAt).toBe(NOW + 30 * 60 * 1000);
  });

  it('returns 400 for missing slideId', async () => {
    const { app } = makeApp();
    const res = await post(app, '/v1/ar_sessions', {
      modelAssetId: MODEL_ID,
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string; message: string };
    expect(body.code).toBe('VALIDATION_ERROR');
    expect(body.message).toContain('slideId');
  });

  it('returns 400 for missing modelAssetId', async () => {
    const { app } = makeApp();
    const res = await post(app, '/v1/ar_sessions', {
      slideId: SLIDE_ID,
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string; message: string };
    expect(body.code).toBe('VALIDATION_ERROR');
    expect(body.message).toContain('modelAssetId');
  });

  it('returns 400 for empty slideId', async () => {
    const { app } = makeApp();
    const res = await post(app, '/v1/ar_sessions', {
      slideId: '',
      modelAssetId: MODEL_ID,
    });

    expect(res.status).toBe(400);
  });

  it('returns 400 for empty modelAssetId', async () => {
    const { app } = makeApp();
    const res = await post(app, '/v1/ar_sessions', {
      slideId: SLIDE_ID,
      modelAssetId: '',
    });

    expect(res.status).toBe(400);
  });

  it('returns 400 for non-JSON body', async () => {
    const { app } = makeApp();
    const res = await app.request('/v1/ar_sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not json',
    });

    expect(res.status).toBe(400);
  });

  it('returns 400 for empty body', async () => {
    const { app } = makeApp();
    const res = await post(app, '/v1/ar_sessions', {});

    expect(res.status).toBe(400);
  });
});

// ── GET /v1/ar_sessions/:id ──────────────────────────────────────────

describe('GET /v1/ar_sessions/:id', () => {
  it('returns session → 200', async () => {
    const { app } = makeApp();

    // First create
    const createRes = await post(app, '/v1/ar_sessions', {
      slideId: SLIDE_ID,
      modelAssetId: MODEL_ID,
    });
    expect(createRes.status).toBe(201);
    const created = (await createRes.json()) as { id: string };

    // Then get
    const getRes = await get(app, `/v1/ar_sessions/${created.id}`);
    expect(getRes.status).toBe(200);
    const body = (await getRes.json()) as {
      id: string;
      state?: string;
      token: string;
    };

    expect(body.id).toBe(created.id);
    expect(body.token).toBeTypeOf('string');
  });

  it('returns 404 for unknown session', async () => {
    const { app } = makeApp();
    const res = await get(app, '/v1/ar_sessions/nonexistent');
    expect(res.status).toBe(404);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe('SESSION_NOT_FOUND');
  });

  it('returns 404 for invalidated session', async () => {
    const { app, service } = makeApp();

    // Create
    const session = await service.createSession({
      slideId: SLIDE_ID,
      modelAssetId: MODEL_ID,
    });

    // Invalidate
    await service.invalidateSession(session.id);

    // Get should return 404
    const res = await get(app, `/v1/ar_sessions/${session.id}`);
    expect(res.status).toBe(404);
  });
});

// ── DELETE /v1/ar_sessions/:id ───────────────────────────────────────

describe('DELETE /v1/ar_sessions/:id', () => {
  it('invalidates session → 204', async () => {
    const { app } = makeApp();

    // Create
    const createRes = await post(app, '/v1/ar_sessions', {
      slideId: SLIDE_ID,
      modelAssetId: MODEL_ID,
    });
    expect(createRes.status).toBe(201);
    const created = (await createRes.json()) as { id: string };

    // Delete
    const delRes = await del(app, `/v1/ar_sessions/${created.id}`);
    expect(delRes.status).toBe(204);

    // Get should now return 404
    const getRes = await get(app, `/v1/ar_sessions/${created.id}`);
    expect(getRes.status).toBe(404);
  });

  it('returns 404 for unknown session', async () => {
    const { app } = makeApp();
    const res = await del(app, '/v1/ar_sessions/nonexistent');
    expect(res.status).toBe(404);
  });

  it('returns 404 when already invalidated', async () => {
    const { app, service } = makeApp();

    const session = await service.createSession({
      slideId: SLIDE_ID,
      modelAssetId: MODEL_ID,
    });

    // First delete
    const res1 = await del(app, `/v1/ar_sessions/${session.id}`);
    expect(res1.status).toBe(204);

    // Second delete should 404
    const res2 = await del(app, `/v1/ar_sessions/${session.id}`);
    expect(res2.status).toBe(404);
  });
});

// ── Full lifecycle ───────────────────────────────────────────────────

describe('Full lifecycle', () => {
  it('create → get (active) → invalidate → get (404)', async () => {
    const { app } = makeApp();

    // Create
    const createRes = await post(app, '/v1/ar_sessions', {
      slideId: SLIDE_ID,
      modelAssetId: MODEL_ID,
    });
    expect(createRes.status).toBe(201);
    const created = (await createRes.json()) as { id: string; token: string };

    // Get (should be active)
    const getRes1 = await get(app, `/v1/ar_sessions/${created.id}`);
    expect(getRes1.status).toBe(200);

    // Invalidate
    const delRes = await del(app, `/v1/ar_sessions/${created.id}`);
    expect(delRes.status).toBe(204);

    // Get (should be 404)
    const getRes2 = await get(app, `/v1/ar_sessions/${created.id}`);
    expect(getRes2.status).toBe(404);
  });

  it('create → wait → get (expired by TTL)', async () => {
    let now = NOW;
    const { app } = makeApp({ clock: () => now });

    // Create
    const createRes = await post(app, '/v1/ar_sessions', {
      slideId: SLIDE_ID,
      modelAssetId: MODEL_ID,
    });
    expect(createRes.status).toBe(201);
    const created = (await createRes.json()) as { id: string };

    // Advance past TTL
    now = NOW + 31 * 60 * 1000;

    // Get should return 404 (expired)
    const getRes = await get(app, `/v1/ar_sessions/${created.id}`);
    expect(getRes.status).toBe(404);
    const body = (await getRes.json()) as { code: string };
    expect(body.code).toBe('SESSION_EXPIRED');
  });
});
