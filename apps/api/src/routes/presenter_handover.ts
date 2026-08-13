/**
 * Handover routes — wires the presenter-session W11 handover capability
 * through Hono.
 *
 * Two routes:
 *   POST /v1/presenter/sessions/:id/handover/init
 *     Mints a signed HMAC handover token authorising `to_presenter_id`
 *     to take over the session. Returns `{ token, expires_at_ms,
 *     expected_version }`.
 *
 *   POST /v1/presenter/sessions/:id/handover
 *     Finalises the handover. The body must carry the token; the row's
 *     `If-Match` must equal the version the token was minted against.
 *
 * Both routes use the in-memory presenter-session store + audit chain
 * for now (boot test); Postgres-backed implementations land in Phase 21
 * alongside the unified store.
 */

import { Hono } from 'hono';
import { createHash } from 'crypto';
import {
  InMemoryPresenterSessionStore,
  HashChainedAuditEmitter,
  InMemoryIdempotencyStore,
  PresenterSessionService,
  parseEtag,
  verifyHandoverToken,
} from '@domio/presenter-session';
import { getPresenterMetrics } from '../observability.js';

const ROOT_KEY = process.env.PRESENTER_HANDOVER_ROOT_KEY ?? 'dev-only-handover-key';
const KEY = (() => {
  // Derive a 32-byte key from the root string deterministically so that
  // boot tests produce reproducible signatures.
  return createHash('sha256').update(`domio/api/handover/v1:${ROOT_KEY}`).digest();
})();

// Lazy singletons — Hono handlers are constructed per-request but the
// service can be shared across requests.
let cachedService: PresenterSessionService | null = null;
function getService(): PresenterSessionService {
  if (cachedService) return cachedService;
  cachedService = new PresenterSessionService({
    store: new InMemoryPresenterSessionStore(),
    audit: new HashChainedAuditEmitter({ workspaceId: 'default', key: KEY }),
    idempotency: new InMemoryIdempotencyStore(),
    metrics: getPresenterMetrics(),
  });
  return cachedService;
}

type HeaderRecord = Record<string, string | string[] | undefined>;

function pickHeader(headers: HeaderRecord, name: string): string | undefined {
  const v = headers[name.toLowerCase()];
  return typeof v === 'string' ? v : undefined;
}

function actorFromHeaders(headers: HeaderRecord) {
  return {
    id: pickHeader(headers, 'x-actor-id') ?? 'anonymous',
    workspace_id: pickHeader(headers, 'x-workspace-id') ?? '00000000-0000-0000-0000-000000000000',
  };
}

const handover = new Hono();

// POST /v1/presenter/sessions/:id/handover/init
handover.post('/v1/presenter/sessions/:id/handover/init', async (c) => {
  const id = c.req.param('id');
  const body = (await c.req.json().catch(() => ({}))) as {
    to_presenter_id?: string;
    ttl_ms?: number;
  };
  if (!body.to_presenter_id) {
    return c.json({ error: 'VALIDATION', message: 'to_presenter_id is required' }, 400);
  }
  try {
    const minted = await getService().mintHandoverToken(
      id,
      {
        to_presenter_id: body.to_presenter_id,
        ...(body.ttl_ms !== undefined ? { ttl_ms: body.ttl_ms } : {}),
      },
      actorFromHeaders(c.req.header()).id,
      KEY,
    );
    return c.json(minted, 200);
  } catch (e) {
    return c.json({ error: 'INTERNAL', message: (e as Error).message }, 500);
  }
});

// POST /v1/presenter/sessions/:id/handover
handover.post('/v1/presenter/sessions/:id/handover', async (c) => {
  const id = c.req.param('id');
  const body = (await c.req.json()) as {
    to_presenter_id: string;
    state_snapshot: Record<string, unknown>;
    transfer_token: string;
    client_started_at_ms?: number;
  };
  const etag = c.req.header('if-match');
  const parsed = parseEtag(etag);
  if (!parsed.ok) {
    return c.json({ error: 'PRECONDITION_REQUIRED', message: parsed.error }, 428);
  }
  try {
    const updated = await getService().handover(
      id,
      {
        to_presenter_id: body.to_presenter_id,
        state_snapshot: body.state_snapshot as never,
        transfer_token: body.transfer_token,
        expected_version: parsed.version!,
      },
      {
        actorId: actorFromHeaders(c.req.header()).id,
        handoverKey: KEY,
        verifyHandoverToken,
        ...(typeof body.client_started_at_ms === 'number'
          ? { clientStartedAtMs: body.client_started_at_ms }
          : {}),
      },
    );
    return c.json(updated, 200, { etag: `"${updated.version}"` });
  } catch (e) {
    return c.json({ error: 'INTERNAL', message: (e as Error).message }, 500);
  }
});

export { handover as handoverRoutes };
