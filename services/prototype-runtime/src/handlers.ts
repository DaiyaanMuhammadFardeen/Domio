/** Phase 10 prototype-runtime service — REST handlers (web-framework-free). */

import {
  NotFoundError,
  VersionConflictError,
  DuplicateBranchingEdgeError,
  DuplicateVariableNameError,
  VariableValidationError,
} from './dal.js';
import { ExpressionCompileError } from './service.js';
import type { PrototypeRuntimeService } from './service.js';
import type { PrototypeMetrics } from './metrics.js';
import type { PrototypeAuditRecorder } from './audit.js';
import {
  validateCreateHotspot,
  validatePatchHotspot,
  validateCreateOverlay,
  validatePatchOverlay,
  validateCreateBranchingEdge,
  validatePatchBranchingEdge,
  validateCreateVariable,
  validatePatchVariable,
  validateCreateVariableBinding,
  validateCreateConditionalRule,
  validatePatchConditionalRule,
  validateCreateInteractionState,
  validatePatchInteractionState,
  validateTransitionInput,
  validateCreateQuiz,
  validatePatchQuiz,
  validateQuizAnswer,
  validateStartAttempt,
  validateLlmReviewUpdate,
  validateCreatePresentationSequence,
  validatePatchPresentationSequence,
} from './schemas.js';
import { P10_METRICS } from './metrics.js';

// ── HTTP types ──────────────────────────────────────────────────────────

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

export interface PrototypeHandlerContext {
  readonly service: PrototypeRuntimeService;
  readonly metrics?: PrototypeMetrics;
  readonly audit?: PrototypeAuditRecorder;
  resolveActorId?: (req: HttpRequest) => string | undefined;
}

function ok<T>(body: T): HttpResponse {
  return { status: 200, body };
}
function created<T>(body: T): HttpResponse {
  return { status: 201, body };
}
function noContent(): HttpResponse {
  return { status: 204, body: null };
}
function badRequest(message: string, code: string): HttpResponse {
  return { status: 400, body: { error: message, code } };
}
function unauthorized(): HttpResponse {
  return { status: 401, body: { error: 'Unauthorized', code: 'UNAUTHORIZED' } };
}
function notFound(message: string): HttpResponse {
  return { status: 404, body: { error: message, code: 'NOT_FOUND' } };
}
function conflict(message: string, code: string, extra?: Record<string, unknown>): HttpResponse {
  return { status: 409, body: { error: message, code, ...(extra ?? {}) } };
}
function unprocessable(message: string, code: string, details?: unknown): HttpResponse {
  return {
    status: 422,
    body: { error: message, code, ...(details !== undefined ? { details } : {}) },
  };
}

// ── Hotspot handlers ────────────────────────────────────────────────────

export async function listHotspotsHandler(
  req: HttpRequest<{ deck_id: string }, undefined, { tenant_id?: string; slide_id?: string }>,
  ctx: PrototypeHandlerContext,
): Promise<HttpResponse> {
  const tenantId = req.query.tenant_id ?? ctx.resolveActorId?.(req);
  if (!tenantId) return unauthorized();
  const items = await ctx.service.listHotspots(tenantId, req.params.deck_id, req.query.slide_id);
  return ok({ items });
}

export async function createHotspotHandler(
  req: HttpRequest<{ deck_id: string }, Record<string, unknown>, { tenant_id?: string }>,
  ctx: PrototypeHandlerContext,
): Promise<HttpResponse> {
  const tenantId = req.query.tenant_id ?? ctx.resolveActorId?.(req);
  if (!tenantId) return unauthorized();
  const v = validateCreateHotspot(req.body);
  if (!v.valid) {
    ctx.metrics?.inc(P10_METRICS.validationFailed);
    return badRequest(v.errors.map((e) => e.message).join('; '), 'VALIDATION_ERROR');
  }
  try {
    const record = await ctx.service.createHotspot(tenantId, req.params.deck_id, v.value!);
    ctx.metrics?.inc(P10_METRICS.created);
    ctx.audit?.record({
      tenantId,
      actorId: tenantId,
      action: 'hotspot.create',
      payload: { hotspotId: record.id },
    });
    return created(record);
  } catch (e) {
    return mapError(e, ctx);
  }
}

export async function getHotspotHandler(
  req: HttpRequest<{ id: string }, undefined, { tenant_id?: string }>,
  ctx: PrototypeHandlerContext,
): Promise<HttpResponse> {
  const tenantId = req.query.tenant_id ?? ctx.resolveActorId?.(req);
  if (!tenantId) return unauthorized();
  try {
    return ok(await ctx.service.getHotspot(tenantId, req.params.id));
  } catch (e) {
    return mapError(e, ctx);
  }
}

export async function patchHotspotHandler(
  req: HttpRequest<{ id: string }, Record<string, unknown>, { tenant_id?: string }>,
  ctx: PrototypeHandlerContext,
): Promise<HttpResponse> {
  const tenantId = req.query.tenant_id ?? ctx.resolveActorId?.(req);
  if (!tenantId) return unauthorized();
  const v = validatePatchHotspot(req.body);
  if (!v.valid) {
    ctx.metrics?.inc(P10_METRICS.validationFailed);
    return badRequest(v.errors.map((e) => e.message).join('; '), 'VALIDATION_ERROR');
  }
  try {
    const record = await ctx.service.patchHotspot(tenantId, req.params.id, v.value!);
    ctx.metrics?.inc(P10_METRICS.updated);
    return ok(record);
  } catch (e) {
    return mapError(e, ctx);
  }
}

export async function deleteHotspotHandler(
  req: HttpRequest<{ id: string }, undefined, { tenant_id?: string }>,
  ctx: PrototypeHandlerContext,
): Promise<HttpResponse> {
  const tenantId = req.query.tenant_id ?? ctx.resolveActorId?.(req);
  if (!tenantId) return unauthorized();
  try {
    await ctx.service.deleteHotspot(tenantId, req.params.id);
    ctx.metrics?.inc(P10_METRICS.deleted);
    return noContent();
  } catch (e) {
    return mapError(e, ctx);
  }
}

// ── Overlay handlers ────────────────────────────────────────────────────

export async function listOverlaysHandler(
  req: HttpRequest<{ deck_id: string }, undefined, { tenant_id?: string; slide_id?: string }>,
  ctx: PrototypeHandlerContext,
): Promise<HttpResponse> {
  const tenantId = req.query.tenant_id ?? ctx.resolveActorId?.(req);
  if (!tenantId) return unauthorized();
  const items = await ctx.service.listOverlays(tenantId, req.params.deck_id, req.query.slide_id);
  return ok({ items });
}

export async function createOverlayHandler(
  req: HttpRequest<{ deck_id: string }, Record<string, unknown>, { tenant_id?: string }>,
  ctx: PrototypeHandlerContext,
): Promise<HttpResponse> {
  const tenantId = req.query.tenant_id ?? ctx.resolveActorId?.(req);
  if (!tenantId) return unauthorized();
  const v = validateCreateOverlay(req.body);
  if (!v.valid) return badRequest(v.errors.map((e) => e.message).join('; '), 'VALIDATION_ERROR');
  try {
    const record = await ctx.service.createOverlay(tenantId, req.params.deck_id, v.value!);
    ctx.metrics?.inc(P10_METRICS.created);
    return created(record);
  } catch (e) {
    return mapError(e, ctx);
  }
}

export async function getOverlayHandler(
  req: HttpRequest<{ id: string }, undefined, { tenant_id?: string }>,
  ctx: PrototypeHandlerContext,
): Promise<HttpResponse> {
  const tenantId = req.query.tenant_id ?? ctx.resolveActorId?.(req);
  if (!tenantId) return unauthorized();
  try {
    return ok(await ctx.service.getOverlay(tenantId, req.params.id));
  } catch (e) {
    return mapError(e, ctx);
  }
}

export async function patchOverlayHandler(
  req: HttpRequest<{ id: string }, Record<string, unknown>, { tenant_id?: string }>,
  ctx: PrototypeHandlerContext,
): Promise<HttpResponse> {
  const tenantId = req.query.tenant_id ?? ctx.resolveActorId?.(req);
  if (!tenantId) return unauthorized();
  const v = validatePatchOverlay(req.body);
  if (!v.valid) return badRequest(v.errors.map((e) => e.message).join('; '), 'VALIDATION_ERROR');
  try {
    const record = await ctx.service.patchOverlay(tenantId, req.params.id, v.value!, req.body);
    ctx.metrics?.inc(P10_METRICS.updated);
    return ok(record);
  } catch (e) {
    return mapError(e, ctx);
  }
}

export async function deleteOverlayHandler(
  req: HttpRequest<{ id: string }, undefined, { tenant_id?: string }>,
  ctx: PrototypeHandlerContext,
): Promise<HttpResponse> {
  const tenantId = req.query.tenant_id ?? ctx.resolveActorId?.(req);
  if (!tenantId) return unauthorized();
  try {
    await ctx.service.deleteOverlay(tenantId, req.params.id);
    ctx.metrics?.inc(P10_METRICS.deleted);
    return noContent();
  } catch (e) {
    return mapError(e, ctx);
  }
}

// ── Branching edge handlers ─────────────────────────────────────────────

export async function listBranchingEdgesHandler(
  req: HttpRequest<{ deck_id: string }, undefined, { tenant_id?: string }>,
  ctx: PrototypeHandlerContext,
): Promise<HttpResponse> {
  const tenantId = req.query.tenant_id ?? ctx.resolveActorId?.(req);
  if (!tenantId) return unauthorized();
  const items = await ctx.service.listBranchingEdges(tenantId, req.params.deck_id);
  return ok({ items });
}

export async function createBranchingEdgeHandler(
  req: HttpRequest<{ deck_id: string }, Record<string, unknown>, { tenant_id?: string }>,
  ctx: PrototypeHandlerContext,
): Promise<HttpResponse> {
  const tenantId = req.query.tenant_id ?? ctx.resolveActorId?.(req);
  if (!tenantId) return unauthorized();
  const v = validateCreateBranchingEdge(req.body);
  if (!v.valid) return unprocessable(v.errors.map((e) => e.message).join('; '), 'VALIDATION_ERROR');
  try {
    const record = await ctx.service.createBranchingEdge(tenantId, req.params.deck_id, v.value!);
    ctx.metrics?.inc(P10_METRICS.created);
    return created(record);
  } catch (e) {
    return mapError(e, ctx);
  }
}

export async function getBranchingEdgeHandler(
  req: HttpRequest<{ id: string }, undefined, { tenant_id?: string }>,
  ctx: PrototypeHandlerContext,
): Promise<HttpResponse> {
  const tenantId = req.query.tenant_id ?? ctx.resolveActorId?.(req);
  if (!tenantId) return unauthorized();
  try {
    return ok(await ctx.service.getBranchingEdge(tenantId, req.params.id));
  } catch (e) {
    return mapError(e, ctx);
  }
}

export async function patchBranchingEdgeHandler(
  req: HttpRequest<{ id: string }, Record<string, unknown>, { tenant_id?: string }>,
  ctx: PrototypeHandlerContext,
): Promise<HttpResponse> {
  const tenantId = req.query.tenant_id ?? ctx.resolveActorId?.(req);
  if (!tenantId) return unauthorized();
  const v = validatePatchBranchingEdge(req.body);
  if (!v.valid) return badRequest(v.errors.map((e) => e.message).join('; '), 'VALIDATION_ERROR');
  try {
    const record = await ctx.service.patchBranchingEdge(tenantId, req.params.id, v.value!);
    ctx.metrics?.inc(P10_METRICS.updated);
    return ok(record);
  } catch (e) {
    return mapError(e, ctx);
  }
}

export async function deleteBranchingEdgeHandler(
  req: HttpRequest<{ id: string }, undefined, { tenant_id?: string }>,
  ctx: PrototypeHandlerContext,
): Promise<HttpResponse> {
  const tenantId = req.query.tenant_id ?? ctx.resolveActorId?.(req);
  if (!tenantId) return unauthorized();
  try {
    await ctx.service.deleteBranchingEdge(tenantId, req.params.id);
    ctx.metrics?.inc(P10_METRICS.deleted);
    return noContent();
  } catch (e) {
    return mapError(e, ctx);
  }
}

// ── Variable handlers ───────────────────────────────────────────────────

export async function listVariablesHandler(
  req: HttpRequest<{ deck_id: string }, undefined, { tenant_id?: string }>,
  ctx: PrototypeHandlerContext,
): Promise<HttpResponse> {
  const tenantId = req.query.tenant_id ?? ctx.resolveActorId?.(req);
  if (!tenantId) return unauthorized();
  const items = await ctx.service.listVariables(tenantId, req.params.deck_id);
  return ok({ items });
}

export async function createVariableHandler(
  req: HttpRequest<{ deck_id: string }, Record<string, unknown>, { tenant_id?: string }>,
  ctx: PrototypeHandlerContext,
): Promise<HttpResponse> {
  const tenantId = req.query.tenant_id ?? ctx.resolveActorId?.(req);
  if (!tenantId) return unauthorized();
  const v = validateCreateVariable(req.body);
  if (!v.valid) return unprocessable(v.errors.map((e) => e.message).join('; '), 'VALIDATION_ERROR');
  try {
    const record = await ctx.service.createVariable(tenantId, req.params.deck_id, v.value!);
    ctx.metrics?.inc(P10_METRICS.created);
    return created(record);
  } catch (e) {
    return mapError(e, ctx);
  }
}

export async function getVariableHandler(
  req: HttpRequest<{ id: string }, undefined, { tenant_id?: string }>,
  ctx: PrototypeHandlerContext,
): Promise<HttpResponse> {
  const tenantId = req.query.tenant_id ?? ctx.resolveActorId?.(req);
  if (!tenantId) return unauthorized();
  try {
    return ok(await ctx.service.getVariable(tenantId, req.params.id));
  } catch (e) {
    return mapError(e, ctx);
  }
}

export async function patchVariableHandler(
  req: HttpRequest<{ id: string }, Record<string, unknown>, { tenant_id?: string }>,
  ctx: PrototypeHandlerContext,
): Promise<HttpResponse> {
  const tenantId = req.query.tenant_id ?? ctx.resolveActorId?.(req);
  if (!tenantId) return unauthorized();
  const v = validatePatchVariable(req.body);
  if (!v.valid) return badRequest(v.errors.map((e) => e.message).join('; '), 'VALIDATION_ERROR');
  try {
    const record = await ctx.service.patchVariable(tenantId, req.params.id, v.value!, req.body);
    ctx.metrics?.inc(P10_METRICS.updated);
    return ok(record);
  } catch (e) {
    return mapError(e, ctx);
  }
}

export async function deleteVariableHandler(
  req: HttpRequest<{ id: string }, undefined, { tenant_id?: string }>,
  ctx: PrototypeHandlerContext,
): Promise<HttpResponse> {
  const tenantId = req.query.tenant_id ?? ctx.resolveActorId?.(req);
  if (!tenantId) return unauthorized();
  try {
    await ctx.service.deleteVariable(tenantId, req.params.id);
    ctx.metrics?.inc(P10_METRICS.deleted);
    return noContent();
  } catch (e) {
    return mapError(e, ctx);
  }
}

// ── Variable binding handlers ───────────────────────────────────────────

export async function listVariableBindingsHandler(
  req: HttpRequest<{ deck_id: string }, undefined, { tenant_id?: string }>,
  ctx: PrototypeHandlerContext,
): Promise<HttpResponse> {
  const tenantId = req.query.tenant_id ?? ctx.resolveActorId?.(req);
  if (!tenantId) return unauthorized();
  const items = await ctx.service.listVariableBindings(tenantId, req.params.deck_id);
  return ok({ items });
}

export async function createVariableBindingHandler(
  req: HttpRequest<{ deck_id: string }, Record<string, unknown>, { tenant_id?: string }>,
  ctx: PrototypeHandlerContext,
): Promise<HttpResponse> {
  const tenantId = req.query.tenant_id ?? ctx.resolveActorId?.(req);
  if (!tenantId) return unauthorized();
  const v = validateCreateVariableBinding(req.body);
  if (!v.valid) return unprocessable(v.errors.map((e) => e.message).join('; '), 'VALIDATION_ERROR');
  try {
    const record = await ctx.service.createVariableBinding(
      tenantId,
      req.params.deck_id,
      v.value!,
      req.body,
    );
    ctx.metrics?.inc(P10_METRICS.created);
    return created(record);
  } catch (e) {
    return mapError(e, ctx);
  }
}

export async function deleteVariableBindingHandler(
  req: HttpRequest<{ id: string }, undefined, { tenant_id?: string }>,
  ctx: PrototypeHandlerContext,
): Promise<HttpResponse> {
  const tenantId = req.query.tenant_id ?? ctx.resolveActorId?.(req);
  if (!tenantId) return unauthorized();
  try {
    await ctx.service.deleteVariableBinding(tenantId, req.params.id);
    ctx.metrics?.inc(P10_METRICS.deleted);
    return noContent();
  } catch (e) {
    return mapError(e, ctx);
  }
}

// ── Conditional rule handlers ───────────────────────────────────────────

export async function listConditionalRulesHandler(
  req: HttpRequest<{ deck_id: string }, undefined, { tenant_id?: string }>,
  ctx: PrototypeHandlerContext,
): Promise<HttpResponse> {
  const tenantId = req.query.tenant_id ?? ctx.resolveActorId?.(req);
  if (!tenantId) return unauthorized();
  const items = await ctx.service.listConditionalRules(tenantId, req.params.deck_id);
  return ok({ items });
}

export async function createConditionalRuleHandler(
  req: HttpRequest<{ deck_id: string }, Record<string, unknown>, { tenant_id?: string }>,
  ctx: PrototypeHandlerContext,
): Promise<HttpResponse> {
  const tenantId = req.query.tenant_id ?? ctx.resolveActorId?.(req);
  if (!tenantId) return unauthorized();
  const v = validateCreateConditionalRule(req.body);
  if (!v.valid) return unprocessable(v.errors.map((e) => e.message).join('; '), 'VALIDATION_ERROR');
  try {
    const record = await ctx.service.createConditionalRule(tenantId, req.params.deck_id, v.value!);
    ctx.metrics?.inc(P10_METRICS.created);
    return created(record);
  } catch (e) {
    return mapError(e, ctx);
  }
}

export async function getConditionalRuleHandler(
  req: HttpRequest<{ id: string }, undefined, { tenant_id?: string }>,
  ctx: PrototypeHandlerContext,
): Promise<HttpResponse> {
  const tenantId = req.query.tenant_id ?? ctx.resolveActorId?.(req);
  if (!tenantId) return unauthorized();
  try {
    return ok(await ctx.service.getConditionalRule(tenantId, req.params.id));
  } catch (e) {
    return mapError(e, ctx);
  }
}

export async function patchConditionalRuleHandler(
  req: HttpRequest<{ id: string }, Record<string, unknown>, { tenant_id?: string }>,
  ctx: PrototypeHandlerContext,
): Promise<HttpResponse> {
  const tenantId = req.query.tenant_id ?? ctx.resolveActorId?.(req);
  if (!tenantId) return unauthorized();
  const v = validatePatchConditionalRule(req.body);
  if (!v.valid) return badRequest(v.errors.map((e) => e.message).join('; '), 'VALIDATION_ERROR');
  try {
    const record = await ctx.service.patchConditionalRule(
      tenantId,
      req.params.id,
      v.value!,
      req.body,
    );
    ctx.metrics?.inc(P10_METRICS.updated);
    return ok(record);
  } catch (e) {
    return mapError(e, ctx);
  }
}

export async function deleteConditionalRuleHandler(
  req: HttpRequest<{ id: string }, undefined, { tenant_id?: string }>,
  ctx: PrototypeHandlerContext,
): Promise<HttpResponse> {
  const tenantId = req.query.tenant_id ?? ctx.resolveActorId?.(req);
  if (!tenantId) return unauthorized();
  try {
    await ctx.service.deleteConditionalRule(tenantId, req.params.id);
    ctx.metrics?.inc(P10_METRICS.deleted);
    return noContent();
  } catch (e) {
    return mapError(e, ctx);
  }
}

// ── Interaction state handlers (P10 M3) ───────────────────────────────

export async function listInteractionStatesHandler(
  req: HttpRequest<{ deck_id: string }, undefined, { tenant_id?: string }>,
  ctx: PrototypeHandlerContext,
): Promise<HttpResponse> {
  const tenantId = req.query.tenant_id ?? ctx.resolveActorId?.(req);
  if (!tenantId) return unauthorized();
  const items = await ctx.service.listInteractionStates(tenantId, req.params.deck_id);
  return ok({ items });
}

export async function createInteractionStateHandler(
  req: HttpRequest<{ deck_id: string }, Record<string, unknown>, { tenant_id?: string }>,
  ctx: PrototypeHandlerContext,
): Promise<HttpResponse> {
  const tenantId = req.query.tenant_id ?? ctx.resolveActorId?.(req);
  if (!tenantId) return unauthorized();
  const v = validateCreateInteractionState(req.body);
  if (!v.valid) {
    ctx.metrics?.inc(P10_METRICS.validationFailed);
    return unprocessable(v.errors.map((e) => e.message).join('; '), 'VALIDATION_ERROR', v.errors);
  }
  try {
    const record = await ctx.service.createInteractionState(tenantId, req.params.deck_id, v.value!);
    ctx.metrics?.inc(P10_METRICS.created);
    return created(record);
  } catch (e) {
    return mapError(e, ctx);
  }
}

export async function getInteractionStateHandler(
  req: HttpRequest<{ id: string }, undefined, { tenant_id?: string }>,
  ctx: PrototypeHandlerContext,
): Promise<HttpResponse> {
  const tenantId = req.query.tenant_id ?? ctx.resolveActorId?.(req);
  if (!tenantId) return unauthorized();
  try {
    return ok(await ctx.service.getInteractionState(tenantId, req.params.id));
  } catch (e) {
    return mapError(e, ctx);
  }
}

export async function patchInteractionStateHandler(
  req: HttpRequest<{ id: string }, Record<string, unknown>, { tenant_id?: string }>,
  ctx: PrototypeHandlerContext,
): Promise<HttpResponse> {
  const tenantId = req.query.tenant_id ?? ctx.resolveActorId?.(req);
  if (!tenantId) return unauthorized();
  const v = validatePatchInteractionState(req.body);
  if (!v.valid) {
    ctx.metrics?.inc(P10_METRICS.validationFailed);
    return badRequest(v.errors.map((e) => e.message).join('; '), 'VALIDATION_ERROR');
  }
  try {
    const record = await ctx.service.patchInteractionState(tenantId, req.params.id, v.value!);
    ctx.metrics?.inc(P10_METRICS.updated);
    return ok(record);
  } catch (e) {
    return mapError(e, ctx);
  }
}

export async function transitionInteractionStateHandler(
  req: HttpRequest<
    { deck_id: string; id: string },
    Record<string, unknown>,
    { tenant_id?: string }
  >,
  ctx: PrototypeHandlerContext,
): Promise<HttpResponse> {
  const tenantId = req.query.tenant_id ?? ctx.resolveActorId?.(req);
  if (!tenantId) return unauthorized();
  const v = validateTransitionInput(req.body);
  if (!v.valid) {
    ctx.metrics?.inc(P10_METRICS.validationFailed);
    return badRequest(v.errors.map((e) => e.message).join('; '), 'VALIDATION_ERROR');
  }
  try {
    const { record, transition } = await ctx.service.transitionInteractionState(
      tenantId,
      req.params.id,
      v.value!,
    );
    ctx.metrics?.inc(P10_METRICS.updated);
    return ok({ record, transition });
  } catch (e) {
    return mapError(e, ctx);
  }
}

export async function deleteInteractionStateHandler(
  req: HttpRequest<{ id: string }, undefined, { tenant_id?: string }>,
  ctx: PrototypeHandlerContext,
): Promise<HttpResponse> {
  const tenantId = req.query.tenant_id ?? ctx.resolveActorId?.(req);
  if (!tenantId) return unauthorized();
  try {
    await ctx.service.deleteInteractionState(tenantId, req.params.id);
    ctx.metrics?.inc(P10_METRICS.deleted);
    return noContent();
  } catch (e) {
    return mapError(e, ctx);
  }
}

// ── Error mapping ───────────────────────────────────────────────────────

function mapError(e: unknown, ctx: PrototypeHandlerContext): HttpResponse {
  if (e instanceof NotFoundError) return notFound(e.message);
  if (e instanceof VersionConflictError) {
    ctx.metrics?.inc(P10_METRICS.conflict);
    return conflict(e.message, e.code, { currentVersion: e.currentVersion });
  }
  if (e instanceof DuplicateBranchingEdgeError) {
    return conflict(e.message, e.code);
  }
  if (e instanceof DuplicateVariableNameError) {
    return conflict(e.message, e.code);
  }
  if (e instanceof VariableValidationError) {
    return unprocessable(e.message, e.code);
  }
  if (e instanceof ExpressionCompileError) {
    return unprocessable(e.message, e.code, { source: e.source });
  }
  throw e;
}
export const handlers = {
  listHotspots: listHotspotsHandler,
  createHotspot: createHotspotHandler,
  getHotspot: getHotspotHandler,
  patchHotspot: patchHotspotHandler,
  deleteHotspot: deleteHotspotHandler,
  listOverlays: listOverlaysHandler,
  createOverlay: createOverlayHandler,
  getOverlay: getOverlayHandler,
  patchOverlay: patchOverlayHandler,
  deleteOverlay: deleteOverlayHandler,
  listBranchingEdges: listBranchingEdgesHandler,
  createBranchingEdge: createBranchingEdgeHandler,
  getBranchingEdge: getBranchingEdgeHandler,
  patchBranchingEdge: patchBranchingEdgeHandler,
  deleteBranchingEdge: deleteBranchingEdgeHandler,
  listVariables: listVariablesHandler,
  createVariable: createVariableHandler,
  getVariable: getVariableHandler,
  patchVariable: patchVariableHandler,
  deleteVariable: deleteVariableHandler,
  listVariableBindings: listVariableBindingsHandler,
  createVariableBinding: createVariableBindingHandler,
  deleteVariableBinding: deleteVariableBindingHandler,
  listConditionalRules: listConditionalRulesHandler,
  createConditionalRule: createConditionalRuleHandler,
  getConditionalRule: getConditionalRuleHandler,
  patchConditionalRule: patchConditionalRuleHandler,
  deleteConditionalRule: deleteConditionalRuleHandler,
  listInteractionStates: listInteractionStatesHandler,
  createInteractionState: createInteractionStateHandler,
  getInteractionState: getInteractionStateHandler,
  patchInteractionState: patchInteractionStateHandler,
  transitionInteractionState: transitionInteractionStateHandler,
  deleteInteractionState: deleteInteractionStateHandler,
  listQuizzes: listQuizzesHandler,
  createQuiz: createQuizHandler,
  getQuiz: getQuizHandler,
  patchQuiz: patchQuizHandler,
  deleteQuiz: deleteQuizHandler,
  startAttempt: startAttemptHandler,
  submitAnswer: submitAnswerHandler,
  completeAttempt: completeAttemptHandler,
  getAttemptResult: getAttemptResultHandler,
  listLlmReviewQueue: listLlmReviewQueueHandler,
  updateLlmReviewItem: updateLlmReviewItemHandler,
  listPresentationSequences: listPresentationSequencesHandler,
  createPresentationSequence: createPresentationSequenceHandler,
  getPresentationSequence: getPresentationSequenceHandler,
  patchPresentationSequence: patchPresentationSequenceHandler,
  deletePresentationSequence: deletePresentationSequenceHandler,
} as const;

// ── Quiz handlers (P10 M6.1) ───────────────────────────────────────────

export async function listQuizzesHandler(
  req: HttpRequest<{ deck_id: string }, undefined, { tenant_id?: string }>,
  ctx: PrototypeHandlerContext,
): Promise<HttpResponse> {
  const tenantId = req.query.tenant_id ?? ctx.resolveActorId?.(req);
  if (!tenantId) return unauthorized();
  try {
    const items = await ctx.service.listQuizzes(tenantId, req.params.deck_id);
    return ok({ items });
  } catch (e) {
    return mapError(e, ctx);
  }
}

export async function createQuizHandler(
  req: HttpRequest<{ deck_id: string }, Record<string, unknown>, { tenant_id?: string }>,
  ctx: PrototypeHandlerContext,
): Promise<HttpResponse> {
  const tenantId = req.query.tenant_id ?? ctx.resolveActorId?.(req);
  if (!tenantId) return unauthorized();
  const v = validateCreateQuiz(req.body);
  if (!v.valid) {
    ctx.metrics?.inc(P10_METRICS.validationFailed);
    return unprocessable(v.errors.map((e) => e.message).join('; '), 'VALIDATION_ERROR', v.errors);
  }
  try {
    const record = await ctx.service.createQuiz(tenantId, req.params.deck_id, v.value!);
    ctx.metrics?.inc(P10_METRICS.created);
    return created(record);
  } catch (e) {
    return mapError(e, ctx);
  }
}

export async function getQuizHandler(
  req: HttpRequest<{ id: string }, undefined, { tenant_id?: string }>,
  ctx: PrototypeHandlerContext,
): Promise<HttpResponse> {
  const tenantId = req.query.tenant_id ?? ctx.resolveActorId?.(req);
  if (!tenantId) return unauthorized();
  try {
    return ok(await ctx.service.getQuiz(tenantId, req.params.id));
  } catch (e) {
    return mapError(e, ctx);
  }
}

export async function patchQuizHandler(
  req: HttpRequest<{ id: string }, Record<string, unknown>, { tenant_id?: string }>,
  ctx: PrototypeHandlerContext,
): Promise<HttpResponse> {
  const tenantId = req.query.tenant_id ?? ctx.resolveActorId?.(req);
  if (!tenantId) return unauthorized();
  const v = validatePatchQuiz(req.body);
  if (!v.valid) {
    ctx.metrics?.inc(P10_METRICS.validationFailed);
    return badRequest(v.errors.map((e) => e.message).join('; '), 'VALIDATION_ERROR');
  }
  try {
    const record = await ctx.service.patchQuiz(tenantId, req.params.id, v.value!);
    ctx.metrics?.inc(P10_METRICS.updated);
    return ok(record);
  } catch (e) {
    return mapError(e, ctx);
  }
}

export async function deleteQuizHandler(
  req: HttpRequest<{ id: string }, undefined, { tenant_id?: string }>,
  ctx: PrototypeHandlerContext,
): Promise<HttpResponse> {
  const tenantId = req.query.tenant_id ?? ctx.resolveActorId?.(req);
  if (!tenantId) return unauthorized();
  try {
    await ctx.service.deleteQuiz(tenantId, req.params.id);
    ctx.metrics?.inc(P10_METRICS.deleted);
    return noContent();
  } catch (e) {
    return mapError(e, ctx);
  }
}

export async function startAttemptHandler(
  req: HttpRequest<
    { quiz_id: string },
    Record<string, unknown>,
    { tenant_id?: string; deck_id?: string }
  >,
  ctx: PrototypeHandlerContext,
): Promise<HttpResponse> {
  const tenantId = req.query.tenant_id ?? ctx.resolveActorId?.(req);
  if (!tenantId) return unauthorized();
  const deckId = req.query.deck_id;
  if (!deckId) return badRequest('deck_id query param required', 'VALIDATION_ERROR');
  const v = validateStartAttempt(req.body);
  if (!v.valid) {
    ctx.metrics?.inc(P10_METRICS.validationFailed);
    return badRequest(v.errors.map((e) => e.message).join('; '), 'VALIDATION_ERROR');
  }
  try {
    const record = await ctx.service.startAttempt(tenantId, deckId, req.params.quiz_id, v.value!);
    ctx.metrics?.inc(P10_METRICS.created);
    return created(record);
  } catch (e) {
    return mapError(e, ctx);
  }
}

export async function submitAnswerHandler(
  req: HttpRequest<{ attempt_id: string }, Record<string, unknown>, { tenant_id?: string }>,
  ctx: PrototypeHandlerContext,
): Promise<HttpResponse> {
  const tenantId = req.query.tenant_id ?? ctx.resolveActorId?.(req);
  if (!tenantId) return unauthorized();
  const v = validateQuizAnswer(req.body);
  if (!v.valid) {
    ctx.metrics?.inc(P10_METRICS.validationFailed);
    return badRequest(v.errors.map((e) => e.message).join('; '), 'VALIDATION_ERROR');
  }
  try {
    const record = await ctx.service.submitAnswer(tenantId, req.params.attempt_id, v.value!);
    ctx.metrics?.inc(P10_METRICS.updated);
    return ok(record);
  } catch (e) {
    return mapError(e, ctx);
  }
}

export async function completeAttemptHandler(
  req: HttpRequest<{ attempt_id: string }, undefined, { tenant_id?: string }>,
  ctx: PrototypeHandlerContext,
): Promise<HttpResponse> {
  const tenantId = req.query.tenant_id ?? ctx.resolveActorId?.(req);
  if (!tenantId) return unauthorized();
  try {
    const result = await ctx.service.completeAttempt(tenantId, req.params.attempt_id);
    ctx.metrics?.inc(P10_METRICS.updated);
    return ok(result);
  } catch (e) {
    return mapError(e, ctx);
  }
}

export async function getAttemptResultHandler(
  req: HttpRequest<{ attempt_id: string }, undefined, { tenant_id?: string }>,
  ctx: PrototypeHandlerContext,
): Promise<HttpResponse> {
  const tenantId = req.query.tenant_id ?? ctx.resolveActorId?.(req);
  if (!tenantId) return unauthorized();
  try {
    return ok(await ctx.service.getAttemptResult(tenantId, req.params.attempt_id));
  } catch (e) {
    return mapError(e, ctx);
  }
}

export async function listLlmReviewQueueHandler(
  req: HttpRequest<undefined, undefined, { tenant_id?: string; status?: string }>,
  ctx: PrototypeHandlerContext,
): Promise<HttpResponse> {
  const tenantId = req.query.tenant_id ?? ctx.resolveActorId?.(req);
  if (!tenantId) return unauthorized();
  const status = req.query.status as 'pending' | 'approved' | 'rejected' | 'overridden' | undefined;
  try {
    const items = await ctx.service.listLlmReviewQueue(tenantId, status);
    return ok({ items });
  } catch (e) {
    return mapError(e, ctx);
  }
}

export async function updateLlmReviewItemHandler(
  req: HttpRequest<{ id: string }, Record<string, unknown>, { tenant_id?: string }>,
  ctx: PrototypeHandlerContext,
): Promise<HttpResponse> {
  const tenantId = req.query.tenant_id ?? ctx.resolveActorId?.(req);
  if (!tenantId) return unauthorized();
  const v = validateLlmReviewUpdate(req.body);
  if (!v.valid) {
    ctx.metrics?.inc(P10_METRICS.validationFailed);
    return badRequest(v.errors.map((e) => e.message).join('; '), 'VALIDATION_ERROR');
  }
  try {
    const record = await ctx.service.updateLlmReviewItem(tenantId, req.params.id, v.value!);
    ctx.metrics?.inc(P10_METRICS.updated);
    return ok(record);
  } catch (e) {
    return mapError(e, ctx);
  }
}

// ── Presentation sequence handlers (P10 M6.2) ─────────────────────────

export async function listPresentationSequencesHandler(
  req: HttpRequest<{ deck_id: string }, undefined, { tenant_id?: string }>,
  ctx: PrototypeHandlerContext,
): Promise<HttpResponse> {
  const tenantId = req.query.tenant_id ?? ctx.resolveActorId?.(req);
  if (!tenantId) return unauthorized();
  try {
    const items = await ctx.service.listPresentationSequences(tenantId, req.params.deck_id);
    return ok({ items });
  } catch (e) {
    return mapError(e, ctx);
  }
}

export async function createPresentationSequenceHandler(
  req: HttpRequest<{ deck_id: string }, Record<string, unknown>, { tenant_id?: string }>,
  ctx: PrototypeHandlerContext,
): Promise<HttpResponse> {
  const tenantId = req.query.tenant_id ?? ctx.resolveActorId?.(req);
  if (!tenantId) return unauthorized();
  const v = validateCreatePresentationSequence(req.body);
  if (!v.valid) {
    ctx.metrics?.inc(P10_METRICS.validationFailed);
    return unprocessable(v.errors.map((e) => e.message).join('; '), 'VALIDATION_ERROR', v.errors);
  }
  try {
    const record = await ctx.service.createPresentationSequence(
      tenantId,
      req.params.deck_id,
      v.value!,
    );
    ctx.metrics?.inc(P10_METRICS.created);
    return created(record);
  } catch (e) {
    return mapError(e, ctx);
  }
}

export async function getPresentationSequenceHandler(
  req: HttpRequest<{ id: string }, undefined, { tenant_id?: string }>,
  ctx: PrototypeHandlerContext,
): Promise<HttpResponse> {
  const tenantId = req.query.tenant_id ?? ctx.resolveActorId?.(req);
  if (!tenantId) return unauthorized();
  try {
    return ok(await ctx.service.getPresentationSequence(tenantId, req.params.id));
  } catch (e) {
    return mapError(e, ctx);
  }
}

export async function patchPresentationSequenceHandler(
  req: HttpRequest<{ id: string }, Record<string, unknown>, { tenant_id?: string }>,
  ctx: PrototypeHandlerContext,
): Promise<HttpResponse> {
  const tenantId = req.query.tenant_id ?? ctx.resolveActorId?.(req);
  if (!tenantId) return unauthorized();
  const v = validatePatchPresentationSequence(req.body);
  if (!v.valid) {
    ctx.metrics?.inc(P10_METRICS.validationFailed);
    return badRequest(v.errors.map((e) => e.message).join('; '), 'VALIDATION_ERROR');
  }
  try {
    const record = await ctx.service.patchPresentationSequence(tenantId, req.params.id, v.value!);
    ctx.metrics?.inc(P10_METRICS.updated);
    return ok(record);
  } catch (e) {
    return mapError(e, ctx);
  }
}

export async function deletePresentationSequenceHandler(
  req: HttpRequest<{ id: string }, undefined, { tenant_id?: string }>,
  ctx: PrototypeHandlerContext,
): Promise<HttpResponse> {
  const tenantId = req.query.tenant_id ?? ctx.resolveActorId?.(req);
  if (!tenantId) return unauthorized();
  try {
    await ctx.service.deletePresentationSequence(tenantId, req.params.id);
    ctx.metrics?.inc(P10_METRICS.deleted);
    return noContent();
  } catch (e) {
    return mapError(e, ctx);
  }
}
