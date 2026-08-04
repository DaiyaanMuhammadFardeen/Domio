/**
 * Scenario-manager service — REST handlers.
 *
 * Web-framework-free handler functions that the Hono / Express /
 * Node http server can mount.  Mirrors the theme service pattern.
 *
 * Endpoints:
 *
 *   POST   /v1/scenarios                 createScenario
 *   GET    /v1/scenarios/:id             getScenario
 *   GET    /v1/scenarios?deck_id=        listByDeck
 *   PATCH  /v1/scenarios/:id             updateScenario
 *   DELETE /v1/scenarios/:id             deleteScenario
 *   POST   /v1/scenarios/:id/overlays    upsertOverlay
 *   GET    /v1/scenarios/:id/diff?base=  diffScenarios
 */

import {
  ScenarioNotFoundError,
  ScenarioCycleError,
  ScenarioDepthExceededError,
} from './service.js';
import type {
  ScenarioService,
  CreateScenarioInput,
} from './service.js';
import type { ScenarioMetrics } from './metrics.js';
import type { AuditRecorder } from './audit.js';
import type { CreateOverlayInput } from './service.js';

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

export interface ScenarioHandlerContext {
  readonly service: ScenarioService;
  readonly metrics?: ScenarioMetrics;
  readonly audit?: AuditRecorder;
  resolveActorId?: (req: HttpRequest) => string | undefined;
  authorize?: (args: { actorId: string | undefined; action: 'read' | 'write' }) => void;
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

// ---------------------------------------------------------------------------
// Scenario endpoints
// ---------------------------------------------------------------------------

export async function createScenarioHandler(
  req: HttpRequest<{ tenantId: string }, Omit<CreateScenarioInput, 'tenantId' | 'createdBy'> & { createdBy?: string }, { actorId?: string }>,
  ctx: ScenarioHandlerContext,
): Promise<HttpResponse> {
  const actorId = req.body.createdBy ?? req.query.actorId ?? ctx.resolveActorId?.(req);
  if (!actorId) return unauthorized();
  ctx.authorize?.({ actorId, action: 'write' });
  const { createdBy: _ignored, ...rest } = req.body;
  void _ignored;
  try {
    const record = await ctx.service.createScenario({ ...rest, tenantId: req.params.tenantId, createdBy: actorId });
    ctx.metrics?.recordScenarioCreated();
    ctx.audit?.record({
      tenantId: req.params.tenantId,
      actorId,
      action: 'scenario.create',
      payload: { scenarioId: record.id, deckId: record.deckId, name: record.name },
    });
    return created(record);
  } catch (e) {
    if (e instanceof ScenarioCycleError) return badRequest(e.message, e.code);
    if (e instanceof ScenarioDepthExceededError) return badRequest(e.message, e.code);
    if (e instanceof ScenarioNotFoundError) return notFound(e.message);
    throw e;
  }
}

export async function getScenarioHandler(
  req: HttpRequest<{ tenantId: string; id: string }, undefined, { actorId?: string }>,
  ctx: ScenarioHandlerContext,
): Promise<HttpResponse> {
  const actorId = req.query.actorId ?? ctx.resolveActorId?.(req);
  ctx.authorize?.({ actorId, action: 'read' });
  try {
    const scenario = await ctx.service.getScenario(req.params.id, req.params.tenantId);
    return ok(scenario);
  } catch (e) {
    if (e instanceof ScenarioNotFoundError) return notFound(e.message);
    throw e;
  }
}

export async function listByDeckHandler(
  req: HttpRequest<{ tenantId: string }, undefined, { deck_id?: string; actorId?: string }>,
  ctx: ScenarioHandlerContext,
): Promise<HttpResponse> {
  const actorId = req.query.actorId ?? ctx.resolveActorId?.(req);
  ctx.authorize?.({ actorId, action: 'read' });
  const deckId = req.query.deck_id;
  if (!deckId) return badRequest('deck_id query param is required', 'DECK_ID_REQUIRED');
  const scenarios = await ctx.service.listByDeck(deckId, req.params.tenantId);
  return ok({ scenarios });
}

export async function updateScenarioHandler(
  req: HttpRequest<{ tenantId: string; id: string }, { name?: string; description?: string; parentId?: string | null }, { actorId?: string }>,
  ctx: ScenarioHandlerContext,
): Promise<HttpResponse> {
  const actorId = req.query.actorId ?? ctx.resolveActorId?.(req);
  if (!actorId) return unauthorized();
  ctx.authorize?.({ actorId, action: 'write' });
  try {
    const updated = await ctx.service.updateScenario(req.params.id, req.params.tenantId, req.body, actorId);
    ctx.audit?.record({
      tenantId: req.params.tenantId,
      actorId,
      action: 'scenario.update',
      payload: { scenarioId: req.params.id },
    });
    return ok(updated);
  } catch (e) {
    if (e instanceof ScenarioCycleError) return badRequest(e.message, e.code);
    if (e instanceof ScenarioDepthExceededError) return badRequest(e.message, e.code);
    if (e instanceof ScenarioNotFoundError) return notFound(e.message);
    throw e;
  }
}

export async function deleteScenarioHandler(
  req: HttpRequest<{ tenantId: string; id: string }, undefined, { actorId?: string }>,
  ctx: ScenarioHandlerContext,
): Promise<HttpResponse> {
  const actorId = req.query.actorId ?? ctx.resolveActorId?.(req);
  if (!actorId) return unauthorized();
  ctx.authorize?.({ actorId, action: 'write' });
  try {
    await ctx.service.deleteScenario(req.params.id, req.params.tenantId);
    ctx.audit?.record({
      tenantId: req.params.tenantId,
      actorId,
      action: 'scenario.delete',
      payload: { scenarioId: req.params.id },
    });
    return noContent();
  } catch (e) {
    if (e instanceof ScenarioNotFoundError) return notFound(e.message);
    throw e;
  }
}

// ---------------------------------------------------------------------------
// Overlay endpoints
// ---------------------------------------------------------------------------

export async function upsertOverlayHandler(
  req: HttpRequest<{ tenantId: string; id: string }, CreateOverlayInput['tenantId'] extends never ? never : Omit<CreateOverlayInput, 'tenantId' | 'scenarioId'>, { actorId?: string }>,
  ctx: ScenarioHandlerContext,
): Promise<HttpResponse> {
  const actorId = req.query.actorId ?? ctx.resolveActorId?.(req);
  if (!actorId) return unauthorized();
  ctx.authorize?.({ actorId, action: 'write' });
  try {
    const body = req.body as {
      datasetSnapshotRefs?: readonly string[];
      formulaConstantOverrides?: ReadonlyMap<string, number>;
      sliderValueOverrides?: ReadonlyMap<string, number>;
      annotationOverrides?: ReadonlyMap<string, string>;
    };
    const overlay = await ctx.service.upsertOverlay({
      tenantId: req.params.tenantId,
      scenarioId: req.params.id,
      datasetSnapshotRefs: body.datasetSnapshotRefs ?? [],
      formulaConstantOverrides: body.formulaConstantOverrides ?? new Map(),
      sliderValueOverrides: body.sliderValueOverrides ?? new Map(),
      annotationOverrides: body.annotationOverrides ?? new Map(),
    });
    ctx.metrics?.recordOverlayApplied();
    ctx.audit?.record({
      tenantId: req.params.tenantId,
      actorId,
      action: 'overlay.upsert',
      payload: { scenarioId: req.params.id, overlayId: overlay.id },
    });
    return ok(overlay);
  } catch (e) {
    if (e instanceof ScenarioNotFoundError) return notFound(e.message);
    throw e;
  }
}

export async function diffScenariosHandler(
  req: HttpRequest<{ tenantId: string; id: string }, undefined, { base?: string; actorId?: string }>,
  ctx: ScenarioHandlerContext,
): Promise<HttpResponse> {
  const actorId = req.query.actorId ?? ctx.resolveActorId?.(req);
  ctx.authorize?.({ actorId, action: 'read' });
  const baseId = req.query.base;
  if (!baseId) return badRequest('base query param is required', 'BASE_ID_REQUIRED');
  try {
    const result = await ctx.service.diffScenarios(baseId, req.params.id, req.params.tenantId);
    ctx.metrics?.recordDiffComputation();
    return ok(result);
  } catch (e) {
    if (e instanceof ScenarioNotFoundError) return notFound(e.message);
    throw e;
  }
}

// ---------------------------------------------------------------------------
// Handler map
// ---------------------------------------------------------------------------

export const handlers = {
  createScenario: createScenarioHandler,
  getScenario: getScenarioHandler,
  listByDeck: listByDeckHandler,
  updateScenario: updateScenarioHandler,
  deleteScenario: deleteScenarioHandler,
  upsertOverlay: upsertOverlayHandler,
  diffScenarios: diffScenariosHandler,
} as const;
