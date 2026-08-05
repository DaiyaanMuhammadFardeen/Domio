/**
 * Phase 11 camera keyframe — batch LUT route.
 *
 *   POST /v1/camera-keyframes/batch
 *
 * Body: { keyframes: [...] }
 * Response: { lut: [...], total_duration_ms, sample_rate_hz }
 * Limit: 600 entries (10s at 60Hz) → 413 beyond.
 */

import { Hono } from 'hono';
import type { CameraKeyframe, LutEntry, BatchResponse } from '../types.js';
import { validateBatchBody, validateEasingMonotonicity } from '../schemas.js';
import { interpolatePose } from '../interpolator.js';
import { EasingLruCache } from '../easing-cache.js';

const SAMPLE_RATE_HZ = 60;
const MAX_LUT_ENTRIES = 600;

export function createBatchRoutes(cache?: EasingLruCache): Hono {
  const app = new Hono();
  const sharedCache = cache ?? new EasingLruCache(64);

  app.post('/v1/camera-keyframes/batch', async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'Invalid JSON body', code: 'INVALID_JSON' }, 400);
    }

    const validation = validateBatchBody(body);
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

    const req = body as { keyframes: CameraKeyframe[] };

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

    // Compute total duration
    let totalDurationMs = 0;
    for (const kf of sorted) {
      totalDurationMs += kf.durationMs;
    }

    // Compute number of LUT samples
    const lutEntries = Math.ceil((totalDurationMs / 1000) * SAMPLE_RATE_HZ) + 1;

    if (lutEntries > MAX_LUT_ENTRIES) {
      return c.json(
        { error: 'Keyframe timeline exceeds 600-frame LUT limit' },
        413,
      );
    }

    // Build LUT at 60Hz
    const lut: LutEntry[] = [];
    for (let i = 0; i < lutEntries; i++) {
      const timeMs = (i / SAMPLE_RATE_HZ) * 1000;
      const pose = interpolatePose(sorted, timeMs, sharedCache);
      lut.push({ time_ms: Math.round(timeMs * 1000) / 1000, pose });
    }

    const response: BatchResponse = {
      lut,
      total_duration_ms: totalDurationMs,
      sample_rate_hz: SAMPLE_RATE_HZ,
    };

    return c.json(response);
  });

  return app;
}
