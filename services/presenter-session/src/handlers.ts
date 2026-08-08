/**
 * @domio/presenter-session — HTTP handler shape.
 *
 * Each handler is a thin transport adapter that:
 *  1. Parses the If-Match header → expected_version.
 *  2. Reads the JSON body → typed input.
 *  3. Forwards to the service.
 *  4. Translates domain errors into HTTP responses.
 *
 * The handlers do NOT call the store or audit directly — they only know
 * about the service. This is what keeps the service transport-agnostic.
 */

import type {
  AdvanceInput,
  AnnotationCommitInput,
  CreateSessionInput,
  DisplayProfileSnapshot,
  FailoverInput,
  HandoverInput,
  PipConfig,
  PlanPatchInput,
  PresenterSession,
  RecapSummaryInput,
  SessionMode,
} from './types.js';
import {
  PresenterSessionConflictError,
  PresenterSessionEndedError,
  PresenterSessionNotFoundError,
  PresenterSessionValidationError,
} from './types.js';
import { parseEtag, toEtag } from './etag.js';
import type { PresenterSessionService } from './service.js';
import { nullPresenterMetrics, type PresenterMetrics } from './observability/metrics.js';

// ---------------------------------------------------------------------------
// Handler context (HTTP-agnostic — supplied by the runtime, e.g. Next.js,
// Hono, or a Go bridge)
// ---------------------------------------------------------------------------

export interface HandlerRequest<B = unknown> {
  /** Path parameters parsed by the routing layer. */
  params: { id?: string };
  /** Headers map (lowercased keys). */
  headers: Record<string, string | string[] | undefined>;
  /** JSON body, if any. */
  body: B;
  /** Authenticated principal — supplied by the runtime. */
  actor: { id: string };
  /** Idempotency key header — Idempotency-Key. */
  idempotencyKey?: string;
}

export interface HandlerResponse<T = unknown> {
  status: number;
  body: T;
  headers?: Record<string, string>;
}

const HEADER_ETAG = 'etag';
const HEADER_IF_MATCH = 'if-match';
const HEADER_IDEMPOTENCY_KEY = 'idempotency-key';

function readHeader(req: HandlerRequest, name: string): string | undefined {
  const v = req.headers[name.toLowerCase()];
  if (Array.isArray(v)) return v[0];
  return v ?? undefined;
}

function jsonResponse<T>(status: number, body: T, etag?: string): HandlerResponse<T> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (etag) headers[HEADER_ETAG] = etag;
  return { status, body, headers };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sessionResponse(session: PresenterSession): HandlerResponse {
  return jsonResponse(200, session, toEtag(session.version));
}

function mapDomainError(e: unknown): HandlerResponse {
  if (e instanceof PresenterSessionNotFoundError) {
    return jsonResponse(404, { error: 'NOT_FOUND', message: e.message });
  }
  if (e instanceof PresenterSessionEndedError) {
    return jsonResponse(409, { error: 'ENDED', message: e.message });
  }
  if (e instanceof PresenterSessionConflictError) {
    return jsonResponse(409, {
      error: 'CONFLICT',
      message: e.message,
      current: e.current,
    }, toEtag(e.current.version));
  }
  if (e instanceof PresenterSessionValidationError) {
    return jsonResponse(400, { error: 'VALIDATION', message: e.message });
  }
  // Unknown error → 500.
  return jsonResponse(500, {
    error: 'INTERNAL',
    message: e instanceof Error ? e.message : 'unknown error',
  });
}

// ---------------------------------------------------------------------------
// Handler factory
// ---------------------------------------------------------------------------

export interface PresenterSessionHandlers {
  startSession(req: HandlerRequest<CreateSessionInput>): Promise<HandlerResponse>;
  endSession(req: HandlerRequest<unknown>): Promise<HandlerResponse>;
  advance(req: HandlerRequest<AdvanceInput>): Promise<HandlerResponse>;
  annotate(req: HandlerRequest<AnnotationCommitInput>): Promise<HandlerResponse>;
  plan(req: HandlerRequest<PlanPatchInput>): Promise<HandlerResponse>;
  handover(req: HandlerRequest<HandoverInput>): Promise<HandlerResponse>;
  failover(req: HandlerRequest<FailoverInput>): Promise<HandlerResponse>;
  heartbeat(req: HandlerRequest<unknown>): Promise<HandlerResponse>;
  getRecap(req: HandlerRequest<unknown>): Promise<HandlerResponse>;
  writeRecap(req: HandlerRequest<RecapSummaryInput>): Promise<HandlerResponse>;
  get(req: HandlerRequest<unknown>): Promise<HandlerResponse>;
}

export function createHandlers(service: PresenterSessionService, metrics?: PresenterMetrics): PresenterSessionHandlers {
  const m = metrics ?? nullPresenterMetrics();
  return {
    async startSession(req) {
      try {
        const body = req.body ?? ({} as CreateSessionInput);
        const idempotencyKey = readHeader(req, HEADER_IDEMPOTENCY_KEY);
        const result = await service.start({ ...body, idempotency_key: idempotencyKey }, {
          actorId: req.actor.id,
        });
        return sessionResponse(result.session);
      } catch (e) {
        return mapDomainError(e);
      }
    },

    async endSession(req) {
      const id = req.params.id;
      if (!id) return jsonResponse(400, { error: 'VALIDATION', message: 'id is required' });
      const etag = readHeader(req, HEADER_IF_MATCH);
      const parsed = parseEtag(etag);
      if (!parsed.ok) return jsonResponse(428, { error: 'PRECONDITION_REQUIRED', message: parsed.error });
      try {
        const ended = await service.end(id, { actorId: req.actor.id, expectedVersion: parsed.version! });
        return sessionResponse(ended);
      } catch (e) {
        return mapDomainError(e);
      }
    },

    async advance(req) {
      const id = req.params.id;
      if (!id) return jsonResponse(400, { error: 'VALIDATION', message: 'id is required' });
      const etag = readHeader(req, HEADER_IF_MATCH);
      const parsed = parseEtag(etag);
      if (!parsed.ok) return jsonResponse(428, { error: 'PRECONDITION_REQUIRED', message: parsed.error });
      const idempotencyKey = readHeader(req, HEADER_IDEMPOTENCY_KEY);
      try {
        const next = await service.advance(id, {
          ...(req.body ?? {}),
          expected_version: parsed.version!,
          idempotency_key: idempotencyKey,
        }, { actorId: req.actor.id });
        return sessionResponse(next);
      } catch (e) {
        return mapDomainError(e);
      }
    },

    async annotate(req) {
      const id = req.params.id;
      if (!id) return jsonResponse(400, { error: 'VALIDATION', message: 'id is required' });
      const etag = readHeader(req, HEADER_IF_MATCH);
      const parsed = parseEtag(etag);
      if (!parsed.ok) return jsonResponse(428, { error: 'PRECONDITION_REQUIRED', message: parsed.error });
      try {
        const { session } = await service.annotate(id, {
          ...(req.body ?? {}),
          expected_version: parsed.version!,
        }, { actorId: req.actor.id });
        return sessionResponse(session);
      } catch (e) {
        return mapDomainError(e);
      }
    },

    async plan(req) {
      const id = req.params.id;
      if (!id) return jsonResponse(400, { error: 'VALIDATION', message: 'id is required' });
      const etag = readHeader(req, HEADER_IF_MATCH);
      const parsed = parseEtag(etag);
      if (!parsed.ok) return jsonResponse(428, { error: 'PRECONDITION_REQUIRED', message: parsed.error });
      try {
        const next = await service.plan(id, {
          ...(req.body ?? {}),
          expected_version: parsed.version!,
        }, { actorId: req.actor.id });
        return sessionResponse(next);
      } catch (e) {
        return mapDomainError(e);
      }
    },

    async handover(req) {
      const id = req.params.id;
      if (!id) return jsonResponse(400, { error: 'VALIDATION', message: 'id is required' });
      const etag = readHeader(req, HEADER_IF_MATCH);
      const parsed = parseEtag(etag);
      if (!parsed.ok) return jsonResponse(428, { error: 'PRECONDITION_REQUIRED', message: parsed.error });
      try {
        const next = await service.handover(id, {
          ...(req.body ?? {}),
          expected_version: parsed.version!,
        }, { actorId: req.actor.id });
        return sessionResponse(next);
      } catch (e) {
        return mapDomainError(e);
      }
    },

    async failover(req) {
      const id = req.params.id;
      if (!id) return jsonResponse(400, { error: 'VALIDATION', message: 'id is required' });
      const etag = readHeader(req, HEADER_IF_MATCH);
      const parsed = parseEtag(etag);
      if (!parsed.ok) return jsonResponse(428, { error: 'PRECONDITION_REQUIRED', message: parsed.error });
      try {
        const next = await service.failover(id, {
          ...(req.body ?? {}),
          expected_version: parsed.version!,
        }, { actorId: req.actor.id });
        return sessionResponse(next);
      } catch (e) {
        return mapDomainError(e);
      }
    },

    async heartbeat(req) {
      const id = req.params.id;
      if (!id) return jsonResponse(400, { error: 'VALIDATION', message: 'id is required' });
      try {
        const next = await service.heartbeat(id, { actorId: req.actor.id });
        return sessionResponse(next);
      } catch (e) {
        return mapDomainError(e);
      }
    },

    async get(req) {
      const id = req.params.id;
      if (!id) return jsonResponse(400, { error: 'VALIDATION', message: 'id is required' });
      try {
        const row = await service.get(id);
        return sessionResponse(row);
      } catch (e) {
        return mapDomainError(e);
      }
    },

    async writeRecap(req) {
      const id = req.params.id;
      if (!id) return jsonResponse(400, { error: 'VALIDATION', message: 'id is required' });
      try {
        const next = await service.writeRecap(id, req.body ?? ({} as RecapSummaryInput), {
          actorId: req.actor.id,
        });
        return sessionResponse(next);
      } catch (e) {
        return mapDomainError(e);
      }
    },

    async getRecap(req) {
      const id = req.params.id;
      if (!id) return jsonResponse(400, { error: 'VALIDATION', message: 'id is required' });
      // The recap body is composed in the service layer; for the HTTP
      // surface we delegate to a dedicated aggregator (in workers/recap)
      // and return whatever the service surfaces. In W1 we just return
      // the session row.
      const startedAt = Date.now();
      try {
        const row = await service.get(id);
        m.recapMs.record(Date.now() - startedAt, { session_id: id, phase: 'read' });
        return sessionResponse(row);
      } catch (e) {
        return mapDomainError(e);
      }
    },
  };
}

// Re-exports for consumers that want to wire handler paths explicitly.
export { parseEtag, toEtag } from './etag.js';
export type {
  CreateSessionInput,
  AdvanceInput,
  AnnotationCommitInput,
  PlanPatchInput,
  HandoverInput,
  FailoverInput,
  RecapSummaryInput,
  DisplayProfileSnapshot,
  PipConfig,
  SessionMode,
  PresenterSession,
};