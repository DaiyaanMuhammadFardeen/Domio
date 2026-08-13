/**
 * Meeting integration REST handlers (Phase 18).
 *
 * Transport-agnostic `HttpRequest → HttpResponse` shape, no web framework dependency.
 *
 * Operation IDs (from collab.yaml):
 *   getMeetingIntegrationStatus
 *   connectMeetingIntegration
 *   disconnectMeetingIntegration
 *   issueMeetingToken
 *   recordMeetingMarker
 */

import type { Vendor, MeetingIntegrationInput, RecordMarkerInput } from './types.js';
import type { MeetingIntegrationService } from './service.js';
import {
  ValidationError,
  IntegrationNotFoundError,
  TokenInvalidError,
  MeetingNotActiveError,
  FeatureDisabledError,
} from './types.js';
import { StoreNotConfiguredError, StoreNotImplementedError } from './store/pg_store.js';

// ---------------------------------------------------------------------------
// HTTP types
// ---------------------------------------------------------------------------

export interface HttpRequest<P = unknown, B = unknown, Q = Record<string, string | undefined>> {
  readonly method: string;
  readonly path: string;
  readonly params: P;
  readonly body: B;
  readonly query: Q;
  readonly headers: Record<string, string | undefined>;
}

export interface HttpResponse {
  readonly status: number;
  readonly body: unknown;
}

export interface MeetingHandlerContext {
  readonly service: MeetingIntegrationService;
}

// ---------------------------------------------------------------------------
// Response helpers
// ---------------------------------------------------------------------------

function ok<T>(body: T): HttpResponse {
  return { status: 200, body };
}
function created<T>(body: T): HttpResponse {
  return { status: 201, body };
}
function badRequest(message: string, code: string): HttpResponse {
  return { status: 400, body: { error: message, code } };
}
function notFound(message: string): HttpResponse {
  return { status: 404, body: { error: message, code: 'NOT_FOUND' } };
}
function unauthorized(message: string, code: string): HttpResponse {
  return { status: 401, body: { error: message, code } };
}
function serviceUnavailable(message: string, code: string): HttpResponse {
  return { status: 503, body: { error: message, code } };
}

// ---------------------------------------------------------------------------
// Actor helper
// ---------------------------------------------------------------------------

function getActorId(req: HttpRequest): string {
  return (
    req.headers['x-actor-id'] ?? (req.query as Record<string, string | undefined>).actorId ?? ''
  );
}

// ---------------------------------------------------------------------------
// Error mapping
// ---------------------------------------------------------------------------

function mapError(e: unknown): HttpResponse {
  if (e instanceof ValidationError) return badRequest(e.message, e.code);
  if (e instanceof IntegrationNotFoundError) return notFound(e.message);
  if (e instanceof TokenInvalidError) return unauthorized(e.message, e.code);
  if (e instanceof MeetingNotActiveError) return badRequest(e.message, e.code);
  if (e instanceof FeatureDisabledError) return serviceUnavailable(e.message, e.code);
  if (e instanceof StoreNotConfiguredError) return serviceUnavailable(e.message, e.code);
  if (e instanceof StoreNotImplementedError) return serviceUnavailable(e.message, e.code);
  if (e instanceof Error && e.message.includes('not found')) return notFound(e.message);
  throw e;
}

// ---------------------------------------------------------------------------
// GET /v1/meeting-integrations/:vendor/status
// operationId: getMeetingIntegrationStatus
// ---------------------------------------------------------------------------

export async function getMeetingIntegrationStatusHandler(
  req: HttpRequest<{ vendor: Vendor }, undefined, { workspace_id?: string }>,
  ctx: MeetingHandlerContext,
): Promise<HttpResponse> {
  try {
    const workspaceId = req.query.workspace_id ?? '';
    if (!workspaceId) {
      return badRequest('workspace_id is required', 'VALIDATION_ERROR');
    }
    const { status, integration } = await ctx.service.getStatus(workspaceId, req.params.vendor);
    return ok({ status, integration });
  } catch (e) {
    return mapError(e);
  }
}

// ---------------------------------------------------------------------------
// POST /v1/meeting-integrations/:vendor/connect
// operationId: connectMeetingIntegration
// ---------------------------------------------------------------------------

export async function connectMeetingIntegrationHandler(
  req: HttpRequest<{ vendor: Vendor }, MeetingIntegrationInput & { deck_id?: string }>,
  ctx: MeetingHandlerContext,
): Promise<HttpResponse> {
  try {
    const actorId = getActorId(req);
    const integration = await ctx.service.connect(
      {
        workspace_id: req.body.workspace_id,
        vendor: req.params.vendor,
        auth: req.body.auth,
        connected_by: actorId || req.body.connected_by,
      },
      req.body.deck_id,
    );
    return created({ integration });
  } catch (e) {
    return mapError(e);
  }
}

// ---------------------------------------------------------------------------
// POST /v1/meeting-integrations/:vendor/disconnect
// operationId: disconnectMeetingIntegration
// ---------------------------------------------------------------------------

export async function disconnectMeetingIntegrationHandler(
  req: HttpRequest<{ vendor: Vendor }, { deck_id?: string }, { workspace_id?: string }>,
  ctx: MeetingHandlerContext,
): Promise<HttpResponse> {
  try {
    const workspaceId = req.query.workspace_id ?? '';
    if (!workspaceId) {
      return badRequest('workspace_id is required', 'VALIDATION_ERROR');
    }
    const integration = await ctx.service.disconnect(
      workspaceId,
      req.params.vendor,
      req.body.deck_id,
    );
    return ok({ integration });
  } catch (e) {
    return mapError(e);
  }
}

// ---------------------------------------------------------------------------
// POST /v1/meeting-integrations/:vendor/token
// operationId: issueMeetingToken
// ---------------------------------------------------------------------------

export async function issueMeetingTokenHandler(
  req: HttpRequest<
    { vendor: Vendor },
    {
      workspace_id: string;
      meeting_id: string;
      presenter_id: string;
      deck_id: string;
      meeting_end_at: string;
    }
  >,
  ctx: MeetingHandlerContext,
): Promise<HttpResponse> {
  try {
    const token = await ctx.service.issueToken(
      req.body.workspace_id,
      req.params.vendor,
      req.body.meeting_id,
      req.body.presenter_id,
      req.body.deck_id,
      new Date(req.body.meeting_end_at),
    );
    return created({ token });
  } catch (e) {
    return mapError(e);
  }
}

// ---------------------------------------------------------------------------
// POST /v1/meeting-markers
// operationId: recordMeetingMarker
// ---------------------------------------------------------------------------

export async function recordMeetingMarkerHandler(
  req: HttpRequest<Record<string, never>, RecordMarkerInput>,
  ctx: MeetingHandlerContext,
): Promise<HttpResponse> {
  try {
    const { marker, isFirst } = await ctx.service.recordMarker({
      meeting_id: req.body.meeting_id,
      slide_id: req.body.slide_id,
      transitioned_at: new Date(req.body.transitioned_at),
    });
    return created({ marker, is_first: isFirst });
  } catch (e) {
    return mapError(e);
  }
}

// ---------------------------------------------------------------------------
// Export handlers map
// ---------------------------------------------------------------------------

export const handlers = {
  getMeetingIntegrationStatus: getMeetingIntegrationStatusHandler,
  connectMeetingIntegration: connectMeetingIntegrationHandler,
  disconnectMeetingIntegration: disconnectMeetingIntegrationHandler,
  issueMeetingToken: issueMeetingTokenHandler,
  recordMeetingMarker: recordMeetingMarkerHandler,
} as const;
