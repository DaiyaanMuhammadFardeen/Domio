/**
 * Asset API — scene routes (Phase 11).
 *
 *   GET    /v1/scenes            listScenes     200
 *   POST   /v1/scenes            createScene    201/400
 *   GET    /v1/scenes/:id        getScene       200/404
 *   PATCH  /v1/scenes/:id        patchScene     200/400/404
 *   DELETE /v1/scenes/:id        deleteScene    204/404
 */

import { Hono } from 'hono';
import type { AssetService } from '../service.js';
import { validateCreateScene, validatePatchScene } from '../schemas.js';
import { SceneNotFoundError } from '../dal.js';

export function sceneRoutes(service: AssetService): Hono {
  const app = new Hono();

  // ---- GET /v1/scenes ----
  app.get('/v1/scenes', async (c) => {
    const workspaceId = c.req.query('workspace_id');
    if (!workspaceId) {
      return c.json(
        { error: 'Missing required query param: workspace_id', code: 'VALIDATION_ERROR' },
        400,
      );
    }
    const modelAssetId = c.req.query('model_asset_id');
    const scenes = await service.listScenes(workspaceId, modelAssetId ?? undefined);
    return c.json({ items: scenes, total: scenes.length });
  });

  // ---- POST /v1/scenes ----
  app.post('/v1/scenes', async (c) => {
    const body = await c.req.json();
    const validation = validateCreateScene(body);
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
    const scene = await service.createScene(body);
    const warnings = (scene as unknown as { _warnings?: string[] })._warnings;
    const response: Record<string, unknown> = { ...scene };
    delete response._warnings;
    if (warnings) {
      response._warnings = warnings;
    }
    return c.json(response, 201);
  });

  // ---- GET /v1/scenes/:id ----
  app.get('/v1/scenes/:id', async (c) => {
    try {
      const scene = await service.getScene(c.req.param('id'));
      return c.json(scene);
    } catch (e) {
      if (e instanceof SceneNotFoundError)
        return c.json({ error: e.message, code: 'NOT_FOUND' }, 404);
      throw e;
    }
  });

  // ---- PATCH /v1/scenes/:id ----
  app.patch('/v1/scenes/:id', async (c) => {
    const body = await c.req.json();
    const validation = validatePatchScene(body);
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
    try {
      const scene = await service.patchScene(c.req.param('id'), body);
      return c.json(scene);
    } catch (e) {
      if (e instanceof SceneNotFoundError)
        return c.json({ error: e.message, code: 'NOT_FOUND' }, 404);
      throw e;
    }
  });

  // ---- DELETE /v1/scenes/:id ----
  app.delete('/v1/scenes/:id', async (c) => {
    try {
      await service.deleteScene(c.req.param('id'));
      return c.body(null, 204);
    } catch (e) {
      if (e instanceof SceneNotFoundError)
        return c.json({ error: e.message, code: 'NOT_FOUND' }, 404);
      throw e;
    }
  });

  return app;
}
