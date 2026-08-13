/**
 * Asset API — camera keyframe routes (Phase 11).
 *
 *   GET    /v1/slides/:slideId/camera_keyframes  listKeyframes  200
 *   POST   /v1/slides/:slideId/camera_keyframes  createKeyframe 201/400
 *   GET    /v1/camera_keyframes/:id               getKeyframe    200/404
 *   PATCH  /v1/camera_keyframes/:id               patchKeyframe  200/400/404
 *   DELETE /v1/camera_keyframes/:id               deleteKeyframe 204/404
 */

import { Hono } from 'hono';
import type { AssetService } from '../service.js';
import { validateCreateCameraKeyframe, validatePatchCameraKeyframe } from '../schemas.js';
import { CameraKeyframeNotFoundError } from '../dal.js';

// ---------------------------------------------------------------------------
// Easing validation: monotonicity check for cubic bezier
// ---------------------------------------------------------------------------

function validateEasing(easing: {
  p1x: number;
  p1y: number;
  p2x: number;
  p2y: number;
}): string | null {
  if (easing.p1x > easing.p2x) {
    return `Non-monotonic easing: p1x (${easing.p1x}) must be <= p2x (${easing.p2x})`;
  }
  if (easing.p1x < 0 || easing.p1x > 1) return `p1x must be in [0,1], got ${easing.p1x}`;
  if (easing.p2x < 0 || easing.p2x > 1) return `p2x must be in [0,1], got ${easing.p2x}`;
  return null;
}

export function cameraKeyframeRoutes(service: AssetService): Hono {
  const app = new Hono();

  // ---- GET /v1/slides/:slideId/camera_keyframes ----
  app.get('/v1/slides/:slideId/camera_keyframes', async (c) => {
    const keyframes = await service.listCameraKeyframes(c.req.param('slideId'));
    return c.json({ items: keyframes });
  });

  // ---- POST /v1/slides/:slideId/camera_keyframes ----
  app.post('/v1/slides/:slideId/camera_keyframes', async (c) => {
    const body = await c.req.json();
    const validation = validateCreateCameraKeyframe(body);
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

    // Easing monotonicity check
    if (body.easing) {
      const easingErr = validateEasing(body.easing);
      if (easingErr) {
        return c.json({ error: easingErr, code: 'EASING_VALIDATION_REJECTED' }, 400);
      }
    }

    const keyframe = await service.createCameraKeyframe(c.req.param('slideId'), body);
    return c.json(keyframe, 201);
  });

  // ---- GET /v1/camera_keyframes/:id ----
  app.get('/v1/camera_keyframes/:id', async (c) => {
    try {
      const keyframe = await service.getCameraKeyframe(c.req.param('id'));
      return c.json(keyframe);
    } catch (e) {
      if (e instanceof CameraKeyframeNotFoundError)
        return c.json({ error: e.message, code: 'NOT_FOUND' }, 404);
      throw e;
    }
  });

  // ---- PATCH /v1/camera_keyframes/:id ----
  app.patch('/v1/camera_keyframes/:id', async (c) => {
    const body = await c.req.json();
    const validation = validatePatchCameraKeyframe(body);
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

    if (body.easing) {
      const easingErr = validateEasing(body.easing);
      if (easingErr) {
        return c.json({ error: easingErr, code: 'EASING_VALIDATION_REJECTED' }, 400);
      }
    }

    try {
      const keyframe = await service.patchCameraKeyframe(c.req.param('id'), body);
      return c.json(keyframe);
    } catch (e) {
      if (e instanceof CameraKeyframeNotFoundError)
        return c.json({ error: e.message, code: 'NOT_FOUND' }, 404);
      throw e;
    }
  });

  // ---- DELETE /v1/camera_keyframes/:id ----
  app.delete('/v1/camera_keyframes/:id', async (c) => {
    try {
      await service.deleteCameraKeyframe(c.req.param('id'));
      return c.body(null, 204);
    } catch (e) {
      if (e instanceof CameraKeyframeNotFoundError)
        return c.json({ error: e.message, code: 'NOT_FOUND' }, 404);
      throw e;
    }
  });

  return app;
}
