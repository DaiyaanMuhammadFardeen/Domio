/**
 * Asset API — model routes (Phase 11).
 *
 *   POST   /v1/models/upload     uploadModel     multipart upload → 202
 *   GET    /v1/models            listModels      200
 *   GET    /v1/models/:id        getModel        200/404
 *   PATCH  /v1/models/:id        patchModel      200/400/404
 *   DELETE /v1/models/:id        deleteModel     204/404
 */

import { Hono } from 'hono';
import type { AssetService } from '../service.js';
import {
  validatePatchModel,
} from '../schemas.js';
import { ModelNotFoundError } from '../dal.js';

export function modelRoutes(service: AssetService): Hono {
  const app = new Hono();

  // ---- POST /v1/models/upload ----
  app.post('/v1/models/upload', async (c) => {
    try {
      const formData = await c.req.formData();
      const file = formData.get('file');
      const workspaceId = formData.get('workspaceId');
      const name = formData.get('name');
      const licenseId = formData.get('licenseId');

      if (!file || !(file instanceof File)) {
        return c.json({ error: 'Missing required field: file', code: 'VALIDATION_ERROR' }, 400);
      }
      if (!workspaceId || typeof workspaceId !== 'string') {
        return c.json({ error: 'Missing required field: workspaceId', code: 'VALIDATION_ERROR' }, 400);
      }

      // Detect format from filename
      const fileName = file.name || 'upload.bin';
      const ext = fileName.split('.').pop()?.toLowerCase() ?? 'bin';
      const validFormats = ['glb', 'gltf', 'usdz', 'step', 'stp', 'iges', 'igs', 'fbx', 'obj'];
      if (!validFormats.includes(ext)) {
        return c.json({ error: `Unsupported format: ${ext}. Supported: ${validFormats.join(', ')}`, code: 'INVALID_FORMAT' }, 400);
      }

      const buffer = await file.arrayBuffer();
      const result = await service.processUpload({
        buffer,
        format: ext,
        workspaceId,
        ...(name && typeof name === 'string' ? { name } : {}),
        ...(licenseId && typeof licenseId === 'string' ? { licenseId } : {}),
      });

      if (result.rejected) {
        return c.json({ error: result.rejectionReason ?? 'Upload rejected', code: 'UPLOAD_REJECTED' }, 413);
      }

      return c.json({
        modelAssetId: result.modelAssetId,
        statusUrl: `/v1/models/${result.modelAssetId}/status`,
        formatDetected: result.formatDetected,
        polyCount: result.polyCount,
        textureCount: result.textureCount,
        hasAnimations: result.hasAnimations,
        warnings: result.warnings,
      }, 202);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Upload failed';
      return c.json({ error: msg, code: 'UPLOAD_ERROR' }, 400);
    }
  });

  // ---- GET /v1/models ----
  app.get('/v1/models', async (c) => {
    const workspaceId = c.req.query('workspace_id');
    if (!workspaceId) {
      return c.json({ error: 'Missing required query param: workspace_id', code: 'VALIDATION_ERROR' }, 400);
    }
    const models = await service.listModels(workspaceId);
    return c.json({ items: models, total: models.length });
  });

  // ---- GET /v1/models/:id ----
  app.get('/v1/models/:id', async (c) => {
    try {
      const model = await service.getModel(c.req.param('id'));
      return c.json(model);
    } catch (e) {
      if (e instanceof ModelNotFoundError) return c.json({ error: e.message, code: 'NOT_FOUND' }, 404);
      throw e;
    }
  });

  // ---- PATCH /v1/models/:id ----
  app.patch('/v1/models/:id', async (c) => {
    const body = await c.req.json();
    const validation = validatePatchModel(body);
    if (!validation.valid) {
      return c.json({
        error: `Validation failed: ${validation.errors.map(e => e.message).join('; ')}`,
        code: 'VALIDATION_ERROR',
        details: validation.errors,
      }, 400);
    }
    try {
      const model = await service.patchModel(c.req.param('id'), body);
      return c.json(model);
    } catch (e) {
      if (e instanceof ModelNotFoundError) return c.json({ error: e.message, code: 'NOT_FOUND' }, 404);
      throw e;
    }
  });

  // ---- DELETE /v1/models/:id ----
  app.delete('/v1/models/:id', async (c) => {
    try {
      await service.deleteModel(c.req.param('id'));
      return c.body(null, 204);
    } catch (e) {
      if (e instanceof ModelNotFoundError) return c.json({ error: e.message, code: 'NOT_FOUND' }, 404);
      throw e;
    }
  });

  return app;
}
