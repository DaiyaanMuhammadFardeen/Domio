/**
 * @domio/shader-registry — Phase 11 shader registry service.
 *
 * REST backend for shader CRUD (WGSL/GLSL), publish workflow,
 * build chain with deterministic fallback, and extension detection.
 *
 * Public surface:
 *
 *  - {@link createShaderRoutes} — Hono route group for shader endpoints.
 *  - {@link createApp} — creates a fully configured Hono app.
 *  - In-memory repository for tests + dev fallback.
 *  - Build chain with injectable compiler.
 */

export * from './repo.js';
export * from './build.js';
export * from './schemas.js';
export * from './routes/shaders.js';

import { Hono } from 'hono';
import { createShaderRoutes, type ShaderDeps } from './routes/shaders.js';
import { InMemoryShaderRepository } from './repo.js';
import type { BuildDeps } from './build.js';

// ---------------------------------------------------------------------------
// createApp — factory for a fully-configured Hono app
// ---------------------------------------------------------------------------

export interface CreateAppDeps {
  readonly repo?: ShaderDeps['repo'];
  readonly idGenerator?: ShaderDeps['idGenerator'];
  readonly clock?: ShaderDeps['clock'];
  readonly build?: BuildDeps;
}

export function createApp(deps?: CreateAppDeps): Hono {
  const app = new Hono();
  const repo = deps?.repo ?? new InMemoryShaderRepository();

  const shaderRoutes = createShaderRoutes({
    repo,
    ...(deps?.idGenerator !== undefined ? { idGenerator: deps.idGenerator } : {}),
    ...(deps?.clock !== undefined ? { clock: deps.clock } : {}),
    ...(deps?.build !== undefined ? { build: deps.build } : {}),
  });

  app.route('/', shaderRoutes);
  return app;
}
