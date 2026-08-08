/**
 * Viewer-identity — Hono routes (Phase 17 W3).
 *
 * Endpoints:
 *   POST   /v1/viewers                   upsert a viewer + log context
 *   POST   /v1/viewers/:id/consent       append a consent_event
 *   GET    /v1/viewers/:id               fetch a viewer
 *   DELETE /v1/viewers/:id               right-to-erasure
 *   GET    /v1/viewers/:id/export        right-to-access (NDJSON)
 *   POST   /v1/viewers/:id/object        right-to-object
 *   GET    /v1/viewers/:id/links         list identity links
 *   POST   /v1/identity-links            manual link
 */

import { Hono } from 'hono';
import type { IdentityStore } from '../store/inmemory.js';
import type { PrivacyMode, Region } from '../types.js';
import { hashViewerId, classifyIp } from '../identity/hash.js';
import { stitchViewer } from '../identity/stitch.js';
import { evaluateMode, CURRENT_POLICY_VERSION } from '../consent/policy.js';
import { eraseViewer, exportViewer, objectToTracking, GdprError } from '../gdpr/handlers.js';

export interface RouteDeps {
  store: IdentityStore;
  /** Salt for hashing viewer_id_key (rotated quarterly). */
  salt: string;
  /** Per-workspace accepted privacy modes. */
  acceptedModes: (workspace_id: string) => readonly PrivacyMode[];
}

export function gdprRoutes(deps: RouteDeps): Hono {
  const app = new Hono();

  app.post('/v1/viewers', async (c) => {
    const body = (await c.req.json().catch(() => null)) as
      | {
          workspace_id?: unknown;
          raw_identifier?: unknown;
          privacy_mode?: unknown;
          region_pinned?: unknown;
          ip?: unknown;
          user_agent?: unknown;
          email_hash?: unknown;
        }
      | null;
    if (!body || typeof body.workspace_id !== 'string' || typeof body.raw_identifier !== 'string') {
      return c.json({ error: { code: 'bad_request', message: 'workspace_id and raw_identifier required' } }, 400);
    }
    if (typeof body.privacy_mode !== 'string') {
      return c.json({ error: { code: 'bad_request', message: 'privacy_mode required' } } , 400);
    }
    const mode = body.privacy_mode as PrivacyMode;
    const decision = evaluateMode(mode, deps.acceptedModes(body.workspace_id));
    if (!decision.accept) {
      return c.json({ error: { code: 'consent', message: decision.reason ?? 'rejected' } }, 403);
    }
    const key = hashViewerId(body.raw_identifier, deps.salt);
    const existing = await deps.store.getViewerByKey(body.workspace_id, key);
    const now = Date.now();
    const ipRaw = typeof body.ip === 'string' ? body.ip : '';
    const ipClass = classifyIp(ipRaw);
    const ipClassOrNull = ipClass === 'unknown' ? null : ipClass;
    const regionInput = typeof body.region_pinned === 'string' ? body.region_pinned : null;
    const region: Region | null =
      regionInput === 'us' || regionInput === 'eu' || regionInput === 'bd' || regionInput === 'sg' || regionInput === 'au'
        ? regionInput
        : null;
    const updated = await deps.store.upsertViewer({
      viewer_id: existing?.viewer_id ?? '',
      workspace_id: body.workspace_id,
      viewer_id_key: key,
      privacy_mode: mode,
      region_pinned: region,
      created_at: existing?.created_at ?? now,
      last_seen_at: now,
      canonical_id: existing?.canonical_id ?? null,
      metadata: {
        last_ip_class: ipClassOrNull,
        last_user_agent: typeof body.user_agent === 'string' ? body.user_agent : null,
        email_hash: typeof body.email_hash === 'string' ? body.email_hash : null,
      },
    });
    // Attempt cross-device stitching in the background. We do not
    // await this so the caller gets a 200 immediately; the link is
    // written to the store regardless.
    const workspaceId: string = body.workspace_id;
    void (async () => {
      const candidates = await deps.store.recentViewers(workspaceId, now - 7 * 24 * 3600 * 1000, 200);
      const out = stitchViewer({
        workspace_id: workspaceId,
        viewer: updated,
        candidates,
        context: {
          email_hash: typeof body.email_hash === 'string' ? body.email_hash : null,
          ip_class: classifyIp(typeof body.ip === 'string' ? body.ip : ''),
          user_agent: typeof body.user_agent === 'string' ? body.user_agent : null,
          now_ms: now,
        },
      });
      if (out.link) {
        await deps.store.insertLink(out.link);
      }
    })();
    return c.json({ viewer: updated }, 200);
  });

  app.post('/v1/viewers/:id/consent', async (c) => {
    const id = c.req.param('id');
    const body = (await c.req.json().catch(() => null)) as
      | { workspace_id?: unknown; privacy_mode?: unknown; action?: unknown; source?: unknown; user_agent?: unknown; ip?: unknown }
      | null;
    if (!body || typeof body.workspace_id !== 'string' || typeof body.privacy_mode !== 'string' || typeof body.action !== 'string') {
      return c.json({ error: { code: 'bad_request', message: 'workspace_id, privacy_mode, action required' } }, 400);
    }
    const viewer = await deps.store.getViewerById(id);
    if (!viewer || viewer.workspace_id !== body.workspace_id) {
      return c.json({ error: { code: 'viewer_not_found' } }, 404);
    }
    const ev = await deps.store.insertConsent({
      event_id: '',
      workspace_id: body.workspace_id,
      viewer_id: id,
      privacy_mode: body.privacy_mode as PrivacyMode,
      action: body.action as 'grant' | 'revoke',
      source: typeof body.source === 'string' ? body.source : 'api',
      policy_version: CURRENT_POLICY_VERSION,
      user_agent: typeof body.user_agent === 'string' ? body.user_agent : null,
      ip_class: typeof body.ip === 'string' ? classifyIp(body.ip) : null,
      occurred_at: Date.now(),
    });
    return c.json({ consent: ev }, 201);
  });

  app.get('/v1/viewers/:id', async (c) => {
    const id = c.req.param('id');
    const workspaceId = c.req.query('workspace_id');
    if (!workspaceId) {
      return c.json({ error: { code: 'bad_request', message: 'workspace_id query required' } }, 400);
    }
    const viewer = await deps.store.getViewerById(id);
    if (!viewer || viewer.workspace_id !== workspaceId) {
      return c.json({ error: { code: 'viewer_not_found' } }, 404);
    }
    return c.json({ viewer }, 200);
  });

  app.delete('/v1/viewers/:id', async (c) => {
    const id = c.req.param('id');
    const workspaceId = c.req.query('workspace_id');
    if (!workspaceId) {
      return c.json({ error: { code: 'bad_request', message: 'workspace_id query required' } }, 400);
    }
    try {
      const out = await eraseViewer(deps.store, workspaceId, id);
      return c.json({ run: out }, 200);
    } catch (err) {
      if (err instanceof GdprError) {
        return c.json({ error: { code: err.code } }, err.status as 400 | 404);
      }
      throw err;
    }
  });

  app.get('/v1/viewers/:id/export', async (c) => {
    const id = c.req.param('id');
    const workspaceId = c.req.query('workspace_id');
    if (!workspaceId) {
      return c.json({ error: { code: 'bad_request', message: 'workspace_id query required' } }, 400);
    }
    try {
      const lines = await exportViewer(deps.store, workspaceId, id);
      const ndjson = lines.map((l) => JSON.stringify(l)).join('\n') + '\n';
      return new Response(ndjson, {
        status: 200,
        headers: { 'content-type': 'application/x-ndjson' },
      });
    } catch (err) {
      if (err instanceof GdprError) {
        return c.json({ error: { code: err.code } }, err.status as 400 | 404);
      }
      throw err;
    }
  });

  app.post('/v1/viewers/:id/object', async (c) => {
    const id = c.req.param('id');
    const workspaceId = c.req.query('workspace_id');
    const source = c.req.query('source') ?? 'api';
    if (!workspaceId) {
      return c.json({ error: { code: 'bad_request', message: 'workspace_id query required' } }, 400);
    }
    try {
      const out = await objectToTracking(deps.store, workspaceId, id, source);
      return c.json(out, 200);
    } catch (err) {
      if (err instanceof GdprError) {
        return c.json({ error: { code: err.code } }, err.status as 400 | 404);
      }
      throw err;
    }
  });

  app.get('/v1/viewers/:id/links', async (c) => {
    const id = c.req.param('id');
    const links = await deps.store.listLinksFor(id);
    return c.json({ links }, 200);
  });

  app.post('/v1/identity-links', async (c) => {
    const body = (await c.req.json().catch(() => null)) as
      | { workspace_id?: unknown; canonical_id?: unknown; alternate_id?: unknown }
      | null;
    if (
      !body ||
      typeof body.workspace_id !== 'string' ||
      typeof body.canonical_id !== 'string' ||
      typeof body.alternate_id !== 'string'
    ) {
      return c.json({ error: { code: 'bad_request', message: 'workspace_id, canonical_id, alternate_id required' } }, 400);
    }
    const link = await deps.store.insertLink({
      link_id: '',
      workspace_id: body.workspace_id,
      canonical_id: body.canonical_id,
      alternate_id: body.alternate_id,
      confidence: 1.0,
      method: 'manual',
      created_at: Date.now(),
    });
    return c.json({ link }, 201);
  });

  return app;
}