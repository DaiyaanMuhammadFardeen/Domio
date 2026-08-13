/**
 * Shader Registry — REST routes (Phase 11).
 *
 * CRUD + publish endpoints for shader management.
 * Uses Hono for routing with app.request() test pattern.
 *
 * Endpoints:
 *   GET    /v1/shaders?workspace_id=X[&kind=Y]
 *   POST   /v1/shaders
 *   GET    /v1/shaders/:id
 *   PUT    /v1/shaders/:id
 *   DELETE /v1/shaders/:id
 *   POST   /v1/shaders/:id/publish
 */

import { Hono } from 'hono';
import type { Shader, ShaderKind, ShaderRepository } from '../repo.js';
import { ShaderNotFoundError } from '../repo.js';
import {
  validateCreateShader,
  validateUpdateShader,
  containsHostAccess,
  detectExtensions,
} from '../schemas.js';
import { buildShader, type BuildDeps } from '../build.js';

// ---------------------------------------------------------------------------
// Dependencies (injectable for tests)
// ---------------------------------------------------------------------------

export interface ShaderDeps {
  readonly repo: ShaderRepository;
  readonly idGenerator?: () => string;
  readonly clock?: () => Date;
  readonly build?: BuildDeps;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const defaultId = (): string => {
  const chars = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // Crockford base32
  let out = '';
  for (let i = 0; i < 26; i++) out += chars[Math.floor(Math.random() * 32)]!;
  return out;
};

const defaultClock = (): Date => new Date();

const HOST_ACCESS_MSG = 'Host-environment access is not allowed in shaders';

// ---------------------------------------------------------------------------
// Route builder
// ---------------------------------------------------------------------------

export function createShaderRoutes(deps: ShaderDeps): Hono {
  const app = new Hono();
  const { repo } = deps;
  const idGen = deps.idGenerator ?? defaultId;
  const clock = deps.clock ?? defaultClock;

  // GET /v1/shaders
  app.get('/v1/shaders', async (c) => {
    const workspaceId = c.req.query('workspace_id');
    if (!workspaceId) {
      return c.json({ error: 'workspace_id is required', code: 'VALIDATION_ERROR' }, 400);
    }
    const kind = c.req.query('kind') as ShaderKind | undefined;
    const items = await repo.listByWorkspace(workspaceId, kind);
    return c.json({ items });
  });

  // POST /v1/shaders
  app.post('/v1/shaders', async (c) => {
    const body = await c.req.json();
    const validation = validateCreateShader(body);
    if (!validation.valid) {
      return c.json(
        {
          error: `Validation failed: ${validation.errors.map((e) => e.message).join('; ')}`,
          code: 'VALIDATION_ERROR',
        },
        400,
      );
    }

    const data = body as {
      name: string;
      kind: ShaderKind;
      sourceWgsl: string;
      sourceGlsl: string;
      inputs?: Record<string, { type: string; default?: unknown; description?: string }>;
    };

    // Host-environment access check
    if (containsHostAccess(data.sourceWgsl) || containsHostAccess(data.sourceGlsl)) {
      return c.json({ error: HOST_ACCESS_MSG }, 400);
    }

    // WGSL source required for background/particle
    if ((data.kind === 'background' || data.kind === 'particle') && !data.sourceWgsl) {
      return c.json({ error: 'WGSL source required for kind ' + data.kind }, 400);
    }

    const now = clock();
    const record: Shader = {
      id: idGen(),
      workspaceId: c.req.query('workspace_id') ?? body.workspaceId ?? '',
      authorId: body.authorId ?? '',
      name: data.name,
      kind: data.kind,
      sourceWgsl: data.sourceWgsl,
      sourceGlsl: data.sourceGlsl,
      inputs: data.inputs ?? {},
      published: false,
      createdAt: now.toISOString(),
    };

    await repo.insert(record);
    return c.json(record, 201);
  });

  // GET /v1/shaders/:id
  app.get('/v1/shaders/:id', async (c) => {
    const id = c.req.param('id');
    const workspaceId = c.req.query('workspace_id') ?? '';
    try {
      const shader = await repo.findById(id, workspaceId);
      if (!shader) {
        return c.json({ error: 'Shader not found', code: 'NOT_FOUND' }, 404);
      }
      return c.json(shader);
    } catch (e) {
      if (e instanceof ShaderNotFoundError) {
        return c.json({ error: e.message, code: e.code }, 404);
      }
      throw e;
    }
  });

  // PUT /v1/shaders/:id
  app.put('/v1/shaders/:id', async (c) => {
    const id = c.req.param('id');
    const workspaceId = c.req.query('workspace_id') ?? '';
    const body = await c.req.json();
    const validation = validateUpdateShader(body);
    if (!validation.valid) {
      return c.json(
        {
          error: `Validation failed: ${validation.errors.map((e) => e.message).join('; ')}`,
          code: 'VALIDATION_ERROR',
        },
        400,
      );
    }

    const data = body as {
      name?: string;
      sourceWgsl?: string;
      sourceGlsl?: string;
      inputs?: Record<string, { type: string; default?: unknown; description?: string }>;
    };

    // Host-environment access check on provided sources
    if (data.sourceWgsl && containsHostAccess(data.sourceWgsl)) {
      return c.json({ error: HOST_ACCESS_MSG }, 400);
    }
    if (data.sourceGlsl && containsHostAccess(data.sourceGlsl)) {
      return c.json({ error: HOST_ACCESS_MSG }, 400);
    }

    try {
      const updated = await repo.update(id, workspaceId, data);
      return c.json(updated);
    } catch (e) {
      if (e instanceof ShaderNotFoundError) {
        return c.json({ error: e.message, code: e.code }, 404);
      }
      throw e;
    }
  });

  // DELETE /v1/shaders/:id
  app.delete('/v1/shaders/:id', async (c) => {
    const id = c.req.param('id');
    const workspaceId = c.req.query('workspace_id') ?? '';
    const deleted = await repo.delete(id, workspaceId);
    if (!deleted) {
      return c.json({ error: 'Shader not found', code: 'NOT_FOUND' }, 404);
    }
    return c.body(null, 204);
  });

  // POST /v1/shaders/:id/publish
  app.post('/v1/shaders/:id/publish', async (c) => {
    const id = c.req.param('id');
    const workspaceId = c.req.query('workspace_id') ?? '';

    try {
      const shader = await repo.findById(id, workspaceId);
      if (!shader) {
        return c.json({ error: 'Shader not found', code: 'NOT_FOUND' }, 404);
      }

      // WGSL source required for background/particle
      if ((shader.kind === 'background' || shader.kind === 'particle') && !shader.sourceWgsl) {
        return c.json({ error: 'WGSL source required for kind ' + shader.kind }, 400);
      }

      // Host-environment access check
      if (containsHostAccess(shader.sourceWgsl) || containsHostAccess(shader.sourceGlsl)) {
        return c.json({ error: HOST_ACCESS_MSG }, 400);
      }

      // Build (compile attempt)
      const buildResult = buildShader(shader, deps.build);

      if (!buildResult.compiled) {
        return c.json(
          {
            compiled: false,
            error: buildResult.error,
            fallback: buildResult.fallback,
          },
          400,
        );
      }

      // Extension detection
      const combinedSource = shader.sourceWgsl + '\n' + shader.sourceGlsl;
      const extDetection = detectExtensions(combinedSource);

      // Mark as published
      const published = await repo.update(id, workspaceId, { published: true });

      const response: Record<string, unknown> = {
        ...published,
        programKey: buildResult.programKey,
      };

      // Banner for unsupported extensions
      if (extDetection.unsupported.length > 0) {
        response.banner = `This shader requires ${extDetection.unsupported.join(', ')}, not available here`;
      }

      return c.json(response);
    } catch (e) {
      if (e instanceof ShaderNotFoundError) {
        return c.json({ error: e.message, code: e.code }, 404);
      }
      throw e;
    }
  });

  return app;
}
