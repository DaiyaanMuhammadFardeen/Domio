/**
 * Phase 11 camera keyframe — app factory.
 *
 * createApp(deps) wires all routes, injectable repo, and id generator.
 * Default: in-memory repo, ULID-ish id generator.
 */

import { Hono } from 'hono';
import type { CameraKeyframeRepository } from './repo.js';
import { InMemoryCameraKeyframeRepository, defaultIdGenerator } from './repo.js';
import { EasingLruCache } from './easing-cache.js';
import { createKeyframeRoutes } from './routes/keyframes.js';
import { createInterpolateRoutes } from './routes/interpolate.js';
import { createBatchRoutes } from './routes/batch.js';

export interface AppDeps {
  readonly repo?: CameraKeyframeRepository;
  readonly idGenerator?: () => string;
  readonly easingCache?: EasingLruCache;
}

/**
 * Create a Hono app for the Phase 11 camera keyframe service.
 *
 * @param deps - Injectable dependencies (repo, id generator, easing cache).
 *               All default to in-memory implementations.
 */
export function createApp(deps?: AppDeps): Hono {
  const repo = deps?.repo ?? new InMemoryCameraKeyframeRepository();
  const idGen = deps?.idGenerator ?? defaultIdGenerator;
  const cache = deps?.easingCache ?? new EasingLruCache(64);

  const app = new Hono();

  // Mount CRUD routes (handles /v1/slides/... and /v1/camera_keyframes/...)
  app.route('/', createKeyframeRoutes(repo, idGen));

  // Mount interpolation route (/v1/camera-keyframes/interpolate)
  app.route('/', createInterpolateRoutes(cache));

  // Mount batch route (/v1/camera-keyframes/batch)
  app.route('/', createBatchRoutes(cache));

  return app;
}
