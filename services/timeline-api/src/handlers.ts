/**
 * Timeline API — REST handlers (Phase 09).
 *
 * Web-framework-free handler functions for the timeline data plane.
 * Validates request bodies against JSON-Schema shapes, delegates to
 * the service, and maps domain errors to HTTP status codes.
 *
 * Endpoints:
 *
 *   GET    /v1/decks/:deck_id/timelines
 *   POST   /v1/decks/:deck_id/timelines
 *   GET    /v1/timelines/:id
 *   PATCH  /v1/timelines/:id          (optimistic-lock via version)
 *   DELETE /v1/timelines/:id
 *   POST   /v1/timelines/:id/tracks
 *   POST   /v1/tracks/:id/keyframes
 *   POST   /v1/timelines/:id/triggers
 *   GET    /v1/workspaces/:workspace_id/easing-curves
 *   POST   /v1/workspaces/:workspace_id/easing-curves
 *   GET    /v1/easing-curves/:id
 *   PATCH  /v1/easing-curves/:id
 *   DELETE /v1/easing-curves/:id
 *   GET    /v1/workspaces/:workspace_id/animation-presets
 *   POST   /v1/workspaces/:workspace_id/animation-presets
 *   GET    /v1/animation-presets/:id
 *   GET    /v1/decks/:deck_id/transitions
 *   POST   /v1/decks/:deck_id/transitions
 *   GET    /v1/decks/:deck_id/reduced-motion
 *   PUT    /v1/decks/:deck_id/reduced-motion
 */

import type { TimelineService } from './service.js';
import { EasingValidationRejectedError } from './service.js';
import {
  TimelineNotFoundError,
  VersionConflictError,
  TrackNotFoundError,
  EasingCurveNotFoundError,
  AnimationPresetNotFoundError,
} from './dal.js';
import type { TimelineMetrics } from './metrics.js';
import type { TimelineAuditRecorder } from './audit.js';
import {
  validateCreateTimeline,
  validatePatchTimeline,
  validateCreateTrack,
  validateCreateKeyframe,
  validateCreateTrigger,
  validateCreateEasingCurve,
  validatePatchEasingCurve,
  validateCreateAnimationPreset,
  validateCreateTransition,
  validatePutReducedMotion,
} from './schemas.js';

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

export interface TimelineHandlerContext {
  readonly service: TimelineService;
  readonly metrics?: TimelineMetrics;
  readonly audit?: TimelineAuditRecorder;
  resolveActorId?: (req: HttpRequest) => string | undefined;
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
function conflict(message: string, code: string, extra?: Record<string, unknown>): HttpResponse {
  return { status: 409, body: { error: message, code, ...(extra ?? {}) } };
}
function unprocessable(message: string, code: string, details?: unknown): HttpResponse {
  return {
    status: 422,
    body: { error: message, code, ...(details !== undefined ? { details } : {}) },
  };
}

// ---------------------------------------------------------------------------
// Timeline endpoints
// ---------------------------------------------------------------------------

export async function listTimelinesHandler(
  req: HttpRequest<{ deck_id: string }, undefined, { tenant_id?: string }>,
  ctx: TimelineHandlerContext,
): Promise<HttpResponse> {
  const tenantId = req.query.tenant_id ?? ctx.resolveActorId?.(req);
  if (!tenantId) return unauthorized();
  const timelines = await ctx.service.listTimelines(req.params.deck_id, tenantId);
  return ok({ timelines });
}

export async function createTimelineHandler(
  req: HttpRequest<{ deck_id: string }, Record<string, unknown>, { tenant_id?: string }>,
  ctx: TimelineHandlerContext,
): Promise<HttpResponse> {
  const tenantId = req.query.tenant_id ?? ctx.resolveActorId?.(req);
  if (!tenantId) return unauthorized();

  const validation = validateCreateTimeline(req.body);
  if (!validation.valid) {
    ctx.metrics?.recordValidationFailed();
    return badRequest(
      `Validation failed: ${validation.errors.map((e) => e.message).join('; ')}`,
      'VALIDATION_ERROR',
    );
  }

  const body = req.body as {
    slideId: string;
    elementId: string;
    durationMs: number;
    loop?: boolean;
    playCount?: number;
    startOffsetMs?: number;
    tracks?: Array<{
      property: string;
      keyframes: Array<{ timeMs: number; value: unknown; easing?: string }>;
      startOffsetMs?: number;
      easing: string;
    }>;
    triggers?: Array<{
      kind: 'on_click' | 'on_enter' | 'on_hover' | 'on_data_change' | 'on_timer';
      sourceId?: string;
      fieldPath?: string;
      offsetMs?: number;
      debounceMs?: number;
    }>;
  };

  const timeline = await ctx.service.createTimeline({
    tenantId,
    deckId: req.params.deck_id,
    slideId: body.slideId,
    elementId: body.elementId,
    durationMs: body.durationMs,
    ...(body.loop !== undefined ? { loop: body.loop } : {}),
    ...(body.playCount !== undefined ? { playCount: body.playCount } : {}),
    ...(body.startOffsetMs !== undefined ? { startOffsetMs: body.startOffsetMs } : {}),
    ...(body.tracks !== undefined ? { tracks: body.tracks } : {}),
    ...(body.triggers !== undefined ? { triggers: body.triggers } : {}),
  });

  ctx.metrics?.recordTimelineCreated();
  ctx.audit?.record({
    tenantId,
    actorId: tenantId,
    action: 'timeline.create',
    payload: { timelineId: timeline.id, deckId: timeline.deckId },
  });
  return created(timeline);
}

export async function getTimelineHandler(
  req: HttpRequest<{ id: string }, undefined, { tenant_id?: string }>,
  ctx: TimelineHandlerContext,
): Promise<HttpResponse> {
  const tenantId = req.query.tenant_id ?? ctx.resolveActorId?.(req);
  if (!tenantId) return unauthorized();

  try {
    const timeline = await ctx.service.getTimeline(req.params.id, tenantId);
    return ok(timeline);
  } catch (e) {
    if (e instanceof TimelineNotFoundError) return notFound(e.message);
    throw e;
  }
}

export async function patchTimelineHandler(
  req: HttpRequest<{ id: string }, Record<string, unknown>, { tenant_id?: string }>,
  ctx: TimelineHandlerContext,
): Promise<HttpResponse> {
  const tenantId = req.query.tenant_id ?? ctx.resolveActorId?.(req);
  if (!tenantId) return unauthorized();

  const validation = validatePatchTimeline(req.body);
  if (!validation.valid) {
    ctx.metrics?.recordValidationFailed();
    return badRequest(
      `Validation failed: ${validation.errors.map((e) => e.message).join('; ')}`,
      'VALIDATION_ERROR',
    );
  }

  const body = req.body as {
    durationMs?: number;
    loop?: boolean;
    playCount?: number;
    startOffsetMs?: number;
    version: number;
    tracks?: Array<{
      property: string;
      keyframes: Array<{ timeMs: number; value: unknown; easing?: string }>;
      startOffsetMs?: number;
      easing: string;
    }>;
    triggers?: Array<{
      kind: 'on_click' | 'on_enter' | 'on_hover' | 'on_data_change' | 'on_timer';
      sourceId?: string;
      fieldPath?: string;
      offsetMs?: number;
      debounceMs?: number;
    }>;
  };

  try {
    const timeline = await ctx.service.patchTimeline(req.params.id, tenantId, body);
    ctx.metrics?.recordTimelineUpdated();
    ctx.audit?.record({
      tenantId,
      actorId: tenantId,
      action: 'timeline.update',
      payload: { timelineId: timeline.id, version: timeline.version },
    });
    return ok(timeline);
  } catch (e) {
    if (e instanceof TimelineNotFoundError) return notFound(e.message);
    if (e instanceof VersionConflictError) {
      ctx.metrics?.recordVersionConflict();
      // Get current version for etag
      const current = await ctx.service.getTimeline(req.params.id, tenantId);
      return conflict(e.message, e.code, {
        etag: `W/"${current.version}"`,
        currentVersion: current.version,
      });
    }
    throw e;
  }
}

export async function deleteTimelineHandler(
  req: HttpRequest<{ id: string }, undefined, { tenant_id?: string }>,
  ctx: TimelineHandlerContext,
): Promise<HttpResponse> {
  const tenantId = req.query.tenant_id ?? ctx.resolveActorId?.(req);
  if (!tenantId) return unauthorized();

  await ctx.service.deleteTimeline(req.params.id, tenantId);
  ctx.metrics?.recordTimelineDeleted();
  ctx.audit?.record({
    tenantId,
    actorId: tenantId,
    action: 'timeline.delete',
    payload: { timelineId: req.params.id },
  });
  return noContent();
}

// -------------------------------------------------------------------------
// Track endpoints
// -------------------------------------------------------------------------

export async function createTrackHandler(
  req: HttpRequest<{ id: string }, Record<string, unknown>, { tenant_id?: string }>,
  ctx: TimelineHandlerContext,
): Promise<HttpResponse> {
  const tenantId = req.query.tenant_id ?? ctx.resolveActorId?.(req);
  if (!tenantId) return unauthorized();

  const validation = validateCreateTrack(req.body);
  if (!validation.valid) {
    ctx.metrics?.recordValidationFailed();
    return badRequest(
      `Validation failed: ${validation.errors.map((e) => e.message).join('; ')}`,
      'VALIDATION_ERROR',
    );
  }

  const body = req.body as {
    property: string;
    keyframes: Array<{ timeMs: number; value: unknown; easing?: string }>;
    startOffsetMs?: number;
    easing: string;
  };

  try {
    const track = await ctx.service.createTrack(req.params.id, tenantId, body);
    ctx.metrics?.recordTrackCreated();
    return created(track);
  } catch (e) {
    if (e instanceof TimelineNotFoundError) return notFound(e.message);
    throw e;
  }
}

// -------------------------------------------------------------------------
// Keyframe endpoints
// -------------------------------------------------------------------------

export async function createKeyframeHandler(
  req: HttpRequest<{ id: string }, Record<string, unknown>>,
  ctx: TimelineHandlerContext,
): Promise<HttpResponse> {
  const actorId = ctx.resolveActorId?.(req);
  if (!actorId) return unauthorized();

  const validation = validateCreateKeyframe(req.body);
  if (!validation.valid) {
    ctx.metrics?.recordValidationFailed();
    return badRequest(
      `Validation failed: ${validation.errors.map((e) => e.message).join('; ')}`,
      'VALIDATION_ERROR',
    );
  }

  const body = req.body as { timeMs: number; value: unknown; easing?: string };

  try {
    const keyframe = await ctx.service.createKeyframe(req.params.id, body);
    ctx.metrics?.recordKeyframeCreated();
    return created(keyframe);
  } catch (e) {
    if (e instanceof TrackNotFoundError) return notFound(e.message);
    throw e;
  }
}

// -------------------------------------------------------------------------
// Trigger endpoints
// -------------------------------------------------------------------------

export async function createTriggerHandler(
  req: HttpRequest<{ id: string }, Record<string, unknown>, { tenant_id?: string }>,
  ctx: TimelineHandlerContext,
): Promise<HttpResponse> {
  const tenantId = req.query.tenant_id ?? ctx.resolveActorId?.(req);
  if (!tenantId) return unauthorized();

  const validation = validateCreateTrigger(req.body);
  if (!validation.valid) {
    ctx.metrics?.recordValidationFailed();
    return badRequest(
      `Validation failed: ${validation.errors.map((e) => e.message).join('; ')}`,
      'VALIDATION_ERROR',
    );
  }

  const body = req.body as {
    kind: 'on_click' | 'on_enter' | 'on_hover' | 'on_data_change' | 'on_timer';
    sourceId?: string;
    fieldPath?: string;
    offsetMs?: number;
    debounceMs?: number;
  };

  try {
    const trigger = await ctx.service.createTrigger(req.params.id, tenantId, body);
    ctx.metrics?.recordTriggerCreated();
    return created(trigger);
  } catch (e) {
    if (e instanceof TimelineNotFoundError) return notFound(e.message);
    throw e;
  }
}

// -------------------------------------------------------------------------
// Easing-curve endpoints
// -------------------------------------------------------------------------

export async function listEasingCurvesHandler(
  req: HttpRequest<{ workspace_id: string }>,
  ctx: TimelineHandlerContext,
): Promise<HttpResponse> {
  const curves = await ctx.service.listEasingCurves(req.params.workspace_id);
  return ok({ easingCurves: curves });
}

export async function createEasingCurveHandler(
  req: HttpRequest<{ workspace_id: string }, Record<string, unknown>>,
  ctx: TimelineHandlerContext,
): Promise<HttpResponse> {
  const actorId = ctx.resolveActorId?.(req);
  if (!actorId) return unauthorized();

  const validation = validateCreateEasingCurve(req.body);
  if (!validation.valid) {
    ctx.metrics?.recordValidationFailed();
    return badRequest(
      `Validation failed: ${validation.errors.map((e) => e.message).join('; ')}`,
      'VALIDATION_ERROR',
    );
  }

  const body = req.body as {
    name: string;
    type: 'linear' | 'cubic_bezier' | 'spring' | 'physics' | 'step';
    params: Record<string, unknown>;
  };

  try {
    const curve = await ctx.service.createEasingCurve(req.params.workspace_id, {
      name: body.name,
      type: body.type,
      params: body.params as never,
    });
    ctx.metrics?.recordEasingCurveCreated();
    ctx.audit?.record({
      tenantId: req.params.workspace_id,
      actorId,
      action: 'easing_curve.create',
      payload: { curveId: curve.id, name: curve.name, type: curve.type },
    });
    return created(curve);
  } catch (e) {
    if (e instanceof EasingValidationRejectedError) {
      ctx.metrics?.recordEasingValidationFailed();
      return unprocessable(e.message, e.code, { validationErrors: e.errors });
    }
    throw e;
  }
}

export async function getEasingCurveHandler(
  req: HttpRequest<{ id: string }, undefined, { workspace_id?: string }>,
  ctx: TimelineHandlerContext,
): Promise<HttpResponse> {
  const workspaceId = req.query.workspace_id ?? '';
  try {
    const curve = await ctx.service.getEasingCurve(req.params.id, workspaceId);
    return ok(curve);
  } catch (e) {
    if (e instanceof EasingCurveNotFoundError) return notFound(e.message);
    throw e;
  }
}

export async function patchEasingCurveHandler(
  req: HttpRequest<{ id: string }, Record<string, unknown>, { workspace_id?: string }>,
  ctx: TimelineHandlerContext,
): Promise<HttpResponse> {
  const workspaceId = req.query.workspace_id ?? '';
  const actorId = ctx.resolveActorId?.(req);
  if (!actorId) return unauthorized();

  const validation = validatePatchEasingCurve(req.body);
  if (!validation.valid) {
    ctx.metrics?.recordValidationFailed();
    return badRequest(
      `Validation failed: ${validation.errors.map((e) => e.message).join('; ')}`,
      'VALIDATION_ERROR',
    );
  }

  const body = req.body as {
    name?: string;
    type?: 'linear' | 'cubic_bezier' | 'spring' | 'physics' | 'step';
    params?: Record<string, unknown>;
  };

  try {
    const curve = await ctx.service.patchEasingCurve(req.params.id, workspaceId, {
      ...body,
      ...(body.params !== undefined ? { params: body.params as never } : {}),
    });
    return ok(curve);
  } catch (e) {
    if (e instanceof EasingCurveNotFoundError) return notFound(e.message);
    if (e instanceof EasingValidationRejectedError) {
      ctx.metrics?.recordEasingValidationFailed();
      return unprocessable(e.message, e.code, { validationErrors: e.errors });
    }
    throw e;
  }
}

export async function deleteEasingCurveHandler(
  req: HttpRequest<{ id: string }, undefined, { workspace_id?: string }>,
  ctx: TimelineHandlerContext,
): Promise<HttpResponse> {
  const workspaceId = req.query.workspace_id ?? '';
  await ctx.service.deleteEasingCurve(req.params.id, workspaceId);
  return noContent();
}

// -------------------------------------------------------------------------
// Animation-preset endpoints
// -------------------------------------------------------------------------

export async function listAnimationPresetsHandler(
  req: HttpRequest<{ workspace_id: string }, undefined, { category?: string; tag?: string }>,
  ctx: TimelineHandlerContext,
): Promise<HttpResponse> {
  const filters: { category?: 'entrance' | 'exit' | 'emphasis'; tag?: string } = {};
  if (req.query.category) filters.category = req.query.category as 'entrance' | 'exit' | 'emphasis';
  if (req.query.tag) filters.tag = req.query.tag;
  const presets = await ctx.service.listAnimationPresets(req.params.workspace_id, filters);
  return ok({ animationPresets: presets });
}

export async function createAnimationPresetHandler(
  req: HttpRequest<{ workspace_id: string }, Record<string, unknown>>,
  ctx: TimelineHandlerContext,
): Promise<HttpResponse> {
  const actorId = ctx.resolveActorId?.(req);
  if (!actorId) return unauthorized();

  const validation = validateCreateAnimationPreset(req.body);
  if (!validation.valid) {
    ctx.metrics?.recordValidationFailed();
    return badRequest(
      `Validation failed: ${validation.errors.map((e) => e.message).join('; ')}`,
      'VALIDATION_ERROR',
    );
  }

  const body = req.body as {
    name: string;
    category: 'entrance' | 'exit' | 'emphasis';
    tags?: string[];
    definition: {
      durationMs: number;
      tracks: Array<{
        property: string;
        keyframes: Array<{ timeMs: number; value: unknown; easing?: string }>;
        easing: string;
      }>;
      triggers?: Array<{
        kind: 'on_click' | 'on_enter' | 'on_hover' | 'on_data_change' | 'on_timer';
        offsetMs?: number;
      }>;
      requiredProperties?: string[];
    };
  };

  const preset = await ctx.service.createAnimationPreset(req.params.workspace_id, {
    name: body.name,
    category: body.category,
    ...(body.tags !== undefined ? { tags: body.tags } : {}),
    definition: body.definition,
  });
  return created(preset);
}

export async function getAnimationPresetHandler(
  req: HttpRequest<{ id: string }, undefined, { workspace_id?: string }>,
  ctx: TimelineHandlerContext,
): Promise<HttpResponse> {
  const workspaceId = req.query.workspace_id ?? '';
  try {
    const preset = await ctx.service.getAnimationPreset(req.params.id, workspaceId);
    return ok(preset);
  } catch (e) {
    if (e instanceof AnimationPresetNotFoundError) return notFound(e.message);
    throw e;
  }
}

// -------------------------------------------------------------------------
// Transition endpoints
// -------------------------------------------------------------------------

export async function listTransitionsHandler(
  req: HttpRequest<{ deck_id: string }>,
  ctx: TimelineHandlerContext,
): Promise<HttpResponse> {
  const transitions = await ctx.service.listTransitions(req.params.deck_id);
  return ok({ transitions });
}

export async function createTransitionHandler(
  req: HttpRequest<{ deck_id: string }, Record<string, unknown>>,
  ctx: TimelineHandlerContext,
): Promise<HttpResponse> {
  const actorId = ctx.resolveActorId?.(req);
  if (!actorId) return unauthorized();

  const validation = validateCreateTransition(req.body);
  if (!validation.valid) {
    ctx.metrics?.recordValidationFailed();
    return badRequest(
      `Validation failed: ${validation.errors.map((e) => e.message).join('; ')}`,
      'VALIDATION_ERROR',
    );
  }

  const body = req.body as {
    fromSlideId: string;
    toSlideId: string;
    type: 'fade' | 'slide' | 'zoom' | 'dissolve' | 'push' | 'wipe' | 'morph';
    magicMoveEnabled?: boolean;
    options?: {
      durationMs?: number;
      easing?: string;
      direction?: 'left' | 'right' | 'up' | 'down';
    };
  };

  const transition = await ctx.service.createTransition(req.params.deck_id, body);
  ctx.metrics?.recordTransitionCreated();
  return created(transition);
}

// -------------------------------------------------------------------------
// Reduced-motion endpoints
// -------------------------------------------------------------------------

export async function getReducedMotionHandler(
  req: HttpRequest<{ deck_id: string }>,
  ctx: TimelineHandlerContext,
): Promise<HttpResponse> {
  const settings = await ctx.service.getReducedMotion(req.params.deck_id);
  return ok(settings);
}

export async function putReducedMotionHandler(
  req: HttpRequest<{ deck_id: string }, Record<string, unknown>>,
  ctx: TimelineHandlerContext,
): Promise<HttpResponse> {
  const actorId = ctx.resolveActorId?.(req);
  if (!actorId) return unauthorized();

  const validation = validatePutReducedMotion(req.body);
  if (!validation.valid) {
    ctx.metrics?.recordValidationFailed();
    return badRequest(
      `Validation failed: ${validation.errors.map((e) => e.message).join('; ')}`,
      'VALIDATION_ERROR',
    );
  }

  const body = req.body as {
    mode: 'follow_os' | 'always_reduced' | 'always_full';
    maxTransitionMs?: number;
    disableParticles?: boolean;
    collapseScrollLinked?: boolean;
    instantTickers?: boolean;
  };

  const settings = await ctx.service.putReducedMotion(req.params.deck_id, body);
  ctx.metrics?.recordReducedMotionUpdated();
  return ok(settings);
}

// ---------------------------------------------------------------------------
// Handler map
// ---------------------------------------------------------------------------

export const handlers = {
  listTimelines: listTimelinesHandler,
  createTimeline: createTimelineHandler,
  getTimeline: getTimelineHandler,
  patchTimeline: patchTimelineHandler,
  deleteTimeline: deleteTimelineHandler,
  createTrack: createTrackHandler,
  createKeyframe: createKeyframeHandler,
  createTrigger: createTriggerHandler,
  listEasingCurves: listEasingCurvesHandler,
  createEasingCurve: createEasingCurveHandler,
  getEasingCurve: getEasingCurveHandler,
  patchEasingCurve: patchEasingCurveHandler,
  deleteEasingCurve: deleteEasingCurveHandler,
  listAnimationPresets: listAnimationPresetsHandler,
  createAnimationPreset: createAnimationPresetHandler,
  getAnimationPreset: getAnimationPresetHandler,
  listTransitions: listTransitionsHandler,
  createTransition: createTransitionHandler,
  getReducedMotion: getReducedMotionHandler,
  putReducedMotion: putReducedMotionHandler,
} as const;
