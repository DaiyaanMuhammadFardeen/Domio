/**
 * Collab REST handlers (Phase 18).
 *
 * Transport-agnostic `HttpRequest → HttpResponse` shape, no web framework dependency.
 *
 * Endpoints:
 *   POST   /v1/decks/{deck_id}/comments                           createComment
 *   GET    /v1/decks/{deck_id}/comments                            listComments
 *   PATCH  /v1/comments/{comment_id}                               updateComment
 *   POST   /v1/comments/{comment_id}/resolve                       resolveComment
 *   POST   /v1/comments/{comment_id}/reactions                     addReaction
 *   DELETE /v1/comments/{comment_id}/reactions/{emoji}             removeReaction
 *   POST   /v1/comments/{comment_id}/promote-orphan                promoteOrphan
 *   POST   /v1/decks/{deck_id}/approval-requests                   createApprovalRequest
 *   POST   /v1/approval-requests/{id}/submit                       submitApprovalRequest
 *   POST   /v1/approval-requests/{id}/decisions                    recordApprovalDecision
 *   GET    /v1/decks/{deck_id}/approval-requests                   listApprovalRequests
 *   POST   /v1/approval-requests/{id}/back-to-draft                backToDraft
 *   POST   /v1/decks/{deck_id}/assignments                         createAssignment
 *   PATCH  /v1/assignments/{assignment_id}                         updateAssignment
 *   GET    /v1/users/{user_id}/assignments                         listUserAssignments
 */

import type { CreateCommentInput, UpdateCommentInput } from './comments/types.js';
import type { CreateApprovalRequestInput, RecordDecisionInput } from './approval/types.js';
import type { CreateAssignmentInput, UpdateAssignmentInput } from './assignment/types.js';
import type { CollabService } from './service.js';
import {
  CollabValidationError,
  CommentNotFoundError,
  ApprovalRequestNotFoundError,
  InvalidTransitionError,
  InvalidAnchorError,
  InvalidSlideRangeError,
  FeatureDisabledError,
  ApprovalNotPendingError,
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

export interface CollabHandlerContext {
  readonly service: CollabService;
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
function conflict(message: string, code: string): HttpResponse {
  return { status: 409, body: { error: message, code } };
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
  if (e instanceof CollabValidationError) return badRequest(e.message, e.code);
  if (e instanceof InvalidAnchorError) return badRequest(e.message, e.code);
  if (e instanceof InvalidSlideRangeError) return badRequest(e.message, e.code);
  if (e instanceof CommentNotFoundError) return notFound(e.message);
  if (e instanceof ApprovalRequestNotFoundError) return notFound(e.message);
  if (e instanceof ApprovalNotPendingError) return conflict(e.message, e.code);
  if (e instanceof InvalidTransitionError) return conflict(e.message, e.code);
  if (e instanceof FeatureDisabledError) return serviceUnavailable(e.message, e.code);
  if (e instanceof StoreNotConfiguredError) return serviceUnavailable(e.message, e.code);
  if (e instanceof StoreNotImplementedError) return serviceUnavailable(e.message, e.code);
  if (e instanceof Error && e.message.includes('not found')) return notFound(e.message);
  if (e instanceof Error && e.message.includes('not found')) return notFound(e.message);
  throw e;
}

// ---------------------------------------------------------------------------
// POST /v1/decks/{deck_id}/comments
// ---------------------------------------------------------------------------

export async function createCommentHandler(
  req: HttpRequest<{ deck_id: string }, CreateCommentInput>,
  ctx: CollabHandlerContext,
): Promise<HttpResponse> {
  try {
    const actorId = getActorId(req);
    const { comment, mentions } = await ctx.service.createComment({
      ...req.body,
      workspaceId: req.body.workspaceId,
      deckId: req.params.deck_id,
      actorId,
    });
    return created({ comment, mentions });
  } catch (e) {
    return mapError(e);
  }
}

// ---------------------------------------------------------------------------
// GET /v1/decks/{deck_id}/comments
// ---------------------------------------------------------------------------

export async function listCommentsHandler(
  req: HttpRequest<{ deck_id: string }, undefined, { threadId?: string; status?: string }>,
  ctx: CollabHandlerContext,
): Promise<HttpResponse> {
  try {
    const opts: { threadId?: string; status?: string } = {};
    if (req.query.threadId) opts.threadId = req.query.threadId;
    if (req.query.status) opts.status = req.query.status;
    const comments = await ctx.service.listComments(req.params.deck_id, opts);
    return ok({ comments });
  } catch (e) {
    return mapError(e);
  }
}

// ---------------------------------------------------------------------------
// PATCH /v1/comments/{comment_id}
// ---------------------------------------------------------------------------

export async function updateCommentHandler(
  req: HttpRequest<{ comment_id: string }, UpdateCommentInput>,
  ctx: CollabHandlerContext,
): Promise<HttpResponse> {
  try {
    const comment = await ctx.service.updateComment(req.params.comment_id, req.body);
    return ok({ comment });
  } catch (e) {
    return mapError(e);
  }
}

// ---------------------------------------------------------------------------
// POST /v1/comments/{comment_id}/resolve
// ---------------------------------------------------------------------------

export async function resolveCommentHandler(
  req: HttpRequest<{ comment_id: string }, Record<string, never>>,
  ctx: CollabHandlerContext,
): Promise<HttpResponse> {
  try {
    const actorId = getActorId(req);
    const comment = await ctx.service.resolveComment(req.params.comment_id, actorId);
    return ok({ comment });
  } catch (e) {
    return mapError(e);
  }
}

// ---------------------------------------------------------------------------
// POST /v1/comments/{comment_id}/reactions
// ---------------------------------------------------------------------------

export async function addReactionHandler(
  req: HttpRequest<{ comment_id: string }, { emoji: string }>,
  ctx: CollabHandlerContext,
): Promise<HttpResponse> {
  try {
    const actorId = getActorId(req);
    const comment = await ctx.service.addReaction(req.params.comment_id, req.body.emoji, actorId);
    return ok({ comment });
  } catch (e) {
    return mapError(e);
  }
}

// ---------------------------------------------------------------------------
// DELETE /v1/comments/{comment_id}/reactions/{emoji}
// ---------------------------------------------------------------------------

export async function removeReactionHandler(
  req: HttpRequest<{ comment_id: string; emoji: string }>,
  ctx: CollabHandlerContext,
): Promise<HttpResponse> {
  try {
    const actorId = getActorId(req);
    const comment = await ctx.service.removeReaction(
      req.params.comment_id,
      req.params.emoji,
      actorId,
    );
    return ok({ comment });
  } catch (e) {
    return mapError(e);
  }
}

// ---------------------------------------------------------------------------
// POST /v1/comments/{comment_id}/promote-orphan
// ---------------------------------------------------------------------------

export async function promoteOrphanHandler(
  req: HttpRequest<{ comment_id: string }, { slideTargetId: string }>,
  ctx: CollabHandlerContext,
): Promise<HttpResponse> {
  try {
    const comment = await ctx.service.promoteOrphan(req.params.comment_id, req.body.slideTargetId);
    return ok({ comment });
  } catch (e) {
    return mapError(e);
  }
}

// ---------------------------------------------------------------------------
// POST /v1/decks/{deck_id}/approval-requests
// ---------------------------------------------------------------------------

export async function createApprovalRequestHandler(
  req: HttpRequest<{ deck_id: string }, CreateApprovalRequestInput>,
  ctx: CollabHandlerContext,
): Promise<HttpResponse> {
  try {
    const actorId = getActorId(req);
    const { request, autoSubmitted } = await ctx.service.createApprovalRequest({
      ...req.body,
      deckId: req.params.deck_id,
      actorId,
    });
    return created({ request, autoSubmitted });
  } catch (e) {
    return mapError(e);
  }
}

// ---------------------------------------------------------------------------
// POST /v1/approval-requests/{id}/submit
// ---------------------------------------------------------------------------

export async function submitApprovalRequestHandler(
  req: HttpRequest<{ id: string }, Record<string, never>>,
  ctx: CollabHandlerContext,
): Promise<HttpResponse> {
  try {
    const actorId = getActorId(req);
    const request = await ctx.service.submitApprovalRequest(req.params.id, actorId);
    return ok({ request });
  } catch (e) {
    return mapError(e);
  }
}

// ---------------------------------------------------------------------------
// POST /v1/approval-requests/{id}/decisions
// ---------------------------------------------------------------------------

export async function recordApprovalDecisionHandler(
  req: HttpRequest<{ id: string }, RecordDecisionInput>,
  ctx: CollabHandlerContext,
): Promise<HttpResponse> {
  try {
    const actorId = getActorId(req);
    const { decision, request } = await ctx.service.recordApprovalDecision(
      req.params.id,
      req.body,
      actorId,
    );
    return ok({ decision, request });
  } catch (e) {
    return mapError(e);
  }
}

// ---------------------------------------------------------------------------
// GET /v1/decks/{deck_id}/approval-requests
// ---------------------------------------------------------------------------

export async function listApprovalRequestsHandler(
  req: HttpRequest<{ deck_id: string }, undefined, { status?: string }>,
  ctx: CollabHandlerContext,
): Promise<HttpResponse> {
  try {
    const opts: { status?: string } = {};
    if (req.query.status) opts.status = req.query.status;
    const requests = await ctx.service.listApprovalRequests(req.params.deck_id, opts);
    return ok({ requests });
  } catch (e) {
    return mapError(e);
  }
}

// ---------------------------------------------------------------------------
// POST /v1/approval-requests/{id}/back-to-draft
// ---------------------------------------------------------------------------

export async function backToDraftHandler(
  req: HttpRequest<{ id: string }, Record<string, never>>,
  ctx: CollabHandlerContext,
): Promise<HttpResponse> {
  try {
    const actorId = getActorId(req);
    const request = await ctx.service.backToDraft(req.params.id, actorId);
    return ok({ request });
  } catch (e) {
    return mapError(e);
  }
}

// ---------------------------------------------------------------------------
// POST /v1/decks/{deck_id}/assignments
// ---------------------------------------------------------------------------

export async function createAssignmentHandler(
  req: HttpRequest<{ deck_id: string }, CreateAssignmentInput>,
  ctx: CollabHandlerContext,
): Promise<HttpResponse> {
  try {
    const actorId = getActorId(req);
    const assignment = await ctx.service.createAssignment(
      {
        ...req.body,
        deckId: req.params.deck_id,
      },
      actorId,
    );
    return created({ assignment });
  } catch (e) {
    return mapError(e);
  }
}

// ---------------------------------------------------------------------------
// PATCH /v1/assignments/{assignment_id}
// ---------------------------------------------------------------------------

export async function updateAssignmentHandler(
  req: HttpRequest<{ assignment_id: string }, UpdateAssignmentInput>,
  ctx: CollabHandlerContext,
): Promise<HttpResponse> {
  try {
    const actorId = getActorId(req);
    const { assignment, reassigned } = await ctx.service.updateAssignment(
      req.params.assignment_id,
      req.body,
      actorId,
    );
    return ok({ assignment, reassigned });
  } catch (e) {
    return mapError(e);
  }
}

// ---------------------------------------------------------------------------
// GET /v1/users/{user_id}/assignments
// ---------------------------------------------------------------------------

export async function listUserAssignmentsHandler(
  req: HttpRequest<{ user_id: string }>,
  ctx: CollabHandlerContext,
): Promise<HttpResponse> {
  try {
    const assignments = await ctx.service.listUserAssignments(req.params.user_id);
    return ok({ assignments });
  } catch (e) {
    return mapError(e);
  }
}

// ---------------------------------------------------------------------------
// Export handlers map
// ---------------------------------------------------------------------------

export const handlers = {
  createComment: createCommentHandler,
  listComments: listCommentsHandler,
  updateComment: updateCommentHandler,
  resolveComment: resolveCommentHandler,
  addReaction: addReactionHandler,
  removeReaction: removeReactionHandler,
  promoteOrphan: promoteOrphanHandler,
  createApprovalRequest: createApprovalRequestHandler,
  submitApprovalRequest: submitApprovalRequestHandler,
  recordApprovalDecision: recordApprovalDecisionHandler,
  listApprovalRequests: listApprovalRequestsHandler,
  backToDraft: backToDraftHandler,
  createAssignment: createAssignmentHandler,
  updateAssignment: updateAssignmentHandler,
  listUserAssignments: listUserAssignmentsHandler,
} as const;
