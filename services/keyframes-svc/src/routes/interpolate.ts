/**
 * Phase 11 camera keyframe — interpolation route.
 *
 *   POST /v1/camera-keyframes/interpolate
 *
 * Body: { keyframes: [...], time_ms }
 * Response: { pose: { position, target, fov, roll }, crossfade?: true }
 */

import { Hono } from 'hono';
import type { CameraKeyframe } from '../types.js';
import { validateInterpolateBody, validateEasingMonotonicity } from '../schemas.js';
import { interpolatePose, checkCrossfade } from '../interpolator.js';
import { EasingLruCache } from '../easing-cache.js';

export function createInterpolateRoutes(cache?: EasingLruCache): Hono {
  const app = new Hono();
  const sharedCache = cache ?? new EasingLruCache(64);

  app.post('/v1/camera-keyframes/interpolate', async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'Invalid JSON body', code: 'INVALID_JSON' }, 400);
    }

    const validation = validateInterpolateBody(body);
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

    const req = body as { keyframes: CameraKeyframe[]; time_ms: number };

    // Validate easing monotonicity on all keyframes
    for (const kf of req.keyframes) {
      const easingErrors = validateEasingMonotonicity(kf.easing);
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

    // Sort by orderIndex
    const sorted = [...req.keyframes].sort((a, b) => a.orderIndex - b.orderIndex);

    const pose = interpolatePose(sorted, req.time_ms, sharedCache);
    const crossfade = checkCrossfade(sorted);

    return c.json(
      crossfade ? { pose, crossfade: true } : { pose },
    );
  });

  return app;
}
