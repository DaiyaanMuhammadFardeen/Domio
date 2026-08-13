/**
 * Asset API — license routes (Phase 11).
 *
 *   GET    /v1/licenses           listLicenses     200
 *   POST   /v1/licenses           createLicense    201/400
 *   GET    /v1/licenses/:id       getLicense       200/404
 *   PATCH  /v1/licenses/:id       patchLicense     200/400/404
 *   DELETE /v1/licenses/:id       deleteLicense    204/400/404
 */

import { Hono } from 'hono';
import type { AssetService } from '../service.js';
import { validateCreateLicense, validatePatchLicense } from '../schemas.js';
import { LicenseNotFoundError, LicenseReferencedError } from '../dal.js';

export function licenseRoutes(service: AssetService): Hono {
  const app = new Hono();

  // ---- GET /v1/licenses ----
  app.get('/v1/licenses', async (c) => {
    const workspaceId = c.req.query('workspace_id');
    if (!workspaceId) {
      return c.json(
        { error: 'Missing required query param: workspace_id', code: 'VALIDATION_ERROR' },
        400,
      );
    }
    const licenses = await service.listLicenses(workspaceId);
    return c.json({ items: licenses });
  });

  // ---- POST /v1/licenses ----
  app.post('/v1/licenses', async (c) => {
    const body = await c.req.json();
    const validation = validateCreateLicense(body);
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
    const license = await service.createLicense(body);
    return c.json(license, 201);
  });

  // ---- GET /v1/licenses/:id ----
  app.get('/v1/licenses/:id', async (c) => {
    try {
      const license = await service.getLicense(c.req.param('id'));
      return c.json(license);
    } catch (e) {
      if (e instanceof LicenseNotFoundError)
        return c.json({ error: e.message, code: 'NOT_FOUND' }, 404);
      throw e;
    }
  });

  // ---- PATCH /v1/licenses/:id ----
  app.patch('/v1/licenses/:id', async (c) => {
    const body = await c.req.json();
    const validation = validatePatchLicense(body);
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
      const license = await service.patchLicense(c.req.param('id'), body);
      return c.json(license);
    } catch (e) {
      if (e instanceof LicenseNotFoundError)
        return c.json({ error: e.message, code: 'NOT_FOUND' }, 404);
      throw e;
    }
  });

  // ---- DELETE /v1/licenses/:id ----
  app.delete('/v1/licenses/:id', async (c) => {
    try {
      await service.deleteLicense(c.req.param('id'));
      return c.body(null, 204);
    } catch (e) {
      if (e instanceof LicenseNotFoundError)
        return c.json({ error: e.message, code: 'NOT_FOUND' }, 404);
      if (e instanceof LicenseReferencedError) {
        return c.json({ error: e.message, code: 'LICENSE_REFERENCED' }, 400);
      }
      throw e;
    }
  });

  return app;
}
