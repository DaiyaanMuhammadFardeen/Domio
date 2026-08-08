/**
 * @domio/annotation-engine — transport-agnostic HTTP handlers.
 *
 * Each handler reads `If-Match` for the optimistic-CC etag and
 * `Idempotency-Key` for replay safety. The runtime is expected to
 * inject `workspace_id` from the authenticated session.
 */

import type { AnnotationService } from './service.js';
import type {
  AnnotationCommitInput,
  AnnotationPromoteInput,
  AnnotationRollbackInput,
} from './types.js';
import {
  AnnotationConflictError,
  AnnotationNotFoundError,
  AnnotationValidationError,
} from './types.js';

export interface HandlerRequest<B> {
  params: Record<string, string>;
  headers: Record<string, string | string[] | undefined>;
  body: B;
  actor: { id: string; workspace_id: string };
  idempotencyKey?: string | undefined;
}

export interface HandlerResponse<T> {
  status: number;
  body: T;
  headers?: Record<string, string>;
}

const OK_HEADERS = { 'content-type': 'application/json' };

function json<T>(status: number, body: T, extra?: Record<string, string>): HandlerResponse<T> {
  return { status, body, headers: { ...OK_HEADERS, ...(extra ?? {}) } };
}

function readHeader(headers: HandlerRequest<unknown>['headers'], name: string): string | undefined {
  const v = headers[name.toLowerCase()];
  if (Array.isArray(v)) return v[0];
  return typeof v === 'string' ? v : undefined;
}

function mapDomainError(e: unknown): HandlerResponse<{ error: string; code: string }> {
  if (e instanceof AnnotationValidationError) {
    return { status: 400, body: { error: e.message, code: e.code }, headers: OK_HEADERS };
  }
  if (e instanceof AnnotationNotFoundError) {
    return { status: 404, body: { error: e.message, code: e.code }, headers: OK_HEADERS };
  }
  if (e instanceof AnnotationConflictError) {
    return { status: 409, body: { error: e.message, code: e.code }, headers: OK_HEADERS };
  }
  return { status: 500, body: { error: 'internal error', code: 'INTERNAL' }, headers: OK_HEADERS };
}

export interface AnnotationHandlerDeps {
  service: AnnotationService;
}

export interface AnnotationCommitBody {
  slide_id: string;
  layer_id?: string;
  kind: AnnotationCommitInput['kind'];
  geometry: AnnotationCommitInput['geometry'];
  style?: Record<string, unknown>;
  color?: string;
  stroke_width?: number;
  ephemeral?: boolean;
  drawn_by: string;
  drawn_by_display_name?: string;
  expected_version?: number;
}

export class AnnotationHandlers {
  constructor(private readonly deps: AnnotationHandlerDeps) {}

  commit = async (
    req: HandlerRequest<AnnotationCommitBody>,
  ): Promise<HandlerResponse<unknown>> => {
    const sessionId = req.params['sessionId'];
    if (!sessionId) return mapDomainError(new AnnotationValidationError('sessionId required'));
    const ifMatch = readHeader(req.headers, 'if-match');
    const headerVersion = ifMatch ? parseInt(stripQuotes(ifMatch), 10) : undefined;
    const expected = headerVersion ?? req.body.expected_version;
    if (expected === undefined || !Number.isInteger(expected) || expected < 1) {
      return mapDomainError(new AnnotationValidationError('expected_version required (If-Match header)'));
    }

    try {
      const commitInput: AnnotationCommitInput = {
        session_id: sessionId,
        workspace_id: req.actor.workspace_id,
        slide_id: req.body.slide_id,
        kind: req.body.kind,
        geometry: req.body.geometry,
        drawn_by: req.body.drawn_by,
        expected_version: expected,
      };
      if (req.body.layer_id !== undefined) commitInput.layer_id = req.body.layer_id;
      if (req.body.style !== undefined) commitInput.style = req.body.style;
      if (req.body.color !== undefined) commitInput.color = req.body.color;
      if (req.body.stroke_width !== undefined) commitInput.stroke_width = req.body.stroke_width;
      if (req.body.ephemeral !== undefined) commitInput.ephemeral = req.body.ephemeral;
      if (req.body.drawn_by_display_name !== undefined) {
        commitInput.drawn_by_display_name = req.body.drawn_by_display_name;
      }
      if (req.idempotencyKey !== undefined) commitInput.idempotency_key = req.idempotencyKey;
      const result = await this.deps.service.commit(
        commitInput,
        { actorId: req.actor.id },
      );
      return json(201, result, { etag: `"${result.version}"` });
    } catch (e) {
      return mapDomainError(e);
    }
  };

  rollback = async (
    req: HandlerRequest<{ annotation_id: string }>,
  ): Promise<HandlerResponse<unknown>> => {
    const sessionId = req.params['sessionId'];
    if (!sessionId) return mapDomainError(new AnnotationValidationError('sessionId required'));
    const ifMatch = readHeader(req.headers, 'if-match');
    const expected = ifMatch ? parseInt(stripQuotes(ifMatch), 10) : 1;
    if (!Number.isInteger(expected) || expected < 1) {
      return mapDomainError(new AnnotationValidationError('expected_version required (If-Match header)'));
    }
    const body: AnnotationRollbackInput = {
      session_id: sessionId,
      workspace_id: req.actor.workspace_id,
      annotation_id: req.body.annotation_id,
      expected_version: expected,
    };
    if (req.idempotencyKey) {
      body.idempotency_key = req.idempotencyKey;
    }
    try {
      await this.deps.service.rollback(body, { actorId: req.actor.id });
      return json(200, { ok: true });
    } catch (e) {
      return mapDomainError(e);
    }
  };

  promote = async (
    req: HandlerRequest<{ annotation_id: string }>,
  ): Promise<HandlerResponse<unknown>> => {
    const sessionId = req.params['sessionId'];
    if (!sessionId) return mapDomainError(new AnnotationValidationError('sessionId required'));
    const ifMatch = readHeader(req.headers, 'if-match');
    const expected = ifMatch ? parseInt(stripQuotes(ifMatch), 10) : 1;
    if (!Number.isInteger(expected) || expected < 1) {
      return mapDomainError(new AnnotationValidationError('expected_version required (If-Match header)'));
    }
    const body: AnnotationPromoteInput = {
      session_id: sessionId,
      workspace_id: req.actor.workspace_id,
      annotation_id: req.body.annotation_id,
      expected_version: expected,
    };
    if (req.idempotencyKey) {
      body.idempotency_key = req.idempotencyKey;
    }
    try {
      const promoted = await this.deps.service.promote(body, { actorId: req.actor.id });
      return json(200, promoted, { etag: `"${expected}"` });
    } catch (e) {
      return mapDomainError(e);
    }
  };

  list = async (
    req: HandlerRequest<{ ephemeral?: boolean } | undefined>,
  ): Promise<HandlerResponse<unknown>> => {
    const sessionId = req.params['sessionId'];
    if (!sessionId) return mapDomainError(new AnnotationValidationError('sessionId required'));
    const ephemeral = req.body?.ephemeral ?? true;
    try {
      const items = await this.deps.service.listForSession(sessionId, ephemeral);
      return json(200, { items });
    } catch (e) {
      return mapDomainError(e);
    }
  };
}

function stripQuotes(s: string): string {
  return s.replace(/^"|"$/g, '');
}