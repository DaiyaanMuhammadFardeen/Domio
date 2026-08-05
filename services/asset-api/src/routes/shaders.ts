/**
 * Asset API — shader routes (Phase 11).
 *
 *   GET    /v1/shaders              listShaders      200
 *   POST   /v1/shaders              createShader     201/400
 *   GET    /v1/shaders/:id          getShader        200/404
 *   PUT    /v1/shaders/:id          updateShader     200/400/404
 *   DELETE /v1/shaders/:id          deleteShader     204/404
 *   POST   /v1/shaders/:id/publish  publishShader    200/404
 */

import { Hono } from 'hono';
import type { AssetService } from '../service.js';
import { ShaderValidationError } from '../service.js';
import { validateCreateShader, validateUpdateShader } from '../schemas.js';
import { ShaderNotFoundError } from '../dal.js';

export function shaderRoutes(service: AssetService): Hono {
  const app = new Hono();

  // ---- GET /v1/shaders ----
  app.get('/v1/shaders', async (c) => {
    const workspaceId = c.req.query('workspace_id');
    if (!workspaceId) {
      return c.json({ error: 'Missing required query param: workspace_id', code: 'VALIDATION_ERROR' }, 400);
    }
    const kind = c.req.query('kind') as 'background' | 'particle' | 'material' | 'post' | undefined;
    const shaders = await service.listShaders(workspaceId, kind);
    return c.json({ items: shaders });
  });

  // ---- POST /v1/shaders ----
  app.post('/v1/shaders', async (c) => {
    const body = await c.req.json();
    const validation = validateCreateShader(body);
    if (!validation.valid) {
      return c.json({
        error: `Validation failed: ${validation.errors.map(e => e.message).join('; ')}`,
        code: 'VALIDATION_ERROR',
        details: validation.errors,
      }, 400);
    }
    try {
      const shader = await service.createShader(body);
      return c.json(shader, 201);
    } catch (e) {
      if (e instanceof ShaderValidationError) {
        return c.json({ error: e.message, code: e.code }, 400);
      }
      throw e;
    }
  });

  // ---- GET /v1/shaders/:id ----
  app.get('/v1/shaders/:id', async (c) => {
    try {
      const shader = await service.getShader(c.req.param('id'));
      return c.json(shader);
    } catch (e) {
      if (e instanceof ShaderNotFoundError) return c.json({ error: e.message, code: 'NOT_FOUND' }, 404);
      throw e;
    }
  });

  // ---- PUT /v1/shaders/:id ----
  app.put('/v1/shaders/:id', async (c) => {
    const body = await c.req.json();
    const validation = validateUpdateShader(body);
    if (!validation.valid) {
      return c.json({
        error: `Validation failed: ${validation.errors.map(e => e.message).join('; ')}`,
        code: 'VALIDATION_ERROR',
        details: validation.errors,
      }, 400);
    }
    try {
      const shader = await service.updateShader(c.req.param('id'), body);
      return c.json(shader);
    } catch (e) {
      if (e instanceof ShaderNotFoundError) return c.json({ error: e.message, code: 'NOT_FOUND' }, 404);
      if (e instanceof ShaderValidationError) {
        return c.json({ error: e.message, code: e.code }, 400);
      }
      throw e;
    }
  });

  // ---- DELETE /v1/shaders/:id ----
  app.delete('/v1/shaders/:id', async (c) => {
    try {
      await service.deleteShader(c.req.param('id'));
      return c.body(null, 204);
    } catch (e) {
      if (e instanceof ShaderNotFoundError) return c.json({ error: e.message, code: 'NOT_FOUND' }, 404);
      throw e;
    }
  });

  // ---- POST /v1/shaders/:id/publish ----
  app.post('/v1/shaders/:id/publish', async (c) => {
    try {
      const shader = await service.publishShader(c.req.param('id'));
      return c.json(shader);
    } catch (e) {
      if (e instanceof ShaderNotFoundError) return c.json({ error: e.message, code: 'NOT_FOUND' }, 404);
      throw e;
    }
  });

  return app;
}
