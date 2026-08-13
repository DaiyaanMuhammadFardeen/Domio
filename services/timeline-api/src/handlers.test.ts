/**
 * Timeline API handler tests — exercises the REST surface against an
 * in-memory service. Each test issues a request through the handler
 * and asserts on the HTTP status + body.
 *
 * Coverage:
 *   - Contract: each endpoint validates request body and returns 400/422 on mismatch.
 *   - Optimistic-lock: PATCH with stale version → 409 with current etag.
 *   - Easing: non-monotonic Bezier rejected 422; out-of-bounds spring params rejected 422.
 *   - Presets: filter by category/tag; missing required property error; last-slide on_enter → on_click.
 *   - Reduced-motion: follow_os is the default; PUT updates mode.
 *   - Handlers: happy paths + 401/404/409/422.
 */

import { describe, it, expect } from 'vitest';
import type { HttpRequest } from './handlers.js';
import { handlers } from './handlers.js';
import { TimelineService } from './service.js';
import {
  InMemoryTimelineRepository,
  InMemoryTrackRepository,
  InMemoryKeyframeRepository,
  InMemoryTriggerRepository,
  InMemoryEasingCurveRepository,
  InMemoryAnimationPresetRepository,
  InMemoryTransitionRepository,
  InMemoryReducedMotionRepository,
} from './dal.js';
import { TimelineMetrics } from './metrics.js';
import { InMemoryTimelineAuditRecorder } from './audit.js';

const TENANT = 'tenant-1';
const WORKSPACE = 'ws-1';
const DECK = 'deck-1';
const SLIDE = 'slide-1';
const ELEMENT = 'elem-1';
const ACTOR = 'alice';

function req<P, B, Q = Record<string, string | undefined>>(
  method: string,
  path: string,
  params: P,
  body: B,
  query: Q = {} as Q,
): HttpRequest<P, B, Q> {
  return { method, path, params, body, query, headers: {} };
}

function makeService() {
  return new TimelineService({
    timelines: new InMemoryTimelineRepository(),
    tracks: new InMemoryTrackRepository(),
    keyframes: new InMemoryKeyframeRepository(),
    triggers: new InMemoryTriggerRepository(),
    easingCurves: new InMemoryEasingCurveRepository(),
    presets: new InMemoryAnimationPresetRepository(),
    transitions: new InMemoryTransitionRepository(),
    reducedMotion: new InMemoryReducedMotionRepository(),
    idGenerator: () => `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    clock: () => new Date('2025-01-15T00:00:00Z'),
  });
}

function makeCtx() {
  const svc = makeService();
  const metrics = new TimelineMetrics();
  const audit = new InMemoryTimelineAuditRecorder(() => 'unused');
  return {
    svc,
    ctx: { service: svc, metrics, audit, resolveActorId: () => ACTOR } as const,
    metrics,
    audit,
  };
}

// =========================================================================
// Timeline CRUD
// =========================================================================

describe('timeline handlers — CRUD', () => {
  it('POST /v1/decks/:deck_id/timelines creates a timeline', async () => {
    const { ctx } = makeCtx();
    const res = await handlers.createTimeline(
      req(
        'POST',
        '/v1/decks/:deck_id/timelines',
        { deck_id: DECK },
        {
          slideId: SLIDE,
          elementId: ELEMENT,
          durationMs: 1000,
        },
        { tenant_id: TENANT },
      ),
      ctx,
    );
    expect(res.status).toBe(201);
    const body = res.body as { id: string; deckId: string; version: number };
    expect(body.deckId).toBe(DECK);
    expect(body.version).toBe(1);
  });

  it('POST /v1/decks/:deck_id/timelines returns 400 on invalid body', async () => {
    const { ctx } = makeCtx();
    const res = await handlers.createTimeline(
      req(
        'POST',
        '/v1/decks/:deck_id/timelines',
        { deck_id: DECK },
        {
          // missing required fields
          durationMs: -1,
        },
        { tenant_id: TENANT },
      ),
      ctx,
    );
    expect(res.status).toBe(400);
    const body = res.body as { code: string };
    expect(body.code).toBe('VALIDATION_ERROR');
  });

  it('POST /v1/decks/:deck_id/timelines returns 401 without tenant_id', async () => {
    const svc = makeService();
    const metrics = new TimelineMetrics();
    const audit = new InMemoryTimelineAuditRecorder(() => 'unused');
    const ctxNoAuth = { service: svc, metrics, audit } as const;
    const res = await handlers.createTimeline(
      req(
        'POST',
        '/v1/decks/:deck_id/timelines',
        { deck_id: DECK },
        {
          slideId: SLIDE,
          elementId: ELEMENT,
          durationMs: 1000,
        },
      ),
      ctxNoAuth,
    );
    expect(res.status).toBe(401);
  });

  it('GET /v1/timelines/:id returns the timeline', async () => {
    const { ctx, svc } = makeCtx();
    const created = await svc.createTimeline({
      tenantId: TENANT,
      deckId: DECK,
      slideId: SLIDE,
      elementId: ELEMENT,
      durationMs: 500,
    });
    const res = await handlers.getTimeline(
      req('GET', '/v1/timelines/:id', { id: created.id }, undefined, { tenant_id: TENANT }),
      ctx,
    );
    expect(res.status).toBe(200);
    const body = res.body as { id: string };
    expect(body.id).toBe(created.id);
  });

  it('GET /v1/timelines/:id returns 404 for unknown', async () => {
    const { ctx } = makeCtx();
    const res = await handlers.getTimeline(
      req('GET', '/v1/timelines/:id', { id: 'nonexistent' }, undefined, { tenant_id: TENANT }),
      ctx,
    );
    expect(res.status).toBe(404);
  });

  it('PATCH /v1/timelines/:id updates with valid version', async () => {
    const { ctx, svc } = makeCtx();
    const created = await svc.createTimeline({
      tenantId: TENANT,
      deckId: DECK,
      slideId: SLIDE,
      elementId: ELEMENT,
      durationMs: 500,
    });
    const res = await handlers.patchTimeline(
      req(
        'PATCH',
        '/v1/timelines/:id',
        { id: created.id },
        {
          version: 1,
          durationMs: 2000,
        },
        { tenant_id: TENANT },
      ),
      ctx,
    );
    expect(res.status).toBe(200);
    const body = res.body as { durationMs: number; version: number };
    expect(body.durationMs).toBe(2000);
    expect(body.version).toBe(2);
  });

  it('PATCH /v1/timelines/:id returns 409 on stale version with etag', async () => {
    const { ctx, svc } = makeCtx();
    const created = await svc.createTimeline({
      tenantId: TENANT,
      deckId: DECK,
      slideId: SLIDE,
      elementId: ELEMENT,
      durationMs: 500,
    });
    // First patch succeeds
    await svc.patchTimeline(created.id, TENANT, { version: 1, durationMs: 1000 });
    // Second patch with stale version
    const res = await handlers.patchTimeline(
      req(
        'PATCH',
        '/v1/timelines/:id',
        { id: created.id },
        {
          version: 1,
          durationMs: 3000,
        },
        { tenant_id: TENANT },
      ),
      ctx,
    );
    expect(res.status).toBe(409);
    const body = res.body as { code: string; etag: string; currentVersion: number };
    expect(body.code).toBe('VERSION_CONFLICT');
    expect(body.etag).toBeDefined();
    expect(body.currentVersion).toBe(2);
  });

  it('DELETE /v1/timelines/:id deletes the timeline', async () => {
    const { ctx, svc } = makeCtx();
    const created = await svc.createTimeline({
      tenantId: TENANT,
      deckId: DECK,
      slideId: SLIDE,
      elementId: ELEMENT,
      durationMs: 500,
    });
    const res = await handlers.deleteTimeline(
      req('DELETE', '/v1/timelines/:id', { id: created.id }, undefined, { tenant_id: TENANT }),
      ctx,
    );
    expect(res.status).toBe(204);
  });
});

// =========================================================================
// Track + Keyframe + Trigger
// =========================================================================

describe('timeline handlers — tracks, keyframes, triggers', () => {
  it('POST /v1/timelines/:id/tracks creates a track', async () => {
    const { ctx, svc } = makeCtx();
    const created = await svc.createTimeline({
      tenantId: TENANT,
      deckId: DECK,
      slideId: SLIDE,
      elementId: ELEMENT,
      durationMs: 500,
    });
    const res = await handlers.createTrack(
      req(
        'POST',
        '/v1/timelines/:id/tracks',
        { id: created.id },
        {
          property: 'opacity',
          keyframes: [
            { timeMs: 0, value: 0 },
            { timeMs: 500, value: 1 },
          ],
          easing: 'linear',
        },
        { tenant_id: TENANT },
      ),
      ctx,
    );
    expect(res.status).toBe(201);
    const body = res.body as { property: string; keyframes: unknown[] };
    expect(body.property).toBe('opacity');
    expect(body.keyframes.length).toBe(2);
  });

  it('POST /v1/timelines/:id/tracks returns 400 on invalid body', async () => {
    const { ctx, svc } = makeCtx();
    const created = await svc.createTimeline({
      tenantId: TENANT,
      deckId: DECK,
      slideId: SLIDE,
      elementId: ELEMENT,
      durationMs: 500,
    });
    const res = await handlers.createTrack(
      req(
        'POST',
        '/v1/timelines/:id/tracks',
        { id: created.id },
        {
          // missing required 'easing'
          property: 'opacity',
          keyframes: [],
        },
        { tenant_id: TENANT },
      ),
      ctx,
    );
    expect(res.status).toBe(400);
  });

  it('POST /v1/tracks/:id/keyframes creates a keyframe', async () => {
    const { ctx, svc } = makeCtx();
    const created = await svc.createTimeline({
      tenantId: TENANT,
      deckId: DECK,
      slideId: SLIDE,
      elementId: ELEMENT,
      durationMs: 500,
      tracks: [{ property: 'opacity', keyframes: [{ timeMs: 0, value: 0 }], easing: 'linear' }],
    });
    const trackId = created.tracks[0]!.id;
    const res = await handlers.createKeyframe(
      req(
        'POST',
        '/v1/tracks/:id/keyframes',
        { id: trackId },
        {
          timeMs: 250,
          value: 0.5,
        },
      ),
      ctx,
    );
    expect(res.status).toBe(201);
    const body = res.body as { timeMs: number; value: number };
    expect(body.timeMs).toBe(250);
    expect(body.value).toBe(0.5);
  });

  it('POST /v1/tracks/:id/keyframes returns 404 for unknown track', async () => {
    const { ctx } = makeCtx();
    const res = await handlers.createKeyframe(
      req(
        'POST',
        '/v1/tracks/:id/keyframes',
        { id: 'nonexistent' },
        {
          timeMs: 0,
          value: 0,
        },
      ),
      ctx,
    );
    expect(res.status).toBe(404);
  });

  it('POST /v1/timelines/:id/triggers creates a trigger', async () => {
    const { ctx, svc } = makeCtx();
    const created = await svc.createTimeline({
      tenantId: TENANT,
      deckId: DECK,
      slideId: SLIDE,
      elementId: ELEMENT,
      durationMs: 500,
    });
    const res = await handlers.createTrigger(
      req(
        'POST',
        '/v1/timelines/:id/triggers',
        { id: created.id },
        {
          kind: 'on_click',
        },
        { tenant_id: TENANT },
      ),
      ctx,
    );
    expect(res.status).toBe(201);
    const body = res.body as { kind: string };
    expect(body.kind).toBe('on_click');
  });
});

// =========================================================================
// Easing curves
// =========================================================================

describe('timeline handlers — easing curves', () => {
  it('POST /v1/workspaces/:workspace_id/easing-curves creates a curve', async () => {
    const { ctx } = makeCtx();
    const res = await handlers.createEasingCurve(
      req(
        'POST',
        '/v1/workspaces/:workspace_id/easing-curves',
        { workspace_id: WORKSPACE },
        {
          name: 'Ease In',
          type: 'cubic_bezier',
          params: { bezier: [0.42, 0, 1, 1] },
        },
      ),
      ctx,
    );
    expect(res.status).toBe(201);
    const body = res.body as { name: string; type: string };
    expect(body.name).toBe('Ease In');
    expect(body.type).toBe('cubic_bezier');
  });

  it('POST /v1/workspaces/:workspace_id/easing-curves returns 422 for non-monotonic Bezier', async () => {
    const { ctx } = makeCtx();
    const res = await handlers.createEasingCurve(
      req(
        'POST',
        '/v1/workspaces/:workspace_id/easing-curves',
        { workspace_id: WORKSPACE },
        {
          name: 'Bad Curve',
          type: 'cubic_bezier',
          params: { bezier: [0.8, 0, 0.2, 1] }, // x1=0.8 > x2=0.2
        },
      ),
      ctx,
    );
    expect(res.status).toBe(422);
    const body = res.body as { code: string };
    expect(body.code).toBe('EASING_VALIDATION_REJECTED');
  });

  it('POST /v1/workspaces/:workspace_id/easing-curves returns 422 for out-of-bounds spring params', async () => {
    const { ctx } = makeCtx();
    const res = await handlers.createEasingCurve(
      req(
        'POST',
        '/v1/workspaces/:workspace_id/easing-curves',
        { workspace_id: WORKSPACE },
        {
          name: 'Bad Spring',
          type: 'spring',
          params: { spring: { mass: 0.01, stiffness: 5, damping: 0.5 } }, // all out of bounds
        },
      ),
      ctx,
    );
    expect(res.status).toBe(422);
    const body = res.body as { code: string };
    expect(body.code).toBe('EASING_VALIDATION_REJECTED');
  });

  it('GET /v1/workspaces/:workspace_id/easing-curves lists curves', async () => {
    const { ctx, svc } = makeCtx();
    await svc.createEasingCurve(WORKSPACE, {
      name: 'Linear',
      type: 'linear',
      params: {},
    });
    const res = await handlers.listEasingCurves(
      req(
        'GET',
        '/v1/workspaces/:workspace_id/easing-curves',
        { workspace_id: WORKSPACE },
        undefined,
      ),
      ctx,
    );
    expect(res.status).toBe(200);
    const body = res.body as { easingCurves: unknown[] };
    expect(body.easingCurves.length).toBe(1);
  });

  it('PATCH /v1/easing-curves/:id updates a curve', async () => {
    const { ctx, svc } = makeCtx();
    const created = await svc.createEasingCurve(WORKSPACE, {
      name: 'Ease Out',
      type: 'cubic_bezier',
      params: { bezier: [0, 0, 0.58, 1] },
    });
    const res = await handlers.patchEasingCurve(
      req(
        'PATCH',
        '/v1/easing-curves/:id',
        { id: created.id },
        {
          name: 'Ease Out Updated',
        },
        { workspace_id: WORKSPACE },
      ),
      ctx,
    );
    expect(res.status).toBe(200);
    const body = res.body as { name: string };
    expect(body.name).toBe('Ease Out Updated');
  });

  it('DELETE /v1/easing-curves/:id deletes a curve', async () => {
    const { ctx, svc } = makeCtx();
    const created = await svc.createEasingCurve(WORKSPACE, {
      name: 'To Delete',
      type: 'linear',
      params: {},
    });
    const res = await handlers.deleteEasingCurve(
      req('DELETE', '/v1/easing-curves/:id', { id: created.id }, undefined, {
        workspace_id: WORKSPACE,
      }),
      ctx,
    );
    expect(res.status).toBe(204);
  });

  it('GET /v1/easing-curves/:id returns 404 for unknown', async () => {
    const { ctx } = makeCtx();
    const res = await handlers.getEasingCurve(
      req('GET', '/v1/easing-curves/:id', { id: 'nonexistent' }, undefined, {
        workspace_id: WORKSPACE,
      }),
      ctx,
    );
    expect(res.status).toBe(404);
  });
});

// =========================================================================
// Animation presets
// =========================================================================

describe('timeline handlers — animation presets', () => {
  it('POST /v1/workspaces/:workspace_id/animation-presets creates a preset', async () => {
    const { ctx } = makeCtx();
    const res = await handlers.createAnimationPreset(
      req(
        'POST',
        '/v1/workspaces/:workspace_id/animation-presets',
        { workspace_id: WORKSPACE },
        {
          name: 'Fade In',
          category: 'entrance',
          tags: ['opacity', 'fade'],
          definition: {
            durationMs: 500,
            tracks: [
              {
                property: 'opacity',
                keyframes: [
                  { timeMs: 0, value: 0 },
                  { timeMs: 500, value: 1 },
                ],
                easing: 'linear',
              },
            ],
          },
        },
      ),
      ctx,
    );
    expect(res.status).toBe(201);
    const body = res.body as { name: string; category: string };
    expect(body.name).toBe('Fade In');
    expect(body.category).toBe('entrance');
  });

  it('GET /v1/workspaces/:workspace_id/animation-presets filters by category', async () => {
    const { ctx, svc } = makeCtx();
    await svc.createAnimationPreset(WORKSPACE, {
      name: 'Fade In',
      category: 'entrance',
      tags: [],
      definition: {
        durationMs: 500,
        tracks: [{ property: 'opacity', keyframes: [{ timeMs: 0, value: 0 }], easing: 'linear' }],
      },
    });
    await svc.createAnimationPreset(WORKSPACE, {
      name: 'Fade Out',
      category: 'exit',
      tags: [],
      definition: {
        durationMs: 500,
        tracks: [{ property: 'opacity', keyframes: [{ timeMs: 0, value: 1 }], easing: 'linear' }],
      },
    });
    const res = await handlers.listAnimationPresets(
      req(
        'GET',
        '/v1/workspaces/:workspace_id/animation-presets',
        { workspace_id: WORKSPACE },
        undefined,
        { category: 'entrance' },
      ),
      ctx,
    );
    expect(res.status).toBe(200);
    const body = res.body as { animationPresets: Array<{ category: string }> };
    expect(body.animationPresets.length).toBe(1);
    expect(body.animationPresets[0]!.category).toBe('entrance');
  });

  it('GET /v1/workspaces/:workspace_id/animation-presets filters by tag', async () => {
    const { ctx, svc } = makeCtx();
    await svc.createAnimationPreset(WORKSPACE, {
      name: 'Fade In',
      category: 'entrance',
      tags: ['opacity', 'fade'],
      definition: {
        durationMs: 500,
        tracks: [{ property: 'opacity', keyframes: [{ timeMs: 0, value: 0 }], easing: 'linear' }],
      },
    });
    await svc.createAnimationPreset(WORKSPACE, {
      name: 'Bounce',
      category: 'emphasis',
      tags: ['position'],
      definition: {
        durationMs: 300,
        tracks: [
          { property: 'translateY', keyframes: [{ timeMs: 0, value: 0 }], easing: 'linear' },
        ],
      },
    });
    const res = await handlers.listAnimationPresets(
      req(
        'GET',
        '/v1/workspaces/:workspace_id/animation-presets',
        { workspace_id: WORKSPACE },
        undefined,
        { tag: 'fade' },
      ),
      ctx,
    );
    expect(res.status).toBe(200);
    const body = res.body as { animationPresets: Array<{ name: string }> };
    expect(body.animationPresets.length).toBe(1);
    expect(body.animationPresets[0]!.name).toBe('Fade In');
  });

  it('preset applied to element missing required property is rejected with inline error', async () => {
    const { svc } = makeCtx();
    const preset = await svc.createAnimationPreset(WORKSPACE, {
      name: 'Rotate Fade',
      category: 'entrance',
      tags: [],
      definition: {
        durationMs: 500,
        tracks: [{ property: 'rotate', keyframes: [{ timeMs: 0, value: 0 }], easing: 'linear' }],
        requiredProperties: ['rotate'],
      },
    });
    const res = await svc
      .applyPreset({
        presetId: preset.id,
        workspaceId: WORKSPACE,
        tenantId: TENANT,
        deckId: DECK,
        slideId: SLIDE,
        elementId: ELEMENT,
        elementProperties: ['opacity', 'scale'], // missing 'rotate'
        slideIds: [SLIDE],
        isLastSlide: false,
      })
      .catch((e) => e);
    expect(res.code).toBe('PRESET_MISSING_PROPERTY');
    expect(res.missingProperty).toBe('rotate');
  });

  it('preset on_enter on last slide is converted to on_click', async () => {
    const { svc } = makeCtx();
    const preset = await svc.createAnimationPreset(WORKSPACE, {
      name: 'Enter Slide',
      category: 'entrance',
      tags: [],
      definition: {
        durationMs: 400,
        tracks: [
          {
            property: 'opacity',
            keyframes: [
              { timeMs: 0, value: 0 },
              { timeMs: 400, value: 1 },
            ],
            easing: 'linear',
          },
        ],
        triggers: [{ kind: 'on_enter' }],
      },
    });
    const result = await svc.applyPreset({
      presetId: preset.id,
      workspaceId: WORKSPACE,
      tenantId: TENANT,
      deckId: DECK,
      slideId: SLIDE,
      elementId: ELEMENT,
      elementProperties: ['opacity'],
      slideIds: ['s1', 's2'],
      isLastSlide: true,
    });
    expect(result.convertedTrigger).toBe(true);
    expect(result.timeline.triggers[0]!.kind).toBe('on_click');
  });
});

// =========================================================================
// Transitions
// =========================================================================

describe('timeline handlers — transitions', () => {
  it('POST /v1/decks/:deck_id/transitions creates a transition', async () => {
    const { ctx } = makeCtx();
    const res = await handlers.createTransition(
      req(
        'POST',
        '/v1/decks/:deck_id/transitions',
        { deck_id: DECK },
        {
          fromSlideId: 's1',
          toSlideId: 's2',
          type: 'fade',
        },
      ),
      ctx,
    );
    expect(res.status).toBe(201);
    const body = res.body as { type: string; fromSlideId: string };
    expect(body.type).toBe('fade');
    expect(body.fromSlideId).toBe('s1');
  });

  it('POST /v1/decks/:deck_id/transitions returns 400 on invalid body', async () => {
    const { ctx } = makeCtx();
    const res = await handlers.createTransition(
      req(
        'POST',
        '/v1/decks/:deck_id/transitions',
        { deck_id: DECK },
        {
          fromSlideId: 's1',
          // missing toSlideId and type
        },
      ),
      ctx,
    );
    expect(res.status).toBe(400);
  });

  it('GET /v1/decks/:deck_id/transitions lists transitions', async () => {
    const { ctx, svc } = makeCtx();
    await svc.createTransition(DECK, {
      fromSlideId: 's1',
      toSlideId: 's2',
      type: 'slide',
    });
    const res = await handlers.listTransitions(
      req('GET', '/v1/decks/:deck_id/transitions', { deck_id: DECK }, undefined),
      ctx,
    );
    expect(res.status).toBe(200);
    const body = res.body as { transitions: unknown[] };
    expect(body.transitions.length).toBe(1);
  });
});

// =========================================================================
// Reduced motion
// =========================================================================

describe('timeline handlers — reduced motion', () => {
  it('GET /v1/decks/:deck_id/reduced-motion returns defaults', async () => {
    const { ctx } = makeCtx();
    const res = await handlers.getReducedMotion(
      req('GET', '/v1/decks/:deck_id/reduced-motion', { deck_id: DECK }, undefined),
      ctx,
    );
    expect(res.status).toBe(200);
    const body = res.body as { mode: string };
    expect(body.mode).toBe('follow_os');
  });

  it('PUT /v1/decks/:deck_id/reduced-motion updates mode', async () => {
    const { ctx } = makeCtx();
    const res = await handlers.putReducedMotion(
      req(
        'PUT',
        '/v1/decks/:deck_id/reduced-motion',
        { deck_id: DECK },
        {
          mode: 'always_reduced',
        },
      ),
      ctx,
    );
    expect(res.status).toBe(200);
    const body = res.body as { mode: string };
    expect(body.mode).toBe('always_reduced');
  });

  it('PUT /v1/decks/:deck_id/reduced-motion returns 400 on invalid mode', async () => {
    const { ctx } = makeCtx();
    const res = await handlers.putReducedMotion(
      req(
        'PUT',
        '/v1/decks/:deck_id/reduced-motion',
        { deck_id: DECK },
        {
          mode: 'invalid_mode',
        },
      ),
      ctx,
    );
    expect(res.status).toBe(400);
  });
});

// =========================================================================
// Metrics & Audit
// =========================================================================

describe('timeline handlers — metrics', () => {
  it('records creation metrics', async () => {
    const { ctx, metrics } = makeCtx();
    await handlers.createTimeline(
      req(
        'POST',
        '/v1/decks/:deck_id/timelines',
        { deck_id: DECK },
        {
          slideId: SLIDE,
          elementId: ELEMENT,
          durationMs: 1000,
        },
        { tenant_id: TENANT },
      ),
      ctx,
    );
    const snap = metrics.snapshot();
    expect(snap.timelinesCreatedTotal).toBe(1);
  });

  it('records version conflict metrics', async () => {
    const { ctx, svc, metrics } = makeCtx();
    const created = await svc.createTimeline({
      tenantId: TENANT,
      deckId: DECK,
      slideId: SLIDE,
      elementId: ELEMENT,
      durationMs: 500,
    });
    await svc.patchTimeline(created.id, TENANT, { version: 1, durationMs: 1000 });
    await handlers.patchTimeline(
      req(
        'PATCH',
        '/v1/timelines/:id',
        { id: created.id },
        {
          version: 1,
          durationMs: 3000,
        },
        { tenant_id: TENANT },
      ),
      ctx,
    );
    const snap = metrics.snapshot();
    expect(snap.versionConflictsTotal).toBe(1);
  });
});
