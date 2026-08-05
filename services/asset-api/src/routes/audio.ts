/**
 * Asset API — audio routes (Phase 11, M7.1).
 *
 *   GET    /v1/audio              listAudioAssets   200
 *   POST   /v1/audio              createAudioAsset  201/400
 *   GET    /v1/audio/:id          getAudioAsset     200/404
 *   PATCH  /v1/audio/:id          patchAudioAsset   200/400/404
 *   DELETE /v1/audio/:id          deleteAudioAsset  204/404
 *   POST   /v1/audio/upload       processAudioUpload 201/400
 */

import { Hono } from 'hono';
import type { AssetService } from '../service.js';
import { validateCreateAudioAsset, validatePatchAudioAsset } from '../schemas.js';
import { AudioAssetNotFoundError } from '../dal.js';

export function audioRoutes(service: AssetService): Hono {
  const app = new Hono();

  // ---- GET /v1/audio ----
  app.get('/v1/audio', async (c) => {
    const workspaceId = c.req.query('workspace_id');
    if (!workspaceId) {
      return c.json({ error: 'Missing required query param: workspace_id', code: 'VALIDATION_ERROR' }, 400);
    }
    const items = await service.listAudioAssets(workspaceId);
    return c.json({ items });
  });

  // ---- POST /v1/audio ----
  app.post('/v1/audio', async (c) => {
    const body = await c.req.json();
    const validation = validateCreateAudioAsset(body);
    if (!validation.valid) {
      return c.json({
        error: `Validation failed: ${validation.errors.map(e => e.message).join('; ')}`,
        code: 'VALIDATION_ERROR',
        details: validation.errors,
      }, 400);
    }
    const audio = await service.createAudioAsset(body);
    return c.json(audio, 201);
  });

  // ---- GET /v1/audio/:id ----
  app.get('/v1/audio/:id', async (c) => {
    try {
      const audio = await service.getAudioAsset(c.req.param('id'));
      return c.json(audio);
    } catch (e) {
      if (e instanceof AudioAssetNotFoundError) return c.json({ error: e.message, code: 'NOT_FOUND' }, 404);
      throw e;
    }
  });

  // ---- PATCH /v1/audio/:id ----
  app.patch('/v1/audio/:id', async (c) => {
    const body = await c.req.json();
    const validation = validatePatchAudioAsset(body);
    if (!validation.valid) {
      return c.json({
        error: `Validation failed: ${validation.errors.map(e => e.message).join('; ')}`,
        code: 'VALIDATION_ERROR',
        details: validation.errors,
      }, 400);
    }
    try {
      const audio = await service.patchAudioAsset(c.req.param('id'), body);
      return c.json(audio);
    } catch (e) {
      if (e instanceof AudioAssetNotFoundError) return c.json({ error: e.message, code: 'NOT_FOUND' }, 404);
      throw e;
    }
  });

  // ---- DELETE /v1/audio/:id ----
  app.delete('/v1/audio/:id', async (c) => {
    try {
      await service.deleteAudioAsset(c.req.param('id'));
      return c.body(null, 204);
    } catch (e) {
      if (e instanceof AudioAssetNotFoundError) return c.json({ error: e.message, code: 'NOT_FOUND' }, 404);
      throw e;
    }
  });

  // ---- POST /v1/audio/upload ----
  app.post('/v1/audio/upload', async (c) => {
    const body = await c.req.json();
    const workspaceId = body['workspaceId'];
    const format = body['format'];
    if (typeof workspaceId !== 'string' || typeof format !== 'string') {
      return c.json({ error: 'workspaceId and format are required', code: 'VALIDATION_ERROR' }, 400);
    }
    // body.contents is expected to be a base64 string OR { buffer: number[] }
    const contents = body['buffer'];
    let buffer: ArrayBuffer;
    if (typeof contents === 'string') {
      // base64 decode
      const binary = atob(contents);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      buffer = bytes.buffer;
    } else if (Array.isArray(contents)) {
      buffer = new Uint8Array(contents as number[]).buffer;
    } else {
      return c.json({ error: 'buffer (base64 or byte array) is required', code: 'VALIDATION_ERROR' }, 400);
    }
    const result = await service.processAudioUpload({
      buffer,
      format,
      workspaceId,
      ...(typeof body['name'] === 'string' ? { name: body['name'] as string } : {}),
      ...(typeof body['licenseId'] === 'string' ? { licenseId: body['licenseId'] as string } : {}),
      ...(typeof body['uploaderId'] === 'string' ? { uploaderId: body['uploaderId'] as string } : {}),
    });
    if (result.rejected) {
      return c.json(result, 400);
    }
    return c.json(result, 201);
  });

  return app;
}
