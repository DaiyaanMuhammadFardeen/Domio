import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { gdprRoutes } from './gdpr.js';
import { healthRoutes } from './health.js';
import { buildInMemoryStore } from '../store/inmemory.js';
import { defaultPolicyFor } from '../consent/policy.js';

function buildApp() {
  const store = buildInMemoryStore();
  const accepted = (_workspace_id: string) => defaultPolicyFor('balanced');
  const app = new Hono();
  app.route('/', healthRoutes());
  app.route('/', gdprRoutes({ store, salt: 'test-salt', acceptedModes: accepted }));
  return { app, store };
}

async function postJSON(app: Hono, path: string, body: unknown): Promise<Response> {
  return app.request(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('routes — POST /v1/viewers', () => {
  it('creates a viewer on first sight', async () => {
    const { app } = buildApp();
    const res = await postJSON(app, '/v1/viewers', {
      workspace_id: 'ws-1',
      raw_identifier: 'device-1',
      privacy_mode: 'pseudonymous',
      ip: '10.0.0.1',
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { viewer: { viewer_id: string; viewer_id_key: string } };
    expect(json.viewer.viewer_id.length).toBeGreaterThan(0);
    expect(json.viewer.viewer_id_key).toMatch(/^[0-9a-f]{64}$/);
  });

  it('rejects unknown privacy_mode when workspace is balanced', async () => {
    const { app } = buildApp();
    const res = await postJSON(app, '/v1/viewers', {
      workspace_id: 'ws-1',
      raw_identifier: 'device-1',
      privacy_mode: 'anon_no_track',
    });
    expect(res.status).toBe(403);
  });

  it('upserts the same viewer on second sight', async () => {
    const { app } = buildApp();
    const r1 = await postJSON(app, '/v1/viewers', {
      workspace_id: 'ws-1',
      raw_identifier: 'device-1',
      privacy_mode: 'pseudonymous',
    });
    const j1 = (await r1.json()) as { viewer: { viewer_id: string } };
    const r2 = await postJSON(app, '/v1/viewers', {
      workspace_id: 'ws-1',
      raw_identifier: 'device-1',
      privacy_mode: 'pseudonymous',
    });
    const j2 = (await r2.json()) as { viewer: { viewer_id: string } };
    expect(j1.viewer.viewer_id).toBe(j2.viewer.viewer_id);
  });

  it('returns 400 when workspace_id missing', async () => {
    const { app } = buildApp();
    const res = await postJSON(app, '/v1/viewers', { raw_identifier: 'x' });
    expect(res.status).toBe(400);
  });
});

describe('routes — GET /v1/viewers/:id', () => {
  it('returns the viewer when workspace matches', async () => {
    const { app, store } = buildApp();
    const v = await store.upsertViewer({
      viewer_id: '',
      workspace_id: 'ws-1',
      viewer_id_key: 'k-1',
      privacy_mode: 'pseudonymous',
      region_pinned: null,
      created_at: 0,
      last_seen_at: 0,
      canonical_id: null,
      metadata: {},
    });
    const res = await app.request(`/v1/viewers/${v.viewer_id}?workspace_id=ws-1`);
    expect(res.status).toBe(200);
  });

  it('returns 404 when workspace does not match', async () => {
    const { app, store } = buildApp();
    const v = await store.upsertViewer({
      viewer_id: '',
      workspace_id: 'ws-1',
      viewer_id_key: 'k-1',
      privacy_mode: 'pseudonymous',
      region_pinned: null,
      created_at: 0,
      last_seen_at: 0,
      canonical_id: null,
      metadata: {},
    });
    const res = await app.request(`/v1/viewers/${v.viewer_id}?workspace_id=ws-2`);
    expect(res.status).toBe(404);
  });
});

describe('routes — DELETE /v1/viewers/:id', () => {
  it('erases the viewer', async () => {
    const { app, store } = buildApp();
    const v = await store.upsertViewer({
      viewer_id: '',
      workspace_id: 'ws-1',
      viewer_id_key: 'k-1',
      privacy_mode: 'pseudonymous',
      region_pinned: null,
      created_at: 0,
      last_seen_at: 0,
      canonical_id: null,
      metadata: {},
    });
    const res = await app.request(`/v1/viewers/${v.viewer_id}?workspace_id=ws-1`, { method: 'DELETE' });
    expect(res.status).toBe(200);
    expect(await store.getViewerById(v.viewer_id)).toBeNull();
  });
});

describe('routes — GET /v1/viewers/:id/export', () => {
  it('returns NDJSON', async () => {
    const { app, store } = buildApp();
    const v = await store.upsertViewer({
      viewer_id: '',
      workspace_id: 'ws-1',
      viewer_id_key: 'k-1',
      privacy_mode: 'pseudonymous',
      region_pinned: null,
      created_at: 0,
      last_seen_at: 0,
      canonical_id: null,
      metadata: {},
    });
    const res = await app.request(`/v1/viewers/${v.viewer_id}/export?workspace_id=ws-1`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/x-ndjson');
    const body = await res.text();
    expect(body).toMatch(/"kind":"viewer"/);
  });
});

describe('routes — POST /v1/viewers/:id/object', () => {
  it('flips privacy_mode to anon_no_track', async () => {
    const { app, store } = buildApp();
    const v = await store.upsertViewer({
      viewer_id: '',
      workspace_id: 'ws-1',
      viewer_id_key: 'k-1',
      privacy_mode: 'pseudonymous',
      region_pinned: null,
      created_at: 0,
      last_seen_at: 0,
      canonical_id: null,
      metadata: {},
    });
    const res = await app.request(`/v1/viewers/${v.viewer_id}/object?workspace_id=ws-1&source=gdpr`, { method: 'POST' });
    expect(res.status).toBe(200);
    const after = await store.getViewerById(v.viewer_id);
    expect(after?.privacy_mode).toBe('anon_no_track');
  });
});

describe('routes — /healthz', () => {
  it('returns 200', async () => {
    const { app } = buildApp();
    const res = await app.request('/healthz');
    expect(res.status).toBe(200);
  });
});