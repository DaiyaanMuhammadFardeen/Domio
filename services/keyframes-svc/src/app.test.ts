/**
 * Phase 11 camera keyframe service — comprehensive tests.
 *
 * Coverage (~40 tests):
 *   - CRUD: create, list, get, patch, delete
 *   - Interpolation: known midpoint, linear easing, default bezier easing curve
 *   - Crossfade: flag when slideId differs
 *   - Batch: LUT 60Hz, 413 limit
 *   - Validation: 400s for bad bodies, easing monotonicity
 *   - LRU cache: hit rate, eviction
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createApp } from './app.js';
import type { CameraKeyframe, BezierEasing } from './types.js';
import { EasingLruCache, easingKey } from './easing-cache.js';
import { interpolatePose, checkCrossfade } from './interpolator.js';
import {
  InMemoryCameraKeyframeRepository,
  defaultIdGenerator,
} from './repo.js';
import {
  validateCreateKeyframe,
  validatePatchKeyframe,
  validateInterpolateBody,
  validateBatchBody,
  validateEasingMonotonicity,
} from './schemas.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function kf(overrides: Partial<CameraKeyframe> = {}): CameraKeyframe {
  return {
    id: overrides.id ?? defaultIdGenerator(),
    slideId: overrides.slideId ?? 'slide-1',
    sceneId: overrides.sceneId ?? null,
    orderIndex: overrides.orderIndex ?? 0,
    position: overrides.position ?? { x: 0, y: 0, z: 0 },
    target: overrides.target ?? { x: 0, y: 0, z: 10 },
    fov: overrides.fov ?? 50,
    roll: overrides.roll ?? 0,
    easing: overrides.easing ?? { p1x: 0, p1y: 0, p2x: 1, p2y: 1 },
    durationMs: overrides.durationMs ?? 1000,
    trigger: overrides.trigger ?? 'auto',
    createdAt: overrides.createdAt ?? '2025-01-15T00:00:00Z',
  };
}

const LINEAR_EASING: BezierEasing = { p1x: 0, p1y: 0, p2x: 1, p2y: 1 };
const EASE_IN_OUT: BezierEasing = { p1x: 0.42, p1y: 0, p2x: 0.58, p2y: 1 };

// =========================================================================
// Schema validation
// =========================================================================

describe('schema validation', () => {
  it('validateCreateKeyframe accepts valid body', () => {
    const res = validateCreateKeyframe({
      position: { x: 0, y: 0, z: 0 },
      target: { x: 0, y: 0, z: 10 },
      fov: 50,
    });
    expect(res.valid).toBe(true);
    expect(res.errors).toHaveLength(0);
  });

  it('validateCreateKeyframe rejects missing position', () => {
    const res = validateCreateKeyframe({ target: { x: 0, y: 0, z: 10 }, fov: 50 });
    expect(res.valid).toBe(false);
  });

  it('validateCreateKeyframe rejects missing target', () => {
    const res = validateCreateKeyframe({ position: { x: 0, y: 0, z: 0 }, fov: 50 });
    expect(res.valid).toBe(false);
  });

  it('validateCreateKeyframe rejects missing fov', () => {
    const res = validateCreateKeyframe({ position: { x: 0, y: 0, z: 0 }, target: { x: 0, y: 0, z: 10 } });
    expect(res.valid).toBe(false);
  });

  it('validateCreateKeyframe rejects invalid trigger enum', () => {
    const res = validateCreateKeyframe({
      position: { x: 0, y: 0, z: 0 },
      target: { x: 0, y: 0, z: 10 },
      fov: 50,
      trigger: 'invalid',
    });
    expect(res.valid).toBe(false);
  });

  it('validateCreateKeyframe rejects fov out of range', () => {
    const res = validateCreateKeyframe({
      position: { x: 0, y: 0, z: 0 },
      target: { x: 0, y: 0, z: 10 },
      fov: 200,
    });
    expect(res.valid).toBe(false);
  });

  it('validateCreateKeyframe rejects additional properties', () => {
    const res = validateCreateKeyframe({
      position: { x: 0, y: 0, z: 0 },
      target: { x: 0, y: 0, z: 10 },
      fov: 50,
      unknown: true,
    });
    expect(res.valid).toBe(false);
  });

  it('validatePatchKeyframe accepts partial body', () => {
    const res = validatePatchKeyframe({ fov: 60 });
    expect(res.valid).toBe(true);
  });

  it('validatePatchKeyframe rejects empty body', () => {
    const res = validatePatchKeyframe({});
    expect(res.valid).toBe(false);
  });

  it('validateInterpolateBody accepts valid body', () => {
    const res = validateInterpolateBody({
      keyframes: [{ orderIndex: 0, position: { x: 0, y: 0, z: 0 }, target: { x: 0, y: 0, z: 10 }, fov: 50, easing: LINEAR_EASING, durationMs: 1000 }],
      time_ms: 500,
    });
    expect(res.valid).toBe(true);
  });

  it('validateInterpolateBody rejects missing keyframes', () => {
    const res = validateInterpolateBody({ time_ms: 500 });
    expect(res.valid).toBe(false);
  });

  it('validateInterpolateBody rejects missing time_ms', () => {
    const res = validateInterpolateBody({ keyframes: [{}] });
    expect(res.valid).toBe(false);
  });

  it('validateInterpolateBody rejects empty keyframes array', () => {
    const res = validateInterpolateBody({ keyframes: [], time_ms: 0 });
    expect(res.valid).toBe(false);
  });

  it('validateBatchBody accepts valid body', () => {
    const res = validateBatchBody({
      keyframes: [{ orderIndex: 0, position: { x: 0, y: 0, z: 0 }, target: { x: 0, y: 0, z: 10 }, fov: 50, easing: LINEAR_EASING, durationMs: 1000 }],
    });
    expect(res.valid).toBe(true);
  });

  it('validateBatchBody rejects missing keyframes', () => {
    const res = validateBatchBody({});
    expect(res.valid).toBe(false);
  });
});

// =========================================================================
// Easing monotonicity validation
// =========================================================================

describe('easing monotonicity validation', () => {
  it('accepts valid monotonic easing (p1x <= p2x)', () => {
    const errors = validateEasingMonotonicity({ p1x: 0.25, p2x: 0.75 });
    expect(errors).toHaveLength(0);
  });

  it('accepts equal p1x and p2x', () => {
    const errors = validateEasingMonotonicity({ p1x: 0.5, p2x: 0.5 });
    expect(errors).toHaveLength(0);
  });

  it('rejects non-monotonic easing (p1x > p2x)', () => {
    const errors = validateEasingMonotonicity({ p1x: 0.8, p2x: 0.2 });
    expect(errors).toHaveLength(1);
    expect(errors[0]!.code).toBe('NON_MONOTONIC_EASING');
  });
});

// =========================================================================
// CRUD — via Hono app.request()
// =========================================================================

describe('CRUD routes', () => {
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    app = createApp({ idGenerator: defaultIdGenerator });
  });

  it('POST /v1/slides/:slideId/camera_keyframes creates a keyframe', async () => {
    const res = await app.request('/v1/slides/slide-1/camera_keyframes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        position: { x: 1, y: 2, z: 3 },
        target: { x: 0, y: 0, z: 0 },
        fov: 60,
      }),
    });
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.position).toEqual({ x: 1, y: 2, z: 3 });
    expect(json.fov).toBe(60);
    expect(json.slideId).toBe('slide-1');
    expect(json.id).toBeDefined();
    expect(json.createdAt).toBeDefined();
  });

  it('POST /v1/slides/:slideId/camera_keyframes returns 400 on invalid body', async () => {
    const res = await app.request('/v1/slides/slide-1/camera_keyframes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ position: { x: 0, y: 0, z: 0 } }),
    });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.code).toBe('VALIDATION_ERROR');
  });

  it('POST /v1/slides/:slideId/camera_keyframes returns 400 on invalid easing', async () => {
    const res = await app.request('/v1/slides/slide-1/camera_keyframes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        position: { x: 0, y: 0, z: 0 },
        target: { x: 0, y: 0, z: 10 },
        fov: 50,
        easing: { p1x: 0.8, p1y: 0, p2x: 0.2, p2y: 1 },
      }),
    });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.code).toBe('NON_MONOTONIC_EASING');
  });

  it('POST /v1/slides/:slideId/camera_keyframes returns 400 on non-monotonic easing', async () => {
    const res = await app.request('/v1/slides/slide-1/camera_keyframes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        position: { x: 0, y: 0, z: 0 },
        target: { x: 0, y: 0, z: 10 },
        fov: 50,
        easing: { p1x: 0.9, p1y: 0, p2x: 0.1, p2y: 1 },
      }),
    });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.code).toBe('NON_MONOTONIC_EASING');
  });

  it('GET /v1/slides/:slideId/camera_keyframes lists keyframes ordered by orderIndex', async () => {
    // Create two keyframes
    await app.request('/v1/slides/slide-1/camera_keyframes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        position: { x: 0, y: 0, z: 0 },
        target: { x: 0, y: 0, z: 10 },
        fov: 50,
        orderIndex: 1,
      }),
    });
    await app.request('/v1/slides/slide-1/camera_keyframes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        position: { x: 5, y: 5, z: 5 },
        target: { x: 0, y: 0, z: 0 },
        fov: 60,
        orderIndex: 0,
      }),
    });

    const res = await app.request('/v1/slides/slide-1/camera_keyframes');
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.items).toHaveLength(2);
    expect(json.items[0].orderIndex).toBe(0);
    expect(json.items[1].orderIndex).toBe(1);
  });

  it('GET /v1/slides/:slideId/camera_keyframes filters by scene_id', async () => {
    await app.request('/v1/slides/slide-1/camera_keyframes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        position: { x: 0, y: 0, z: 0 },
        target: { x: 0, y: 0, z: 10 },
        fov: 50,
        sceneId: 'scene-A',
      }),
    });
    await app.request('/v1/slides/slide-1/camera_keyframes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        position: { x: 1, y: 1, z: 1 },
        target: { x: 0, y: 0, z: 0 },
        fov: 50,
        sceneId: 'scene-B',
      }),
    });

    const res = await app.request('/v1/slides/slide-1/camera_keyframes?scene_id=scene-A');
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.items).toHaveLength(1);
    expect(json.items[0].sceneId).toBe('scene-A');
  });

  it('GET /v1/camera_keyframes/:id returns a keyframe', async () => {
    const createRes = await app.request('/v1/slides/slide-1/camera_keyframes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        position: { x: 1, y: 2, z: 3 },
        target: { x: 0, y: 0, z: 0 },
        fov: 50,
      }),
    });
    const created = await createRes.json();

    const res = await app.request(`/v1/camera_keyframes/${created.id}`);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.id).toBe(created.id);
    expect(json.position).toEqual({ x: 1, y: 2, z: 3 });
  });

  it('GET /v1/camera_keyframes/:id returns 404 for unknown', async () => {
    const res = await app.request('/v1/camera_keyframes/nonexistent');
    expect(res.status).toBe(404);
  });

  it('PATCH /v1/camera_keyframes/:id updates a keyframe', async () => {
    const createRes = await app.request('/v1/slides/slide-1/camera_keyframes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        position: { x: 0, y: 0, z: 0 },
        target: { x: 0, y: 0, z: 10 },
        fov: 50,
      }),
    });
    const created = await createRes.json();

    const res = await app.request(`/v1/camera_keyframes/${created.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fov: 90 }),
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.fov).toBe(90);
    expect(json.position).toEqual({ x: 0, y: 0, z: 0 }); // unchanged
  });

  it('PATCH /v1/camera_keyframes/:id returns 404 for unknown', async () => {
    const res = await app.request('/v1/camera_keyframes/nonexistent', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fov: 90 }),
    });
    expect(res.status).toBe(404);
  });

  it('PATCH /v1/camera_keyframes/:id returns 400 on empty body', async () => {
    const createRes = await app.request('/v1/slides/slide-1/camera_keyframes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        position: { x: 0, y: 0, z: 0 },
        target: { x: 0, y: 0, z: 10 },
        fov: 50,
      }),
    });
    const created = await createRes.json();

    const res = await app.request(`/v1/camera_keyframes/${created.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  it('DELETE /v1/camera_keyframes/:id deletes a keyframe', async () => {
    const createRes = await app.request('/v1/slides/slide-1/camera_keyframes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        position: { x: 0, y: 0, z: 0 },
        target: { x: 0, y: 0, z: 10 },
        fov: 50,
      }),
    });
    const created = await createRes.json();

    const delRes = await app.request(`/v1/camera_keyframes/${created.id}`, {
      method: 'DELETE',
    });
    expect(delRes.status).toBe(204);

    const getRes = await app.request(`/v1/camera_keyframes/${created.id}`);
    expect(getRes.status).toBe(404);
  });

  it('DELETE /v1/camera_keyframes/:id returns 404 for unknown', async () => {
    const res = await app.request('/v1/camera_keyframes/nonexistent', {
      method: 'DELETE',
    });
    expect(res.status).toBe(404);
  });
});

// =========================================================================
// Interpolation
// =========================================================================

describe('interpolation', () => {
  it('POST /v1/camera-keyframes/interpolate returns 400 on invalid body', async () => {
    const app = createApp();
    const res = await app.request('/v1/camera-keyframes/interpolate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ time_ms: 500 }),
    });
    expect(res.status).toBe(400);
  });

  it('POST /v1/camera-keyframes/interpolate returns 400 on empty keyframes', async () => {
    const app = createApp();
    const res = await app.request('/v1/camera-keyframes/interpolate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keyframes: [], time_ms: 0 }),
    });
    expect(res.status).toBe(400);
  });

  it('POST /v1/camera-keyframes/interpolate returns 400 on non-monotonic easing', async () => {
    const app = createApp();
    const badKf = {
      id: 'test-id',
      slideId: 's1',
      sceneId: null,
      orderIndex: 0,
      position: { x: 0, y: 0, z: 0 },
      target: { x: 0, y: 0, z: 10 },
      fov: 50,
      roll: 0,
      easing: { p1x: 0.8, p1y: 0, p2x: 0.2, p2y: 1 },
      durationMs: 1000,
      trigger: 'auto',
      createdAt: '2025-01-15T00:00:00Z',
    };
    const res = await app.request('/v1/camera-keyframes/interpolate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keyframes: [badKf], time_ms: 0 }),
    });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.code).toBe('NON_MONOTONIC_EASING');
  });

  it('midpoint of two keyframes with linear easing = average of DOFs', () => {
    const k1 = kf({
      orderIndex: 0,
      position: { x: 0, y: 0, z: 0 },
      target: { x: 0, y: 0, z: 10 },
      fov: 40,
      roll: 0,
      easing: LINEAR_EASING,
      durationMs: 1000,
    });
    const k2 = kf({
      orderIndex: 1,
      position: { x: 10, y: 10, z: 10 },
      target: { x: 5, y: 5, z: 5 },
      fov: 80,
      roll: 45,
      easing: LINEAR_EASING,
      durationMs: 1000,
    });

    const pose = interpolatePose([k1, k2], 500);

    expect(pose.position.x).toBeCloseTo(5, 5);
    expect(pose.position.y).toBeCloseTo(5, 5);
    expect(pose.position.z).toBeCloseTo(5, 5);
    expect(pose.target.x).toBeCloseTo(2.5, 5);
    expect(pose.target.y).toBeCloseTo(2.5, 5);
    expect(pose.target.z).toBeCloseTo(7.5, 5);
    expect(pose.fov).toBeCloseTo(60, 5);
    expect(pose.roll).toBeCloseTo(22.5, 5);
  });

  it('default bezier [0.42,0,0.58,1] eases slower in first half', () => {
    const k1 = kf({
      orderIndex: 0,
      easing: EASE_IN_OUT,
      durationMs: 1000,
    });
    const k2 = kf({
      orderIndex: 1,
      position: { x: 10, y: 0, z: 0 },
      easing: EASE_IN_OUT,
      durationMs: 1000,
    });

    // At t=0.3 (30% of 1000ms), eased position should be < 3 (linear would be 3)
    const pose300 = interpolatePose([k1, k2], 300);
    // Linear t = 0.3 → position.x = 3
    // Ease-in-out at t=0.3 should be < 3 (slower start)
    expect(pose300.position.x).toBeLessThan(3);

    // At t=0.7 (70% of 1000ms), eased position should be > 7 (linear would be 7)
    const pose700 = interpolatePose([k1, k2], 700);
    expect(pose700.position.x).toBeGreaterThan(7);
  });

  it('returns first keyframe pose when time is 0', () => {
    const k1 = kf({
      orderIndex: 0,
      position: { x: 1, y: 2, z: 3 },
      target: { x: 4, y: 5, z: 6 },
      fov: 70,
      roll: 15,
      durationMs: 1000,
    });
    const k2 = kf({
      orderIndex: 1,
      position: { x: 10, y: 10, z: 10 },
      fov: 90,
      durationMs: 1000,
    });

    const pose = interpolatePose([k1, k2], 0);
    expect(pose.position).toEqual({ x: 1, y: 2, z: 3 });
    expect(pose.target).toEqual({ x: 4, y: 5, z: 6 });
    expect(pose.fov).toBe(70);
    expect(pose.roll).toBe(15);
  });

  it('returns last keyframe pose at total duration', () => {
    const k1 = kf({
      orderIndex: 0,
      position: { x: 0, y: 0, z: 0 },
      easing: LINEAR_EASING,
      durationMs: 1000,
    });
    const k2 = kf({
      orderIndex: 1,
      position: { x: 10, y: 10, z: 10 },
      easing: LINEAR_EASING,
      durationMs: 1000,
    });

    const pose = interpolatePose([k1, k2], 1000);
    expect(pose.position.x).toBeCloseTo(10, 5);
    expect(pose.position.y).toBeCloseTo(10, 5);
    expect(pose.position.z).toBeCloseTo(10, 5);
  });

  it('clamps time beyond total duration', () => {
    const k1 = kf({
      orderIndex: 0,
      position: { x: 0, y: 0, z: 0 },
      easing: LINEAR_EASING,
      durationMs: 500,
    });
    const k2 = kf({
      orderIndex: 1,
      position: { x: 10, y: 10, z: 10 },
      easing: LINEAR_EASING,
      durationMs: 500,
    });

    const pose = interpolatePose([k1, k2], 5000); // way beyond total 1000ms
    expect(pose.position.x).toBeCloseTo(10, 5);
  });

  it('returns default pose for empty keyframes', () => {
    const pose = interpolatePose([], 500);
    expect(pose.position).toEqual({ x: 0, y: 0, z: 0 });
    expect(pose.fov).toBe(50);
  });

  it('returns single keyframe pose for one keyframe', () => {
    const k1 = kf({
      position: { x: 5, y: 5, z: 5 },
      fov: 90,
      roll: 30,
    });
    const pose = interpolatePose([k1], 500);
    expect(pose.position).toEqual({ x: 5, y: 5, z: 5 });
    expect(pose.fov).toBe(90);
    expect(pose.roll).toBe(30);
  });

  it('POST /v1/camera-keyframes/interpolate works via app.request', async () => {
    const app = createApp();
    const k1 = {
      id: 'k1',
      slideId: 's1',
      sceneId: null,
      orderIndex: 0,
      position: { x: 0, y: 0, z: 0 },
      target: { x: 0, y: 0, z: 10 },
      fov: 40,
      roll: 0,
      easing: { p1x: 0, p1y: 0, p2x: 1, p2y: 1 },
      durationMs: 1000,
      trigger: 'auto',
      createdAt: '2025-01-15T00:00:00Z',
    };
    const k2 = {
      ...k1,
      id: 'k2',
      orderIndex: 1,
      position: { x: 10, y: 10, z: 10 },
      fov: 80,
    };

    const res = await app.request('/v1/camera-keyframes/interpolate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keyframes: [k1, k2], time_ms: 500 }),
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.pose.position.x).toBeCloseTo(5, 5);
    expect(json.pose.fov).toBeCloseTo(60, 5);
  });
});

// =========================================================================
// Crossfade flag
// =========================================================================

describe('crossfade', () => {
  it('checkCrossfade returns false when slideId matches', () => {
    const k1 = kf({ slideId: 's1' });
    const k2 = kf({ slideId: 's1' });
    expect(checkCrossfade([k1, k2])).toBe(false);
  });

  it('checkCrossfade returns true when slideId differs', () => {
    const k1 = kf({ slideId: 's1' });
    const k2 = kf({ slideId: 's2' });
    expect(checkCrossfade([k1, k2])).toBe(true);
  });

  it('checkCrossfade returns false for single keyframe', () => {
    const k1 = kf({ slideId: 's1' });
    expect(checkCrossfade([k1])).toBe(false);
  });

  it('checkCrossfade returns false for empty array', () => {
    expect(checkCrossfade([])).toBe(false);
  });

  it('POST /v1/camera-keyframes/interpolate includes crossfade flag', async () => {
    const app = createApp();
    const k1 = {
      id: 'k1',
      slideId: 's1',
      sceneId: null,
      orderIndex: 0,
      position: { x: 0, y: 0, z: 0 },
      target: { x: 0, y: 0, z: 10 },
      fov: 50,
      roll: 0,
      easing: { p1x: 0, p1y: 0, p2x: 1, p2y: 1 },
      durationMs: 1000,
      trigger: 'auto',
      createdAt: '2025-01-15T00:00:00Z',
    };
    const k2 = {
      ...k1,
      id: 'k2',
      slideId: 's2', // different slide!
      orderIndex: 1,
    };

    const res = await app.request('/v1/camera-keyframes/interpolate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keyframes: [k1, k2], time_ms: 0 }),
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.crossfade).toBe(true);
  });

  it('POST /v1/camera-keyframes/interpolate omits crossfade when same slide', async () => {
    const app = createApp();
    const k1 = {
      id: 'k1',
      slideId: 's1',
      sceneId: null,
      orderIndex: 0,
      position: { x: 0, y: 0, z: 0 },
      target: { x: 0, y: 0, z: 10 },
      fov: 50,
      roll: 0,
      easing: { p1x: 0, p1y: 0, p2x: 1, p2y: 1 },
      durationMs: 1000,
      trigger: 'auto',
      createdAt: '2025-01-15T00:00:00Z',
    };
    const k2 = { ...k1, id: 'k2', orderIndex: 1 };

    const res = await app.request('/v1/camera-keyframes/interpolate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keyframes: [k1, k2], time_ms: 500 }),
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.crossfade).toBeUndefined();
  });
});

// =========================================================================
// Batch LUT
// =========================================================================

describe('batch LUT', () => {
  it('POST /v1/camera-keyframes/batch returns LUT at 60Hz', async () => {
    const app = createApp();
    const k1 = {
      id: 'k1',
      slideId: 's1',
      sceneId: null,
      orderIndex: 0,
      position: { x: 0, y: 0, z: 0 },
      target: { x: 0, y: 0, z: 10 },
      fov: 50,
      roll: 0,
      easing: { p1x: 0, p1y: 0, p2x: 1, p2y: 1 },
      durationMs: 1000,
      trigger: 'auto',
      createdAt: '2025-01-15T00:00:00Z',
    };
    const k2 = {
      ...k1,
      id: 'k2',
      orderIndex: 1,
      position: { x: 10, y: 10, z: 10 },
      durationMs: 1000,
    };

    const res = await app.request('/v1/camera-keyframes/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keyframes: [k1, k2] }),
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.sample_rate_hz).toBe(60);
    expect(json.total_duration_ms).toBe(2000);
    // 2 seconds at 60Hz = 120 samples + 1 = 121 entries
    expect(json.lut.length).toBe(121);
    // First entry at time_ms 0
    expect(json.lut[0].time_ms).toBe(0);
    // Last entry at time_ms 2000
    expect(json.lut[json.lut.length - 1].time_ms).toBe(2000);
  });

  it('POST /v1/camera-keyframes/batch returns 413 when exceeding 600 entries', async () => {
    const app = createApp();
    // 11 seconds → 660 entries at 60Hz → exceeds 600
    const k1 = {
      id: 'k1',
      slideId: 's1',
      sceneId: null,
      orderIndex: 0,
      position: { x: 0, y: 0, z: 0 },
      target: { x: 0, y: 0, z: 10 },
      fov: 50,
      roll: 0,
      easing: { p1x: 0, p1y: 0, p2x: 1, p2y: 1 },
      durationMs: 11000,
      trigger: 'auto',
      createdAt: '2025-01-15T00:00:00Z',
    };

    const res = await app.request('/v1/camera-keyframes/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keyframes: [k1] }),
    });
    expect(res.status).toBe(413);
    const json = await res.json();
    expect(json.error).toBe('Keyframe timeline exceeds 600-frame LUT limit');
  });

  it('POST /v1/camera-keyframes/batch returns 400 on invalid body', async () => {
    const app = createApp();
    const res = await app.request('/v1/camera-keyframes/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.code).toBe('VALIDATION_ERROR');
  });

  it('POST /v1/camera-keyframes/batch returns 400 on non-monotonic easing', async () => {
    const app = createApp();
    const k1 = {
      id: 'k1',
      slideId: 's1',
      sceneId: null,
      orderIndex: 0,
      position: { x: 0, y: 0, z: 0 },
      target: { x: 0, y: 0, z: 10 },
      fov: 50,
      roll: 0,
      easing: { p1x: 0.9, p1y: 0, p2x: 0.1, p2y: 1 },
      durationMs: 1000,
      trigger: 'auto',
      createdAt: '2025-01-15T00:00:00Z',
    };

    const res = await app.request('/v1/camera-keyframes/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keyframes: [k1] }),
    });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.code).toBe('NON_MONOTONIC_EASING');
  });
});

// =========================================================================
// LRU easing cache
// =========================================================================

describe('LRU easing cache', () => {
  let cache: EasingLruCache;

  beforeEach(() => {
    cache = new EasingLruCache(64);
  });

  it('returns undefined on miss', () => {
    const key = easingKey(LINEAR_EASING, 256);
    expect(cache.get(key)).toBeUndefined();
  });

  it('returns value on hit after set', () => {
    const key = easingKey(LINEAR_EASING, 256);
    const lut = new Float64Array([0, 0.5, 1]);
    cache.set(key, lut);
    const hit = cache.get(key);
    expect(hit).toBeDefined();
    expect(hit![0]).toBe(0);
    expect(hit![1]).toBe(0.5);
    expect(hit![2]).toBe(1);
  });

  it('tracks hit rate correctly', () => {
    const key1 = easingKey(LINEAR_EASING, 256);
    const key2 = easingKey(EASE_IN_OUT, 256);

    cache.get(key1); // miss → misses=1
    cache.get(key2); // miss → misses=2
    cache.set(key1, new Float64Array([0, 1]));
    cache.get(key1); // hit → hits=1
    cache.get(key1); // hit → hits=2

    // 2 hits / (2 hits + 2 misses) = 0.5
    expect(cache.hitRate).toBeCloseTo(0.5, 5);
    expect(cache.hits).toBe(2);
    expect(cache.misses).toBe(2);
  });

  it('evicts LRU entry when capacity exceeded', () => {
    const smallCache = new EasingLruCache(2);
    const key1 = easingKey({ p1x: 0, p1y: 0, p2x: 0.25, p2y: 1 }, 256);
    const key2 = easingKey({ p1x: 0, p1y: 0, p2x: 0.5, p2y: 1 }, 256);
    const key3 = easingKey({ p1x: 0, p1y: 0, p2x: 0.75, p2y: 1 }, 256);

    smallCache.set(key1, new Float64Array([0]));
    smallCache.set(key2, new Float64Array([0]));
    expect(smallCache.size).toBe(2);

    // Adding third should evict key1
    smallCache.set(key3, new Float64Array([0]));
    expect(smallCache.size).toBe(2);
    expect(smallCache.get(key1)).toBeUndefined();
    expect(smallCache.get(key2)).toBeDefined();
    expect(smallCache.get(key3)).toBeDefined();
  });

  it('LRU access refreshes entry position', () => {
    const smallCache = new EasingLruCache(2);
    const key1 = easingKey({ p1x: 0, p1y: 0, p2x: 0.25, p2y: 1 }, 256);
    const key2 = easingKey({ p1x: 0, p1y: 0, p2x: 0.5, p2y: 1 }, 256);
    const key3 = easingKey({ p1x: 0, p1y: 0, p2x: 0.75, p2y: 1 }, 256);

    smallCache.set(key1, new Float64Array([0]));
    smallCache.set(key2, new Float64Array([0]));
    // Access key1 to refresh it
    smallCache.get(key1);
    // Now add key3 — should evict key2 (least recently used)
    smallCache.set(key3, new Float64Array([0]));
    expect(smallCache.get(key1)).toBeDefined();
    expect(smallCache.get(key2)).toBeUndefined();
  });

  it('clear resets everything', () => {
    const key = easingKey(LINEAR_EASING, 256);
    cache.set(key, new Float64Array([0, 1]));
    cache.get(key);
    cache.clear();
    expect(cache.size).toBe(0);
    expect(cache.hitRate).toBe(0);
  });
});

// =========================================================================
// Interpolator unit — multi-segment
// =========================================================================

describe('interpolator — multi-segment', () => {
  it('three keyframes interpolate correctly across segments', () => {
    const k1 = kf({ orderIndex: 0, position: { x: 0, y: 0, z: 0 }, easing: LINEAR_EASING, durationMs: 1000 });
    const k2 = kf({ orderIndex: 1, position: { x: 10, y: 0, z: 0 }, easing: LINEAR_EASING, durationMs: 1000 });
    const k3 = kf({ orderIndex: 2, position: { x: 10, y: 0, z: 10 }, easing: LINEAR_EASING, durationMs: 1000 });

    // At t=0: first keyframe
    const p0 = interpolatePose([k1, k2, k3], 0);
    expect(p0.position.x).toBeCloseTo(0, 5);

    // At t=500: middle of segment 1
    const p500 = interpolatePose([k1, k2, k3], 500);
    expect(p500.position.x).toBeCloseTo(5, 5);

    // At t=1000: start of segment 2 (= k2)
    const p1000 = interpolatePose([k1, k2, k3], 1000);
    expect(p1000.position.x).toBeCloseTo(10, 5);

    // At t=1500: middle of segment 2
    const p1500 = interpolatePose([k1, k2, k3], 1500);
    expect(p1500.position.x).toBeCloseTo(10, 5);
    expect(p1500.position.z).toBeCloseTo(5, 5);
  });
});

// =========================================================================
// Repo unit tests
// =========================================================================

describe('InMemoryCameraKeyframeRepository', () => {
  let repo: InMemoryCameraKeyframeRepository;

  beforeEach(() => {
    repo = new InMemoryCameraKeyframeRepository();
  });

  it('insert and findById', async () => {
    const record = kf({ id: 'test-1' });
    await repo.insert(record);
    const found = await repo.findById('test-1');
    expect(found).toBeDefined();
    expect(found!.id).toBe('test-1');
  });

  it('findById returns null for unknown', async () => {
    expect(await repo.findById('unknown')).toBeNull();
  });

  it('listBySlide returns sorted by orderIndex', async () => {
    await repo.insert(kf({ id: 'a', slideId: 's1', orderIndex: 2 }));
    await repo.insert(kf({ id: 'b', slideId: 's1', orderIndex: 0 }));
    await repo.insert(kf({ id: 'c', slideId: 's1', orderIndex: 1 }));
    const items = await repo.listBySlide('s1');
    expect(items.map((k) => k.id)).toEqual(['b', 'c', 'a']);
  });

  it('listBySlide filters by sceneId', async () => {
    await repo.insert(kf({ id: 'a', slideId: 's1', sceneId: 'scene-A' }));
    await repo.insert(kf({ id: 'b', slideId: 's1', sceneId: 'scene-B' }));
    const items = await repo.listBySlide('s1', 'scene-A');
    expect(items).toHaveLength(1);
    expect(items[0]!.id).toBe('a');
  });

  it('update merges position and target', async () => {
    const record = kf({ id: 'test-1', position: { x: 0, y: 0, z: 0 }, target: { x: 1, y: 1, z: 1 } });
    await repo.insert(record);
    const updated = await repo.update('test-1', { position: { x: 5, y: 0, z: 0 } });
    expect(updated.position.x).toBe(5);
    expect(updated.position.y).toBe(0);
    expect(updated.target).toEqual({ x: 1, y: 1, z: 1 }); // unchanged
  });

  it('update throws for unknown id', async () => {
    await expect(repo.update('unknown', { fov: 50 })).rejects.toThrow('not found');
  });

  it('delete returns true for existing', async () => {
    await repo.insert(kf({ id: 'test-1' }));
    expect(await repo.delete('test-1')).toBe(true);
    expect(await repo.findById('test-1')).toBeNull();
  });

  it('delete returns false for unknown', async () => {
    expect(await repo.delete('unknown')).toBe(false);
  });
});
