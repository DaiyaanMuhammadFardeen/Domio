/**
 * Asset API — video routes (Phase 11, M7.2).
 *
 *   GET    /v1/video              listVideoAssets      200
 *   POST   /v1/video              createVideoAsset     201/400
 *   GET    /v1/video/:id          getVideoAsset        200/404
 *   PATCH  /v1/video/:id          patchVideoAsset      200/400/404
 *   DELETE /v1/video/:id          deleteVideoAsset     204/404
 *   POST   /v1/video/upload       processVideoUpload   201/400
 */

import { Hono } from 'hono';
import type { AssetService } from '../service.js';
import { validateCreateVideoAsset, validatePatchVideoAsset } from '../schemas.js';
import { VideoAssetNotFoundError } from '../dal.js';

export function videoRoutes(service: AssetService): Hono {
  const app = new Hono();

  // ---- GET /v1/video ----
  app.get('/v1/video', async (c) => {
    const workspaceId = c.req.query('workspace_id');
    if (!workspaceId) {
      return c.json(
        { error: 'Missing required query param: workspace_id', code: 'VALIDATION_ERROR' },
        400,
      );
    }
    const items = await service.listVideoAssets(workspaceId);
    return c.json({ items });
  });

  // ---- POST /v1/video ----
  app.post('/v1/video', async (c) => {
    const body = await c.req.json();
    const validation = validateCreateVideoAsset(body);
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
    const video = await service.createVideoAsset(body);
    return c.json(video, 201);
  });

  // ---- GET /v1/video/:id ----
  app.get('/v1/video/:id', async (c) => {
    try {
      const video = await service.getVideoAsset(c.req.param('id'));
      return c.json(video);
    } catch (e) {
      if (e instanceof VideoAssetNotFoundError)
        return c.json({ error: e.message, code: 'NOT_FOUND' }, 404);
      throw e;
    }
  });

  // ---- PATCH /v1/video/:id ----
  app.patch('/v1/video/:id', async (c) => {
    const body = await c.req.json();
    const validation = validatePatchVideoAsset(body);
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
      const video = await service.patchVideoAsset(c.req.param('id'), body);
      return c.json(video);
    } catch (e) {
      if (e instanceof VideoAssetNotFoundError)
        return c.json({ error: e.message, code: 'NOT_FOUND' }, 404);
      throw e;
    }
  });

  // ---- DELETE /v1/video/:id ----
  app.delete('/v1/video/:id', async (c) => {
    try {
      await service.deleteVideoAsset(c.req.param('id'));
      return c.body(null, 204);
    } catch (e) {
      if (e instanceof VideoAssetNotFoundError)
        return c.json({ error: e.message, code: 'NOT_FOUND' }, 404);
      throw e;
    }
  });

  // ---- POST /v1/video/upload ----
  app.post('/v1/video/upload', async (c) => {
    const body = await c.req.json();
    const workspaceId = body['workspaceId'];
    const format = body['format'];
    if (typeof workspaceId !== 'string' || typeof format !== 'string') {
      return c.json(
        { error: 'workspaceId and format are required', code: 'VALIDATION_ERROR' },
        400,
      );
    }
    const contents = body['buffer'];
    let buffer: ArrayBuffer;
    if (typeof contents === 'string') {
      const binary = atob(contents);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      buffer = bytes.buffer;
    } else if (Array.isArray(contents)) {
      buffer = new Uint8Array(contents as number[]).buffer;
    } else {
      return c.json(
        { error: 'buffer (base64 or byte array) is required', code: 'VALIDATION_ERROR' },
        400,
      );
    }
    const result = await service.processVideoUpload({
      buffer,
      format,
      workspaceId,
      ...(typeof body['name'] === 'string' ? { name: body['name'] as string } : {}),
      ...(typeof body['licenseId'] === 'string' ? { licenseId: body['licenseId'] as string } : {}),
      ...(typeof body['uploaderId'] === 'string'
        ? { uploaderId: body['uploaderId'] as string }
        : {}),
    });
    if (result.rejected) {
      return c.json(result, 400);
    }
    return c.json(result, 201);
  });

  return app;
}
