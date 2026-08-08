/**
 * Viewer-identity — GDPR integration tests (Phase 17 W4).
 *
 * End-to-end through the Hono app:
 *   1. POST /v1/viewers → upserts viewer, kicks off background stitching
 *   2. POST /v1/viewers/:id/consent → records a consent_event
 *   3. POST /v1/identity-links → manual link for the stitcher to "see"
 *   4. GET /v1/viewers/:id/export → returns NDJSON with viewer + link + consent
 *   5. DELETE /v1/viewers/:id → erases everything
 *   6. GET /v1/viewers/:id → 404
 *   7. POST /v1/viewers/:id/object → flips to anon_no_track + records revoke
 *
 * These tests exercise the full route + handler + in-memory store
 * stack so regressions in any layer are caught.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { gdprRoutes } from '../routes/gdpr.js';
import { healthRoutes } from '../routes/health.js';
import { buildInMemoryStore } from '../store/inmemory.js';
import { defaultPolicyFor } from '../consent/policy.js';
import type { IdentityStore } from '../store/inmemory.js';

function buildApp(): { app: Hono; store: IdentityStore } {
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

describe('GDPR integration — erase', () => {
  let store: IdentityStore;
  let app: Hono;

  beforeEach(() => {
    ({ app, store } = buildApp());
  });

  it('erase removes viewer, links, and consent', async () => {
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
    await store.insertLink({
      link_id: '',
      workspace_id: 'ws-1',
      canonical_id: v.viewer_id,
      alternate_id: 'alt-id',
      confidence: 0.9,
      method: 'manual',
      created_at: Date.now(),
    });
    await store.insertConsent({
      event_id: '',
      workspace_id: 'ws-1',
      viewer_id: v.viewer_id,
      privacy_mode: 'pseudonymous',
      action: 'grant',
      source: 'test',
      policy_version: 'phase17-w3-v1',
      user_agent: null,
      ip_class: null,
      occurred_at: Date.now(),
    });

    const res = await app.request(`/v1/viewers/${v.viewer_id}?workspace_id=ws-1`, { method: 'DELETE' });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { run: { run_id: string; rows_removed: number } };
    expect(body.run.rows_removed).toBeGreaterThanOrEqual(3);
    expect(await store.getViewerById(v.viewer_id)).toBeNull();
  });

  it('erase returns 404 when viewer does not exist', async () => {
    const res = await app.request('/v1/viewers/does-not-exist?workspace_id=ws-1', { method: 'DELETE' });
    expect(res.status).toBe(404);
  });

  it('erase returns 404 when workspace does not match', async () => {
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
    const res = await app.request(`/v1/viewers/${v.viewer_id}?workspace_id=ws-other`, { method: 'DELETE' });
    expect(res.status).toBe(404);
  });
});

describe('GDPR integration — export', () => {
  let store: IdentityStore;
  let app: Hono;

  beforeEach(() => {
    ({ app, store } = buildApp());
  });

  it('returns NDJSON with viewer + link + consent rows', async () => {
    const v = await store.upsertViewer({
      viewer_id: '',
      workspace_id: 'ws-1',
      viewer_id_key: 'k-1',
      privacy_mode: 'pseudonymous',
      region_pinned: null,
      created_at: 1_000,
      last_seen_at: 1_000,
      canonical_id: null,
      metadata: {},
    });
    await store.insertLink({
      link_id: '',
      workspace_id: 'ws-1',
      canonical_id: v.viewer_id,
      alternate_id: 'alt-id',
      confidence: 1.0,
      method: 'manual',
      created_at: 2_000,
    });
    await store.insertConsent({
      event_id: '',
      workspace_id: 'ws-1',
      viewer_id: v.viewer_id,
      privacy_mode: 'pseudonymous',
      action: 'grant',
      source: 'test',
      policy_version: 'phase17-w3-v1',
      user_agent: 'ua',
      ip_class: 'eu',
      occurred_at: 3_000,
    });

    const res = await app.request(`/v1/viewers/${v.viewer_id}/export?workspace_id=ws-1`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/x-ndjson');
    const text = await res.text();
    const lines = text.trim().split('\n');
    expect(lines.length).toBeGreaterThanOrEqual(3);
    const parsed = lines.map((l) => JSON.parse(l) as { kind: string });
    const kinds = parsed.map((p) => p.kind).sort();
    expect(kinds).toEqual(['consent', 'identity_link', 'viewer']);
  });

  it('export returns 404 for missing viewer', async () => {
    const res = await app.request('/v1/viewers/does-not-exist/export?workspace_id=ws-1');
    expect(res.status).toBe(404);
  });

  it('export omits alternate viewer data when no link exists', async () => {
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
    const text = await res.text();
    expect(text).toMatch(/"kind":"viewer"/);
    expect(text).not.toMatch(/"kind":"identity_link"/);
  });
});

describe('GDPR integration — verify (object → anon_no_track)', () => {
  let store: IdentityStore;
  let app: Hono;

  beforeEach(() => {
    ({ app, store } = buildApp());
  });

  it('object flips privacy_mode to anon_no_track AND records a revoke consent', async () => {
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
    const res = await postJSON(app, `/v1/viewers/${v.viewer_id}/object?workspace_id=ws-1&source=gdpr`, {});
    expect(res.status).toBe(200);
    const after = await store.getViewerById(v.viewer_id);
    expect(after?.privacy_mode).toBe('anon_no_track');
    const consent = await store.recentConsentFor(v.viewer_id, 'pseudonymous');
    expect(consent?.action).toBe('revoke');
    expect(consent?.source).toBe('gdpr');
  });

  it('object is idempotent — repeated calls stay at anon_no_track', async () => {
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
    await postJSON(app, `/v1/viewers/${v.viewer_id}/object?workspace_id=ws-1`, {});
    await postJSON(app, `/v1/viewers/${v.viewer_id}/object?workspace_id=ws-1`, {});
    const after = await store.getViewerById(v.viewer_id);
    expect(after?.privacy_mode).toBe('anon_no_track');
  });

  it('object returns 404 when viewer does not exist', async () => {
    const res = await postJSON(app, '/v1/viewers/missing/object?workspace_id=ws-1', {});
    expect(res.status).toBe(404);
  });
});

describe('GDPR integration — full lifecycle', () => {
  let app: Hono;

  beforeEach(() => {
    ({ app } = buildApp());
  });

  it('upsert → consent → export → erase → 404 chain', async () => {
    // 1. Upsert via the route.
    const upsertRes = await postJSON(app, '/v1/viewers', {
      workspace_id: 'ws-1',
      raw_identifier: 'device-abc',
      privacy_mode: 'pseudonymous',
    });
    expect(upsertRes.status).toBe(200);
    const { viewer } = (await upsertRes.json()) as { viewer: { viewer_id: string } };

    // 2. Append a consent event via the route.
    const consentRes = await postJSON(app, `/v1/viewers/${viewer.viewer_id}/consent`, {
      workspace_id: 'ws-1',
      privacy_mode: 'pseudonymous',
      action: 'grant',
      source: 'banner',
    });
    expect(consentRes.status).toBe(201);

    // 3. Export and confirm both kinds appear.
    const exportRes = await app.request(`/v1/viewers/${viewer.viewer_id}/export?workspace_id=ws-1`);
    expect(exportRes.status).toBe(200);
    const exportText = await exportRes.text();
    expect(exportText).toMatch(/"kind":"viewer"/);
    expect(exportText).toMatch(/"kind":"consent"/);

    // 4. Erase.
    const eraseRes = await app.request(`/v1/viewers/${viewer.viewer_id}?workspace_id=ws-1`, { method: 'DELETE' });
    expect(eraseRes.status).toBe(200);
    const eraseBody = (await eraseRes.json()) as { run: { rows_removed: number } };
    expect(eraseBody.run.rows_removed).toBeGreaterThanOrEqual(2);

    // 5. Subsequent GET is 404.
    const afterRes = await app.request(`/v1/viewers/${viewer.viewer_id}?workspace_id=ws-1`);
    expect(afterRes.status).toBe(404);
  });
});