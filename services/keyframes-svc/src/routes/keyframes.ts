/**
 * Phase 11 camera keyframe — CRUD routes (Hono).
 *
 * Mirrors contracts/openapi/v1/3d-camera-keyframes.yaml paths exactly:
 *   GET    /v1/slides/:slideId/camera_keyframes
 *   POST   /v1/slides/:slideId/camera_keyframes
 *   GET    /v1/camera_keyframes/:id
 *   PATCH  /v1/camera_keyframes/:id
 *   DELETE /v1/camera_keyframes/:id
 */

import { Hono } from 'hono';
import type { CameraKeyframeRepository } from '../repo.js';
import { KeyframeNotFoundError } from '../repo.js';
import type { CameraKeyframe, TriggerMode } from '../types.js';
import { DEFAULT_EASING } from '../types.js';
import {
  validateCreateKeyframe,
  validatePatchKeyframe,
  validateEasingMonotonicity,
} from '../schemas.js';

export function createKeyframeRoutes(
  repo: CameraKeyframeRepository,
  idGen: () => string,
): Hono {
  const app = new Hono();

  // -----------------------------------------------------------------------
  // GET /v1/slides/:slideId/camera_keyframes — list keyframes for a slide
  // -----------------------------------------------------------------------
  app.get('/v1/slides/:slideId/camera_keyframes', async (c) => {
    const slideId = c.req.param('slideId');
    const sceneId = c.req.query('scene_id');
    const items = await repo.listBySlide(slideId, sceneId);
    return c.json({ items });
  });

  // -----------------------------------------------------------------------
  // POST /v1/slides/:slideId/camera_keyframes — create a keyframe
  // -----------------------------------------------------------------------
  app.post('/v1/slides/:slideId/camera_keyframes', async (c) => {
    const slideId = c.req.param('slideId');
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'Invalid JSON body', code: 'INVALID_JSON' }, 400);
    }

    const validation = validateCreateKeyframe(body);
    if (!validation.valid) {
      return c.json(
        {
          error: `Validation failed: ${validation.errors.map((e) => e.message).join('; ')}`,
          code: 'VALIDATION_ERROR',
          details: validation.errors,
        },
        400,
      );
    }

    const req = body as {
      position: { x: number; y: number; z: number };
      target: { x: number; y: number; z: number };
      fov: number;
      sceneId?: string;
      orderIndex?: number;
      roll?: number;
      easing?: { p1x: number; p1y: number; p2x: number; p2y: number };
      durationMs?: number;
      trigger?: TriggerMode;
    };

    // Business-rule: easing monotonicity
    if (req.easing) {
      const easingErrors = validateEasingMonotonicity(req.easing);
      if (easingErrors.length > 0) {
        return c.json(
          {
            error: easingErrors.map((e) => e.message).join('; '),
            code: easingErrors[0]!.code,
          },
          400,
        );
      }
    }

    const now = new Date().toISOString();
    const keyframe: CameraKeyframe = {
      id: idGen(),
      slideId,
      sceneId: req.sceneId ?? null,
      orderIndex: req.orderIndex ?? 0,
      position: req.position,
      target: req.target,
      fov: req.fov,
      roll: req.roll ?? 0,
      easing: req.easing ?? DEFAULT_EASING,
      durationMs: req.durationMs ?? 0,
      trigger: req.trigger ?? 'auto',
      createdAt: now,
    };

    await repo.insert(keyframe);
    return c.json(keyframe, 201);
  });

  // -----------------------------------------------------------------------
  // GET /v1/camera_keyframes/:id — get a keyframe by ID
  // -----------------------------------------------------------------------
  app.get('/v1/camera_keyframes/:id', async (c) => {
    const id = c.req.param('id');
    try {
      const keyframe = await repo.findById(id);
      if (!keyframe) return c.json({ error: `Keyframe ${id} not found`, code: 'NOT_FOUND' }, 404);
      return c.json(keyframe);
    } catch (e) {
      if (e instanceof KeyframeNotFoundError) {
        return c.json({ error: e.message, code: e.code }, 404);
      }
      throw e;
    }
  });

  // -----------------------------------------------------------------------
  // PATCH /v1/camera_keyframes/:id — update a keyframe
  // -----------------------------------------------------------------------
  app.patch('/v1/camera_keyframes/:id', async (c) => {
    const id = c.req.param('id');
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'Invalid JSON body', code: 'INVALID_JSON' }, 400);
    }

    const validation = validatePatchKeyframe(body);
    if (!validation.valid) {
      return c.json(
        {
          error: `Validation failed: ${validation.errors.map((e) => e.message).join('; ')}`,
          code: 'VALIDATION_ERROR',
          details: validation.errors,
        },
        400,
      );
    }

    const patch = body as Record<string, unknown>;

    // Business-rule: easing monotonicity (if both p1x and p2x present)
    const easingPatch = patch.easing as { p1x?: number; p2x?: number } | undefined;
    if (easingPatch !== undefined && easingPatch.p1x !== undefined && easingPatch.p2x !== undefined) {
      const easingErrors = validateEasingMonotonicity({
        p1x: easingPatch.p1x,
        p2x: easingPatch.p2x,
      });
      if (easingErrors.length > 0) {
        return c.json(
          {
            error: easingErrors.map((e) => e.message).join('; '),
            code: easingErrors[0]!.code,
          },
          400,
        );
      }
    }

    try {
      const updated = await repo.update(id, patch as Parameters<CameraKeyframeRepository['update']>[1]);
      return c.json(updated);
    } catch (e) {
      if (e instanceof KeyframeNotFoundError) {
        return c.json({ error: e.message, code: e.code }, 404);
      }
      throw e;
    }
  });

  // -----------------------------------------------------------------------
  // DELETE /v1/camera_keyframes/:id — delete a keyframe
  // -----------------------------------------------------------------------
  app.delete('/v1/camera_keyframes/:id', async (c) => {
    const id = c.req.param('id');
    const deleted = await repo.delete(id);
    if (!deleted) {
      return c.json({ error: `Keyframe ${id} not found`, code: 'NOT_FOUND' }, 404);
    }
    return c.body(null, 204);
  });

  return app;
}
