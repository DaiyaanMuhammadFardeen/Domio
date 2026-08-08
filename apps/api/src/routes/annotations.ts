import { Hono } from 'hono';
import {
  AnnotationHandlers,
  AnnotationService,
  InMemoryAnnotationStore,
  HashChainedAuditEmitter,
  InMemoryIdempotencyStore,
  type AnnotationCommitBody,
} from '@domio/annotation-engine';

/**
 * Annotation routes — wired by apps/api through @domio/annotation-engine.
 *
 * Phase 15 W4. The runtime uses the in-memory store + audit + idempotency
 * for now (boot test); Postgres-backed implementations land in apps/api
 * via env-driven wiring (DATABASE_URL) once the unified store lands in
 * Phase 21. The contract surface is owned by `contracts/openapi/v1/
 * annotations.yaml`.
 */

const handlers = new AnnotationHandlers({
  service: new AnnotationService({
    store: new InMemoryAnnotationStore(),
    audit: new HashChainedAuditEmitter({ rootKey: process.env.ANNOTATION_AUDIT_ROOT_KEY ?? 'dev-only-root' }),
    idempotency: new InMemoryIdempotencyStore(),
  }),
});

const annotations = new Hono();

function pickHeaders(headers: HeaderRecord, name: string): string | undefined {
  const v = headers[name.toLowerCase()];
  return typeof v === 'string' ? v : undefined;
}

function actorFromHeaders(headers: HeaderRecord) {
  return {
    id: pickHeaders(headers, 'x-actor-id') ?? 'anonymous',
    workspace_id: pickHeaders(headers, 'x-workspace-id') ?? '00000000-0000-0000-0000-000000000000',
  };
}

annotations.post('/v1/annotation/:sessionId/commit', async (c) => {
  const sessionId = c.req.param('sessionId');
  const body = (await c.req.json()) as AnnotationCommitBody;
  const idemKey = c.req.header('idempotency-key');
  const response = await handlers.commit({
    params: { sessionId },
    headers: c.req.header(),
    body,
    actor: actorFromHeaders(c.req.header()),
    ...(idemKey !== undefined ? { idempotencyKey: idemKey } : {}),
  });
  return c.json(response.body as object, response.status as 201, response.headers);
});

annotations.post('/v1/annotation/:sessionId/rollback', async (c) => {
  const sessionId = c.req.param('sessionId');
  const body = (await c.req.json()) as { annotation_id: string };
  const idemKey = c.req.header('idempotency-key');
  const response = await handlers.rollback({
    params: { sessionId },
    headers: c.req.header(),
    body,
    actor: actorFromHeaders(c.req.header()),
    ...(idemKey !== undefined ? { idempotencyKey: idemKey } : {}),
  });
  return c.json(response.body as object, response.status as 200, response.headers);
});

annotations.post('/v1/annotation/:sessionId/promote', async (c) => {
  const sessionId = c.req.param('sessionId');
  const body = (await c.req.json()) as { annotation_id: string };
  const idemKey = c.req.header('idempotency-key');
  const response = await handlers.promote({
    params: { sessionId },
    headers: c.req.header(),
    body,
    actor: actorFromHeaders(c.req.header()),
    ...(idemKey !== undefined ? { idempotencyKey: idemKey } : {}),
  });
  return c.json(response.body as object, response.status as 200, response.headers);
});

annotations.get('/v1/annotation/:sessionId/list', async (c) => {
  const sessionId = c.req.param('sessionId');
  const ephemeral = c.req.query('ephemeral') !== 'false';
  const response = await handlers.list({
    params: { sessionId },
    headers: c.req.header(),
    body: { ephemeral },
    actor: actorFromHeaders(c.req.header()),
  });
  return c.json(response.body as object, response.status as 200, response.headers);
});

type HeaderRecord = Record<string, string | string[] | undefined>;

export { annotations as annotationRoutes };