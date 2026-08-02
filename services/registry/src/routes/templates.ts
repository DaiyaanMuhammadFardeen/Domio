/**
 * Template routes — install, guided order, section insert, brand lock, preview.
 *
 *   POST /v1/templates/install
 *   GET  /v1/templates/:templateId/guided-order
 *   POST /v1/templates/sections/insert
 *   POST /v1/templates/locks/validate
 *   GET  /v1/templates/:templateId/preview
 */

import { Hono } from 'hono';
import type { ServiceDeps } from '../deps.js';
import { Errors } from '../errors.js';
import { installTemplate, guidedOrder } from '../templates/engine.js';
import { enforceBrandLock } from '../templates/lock-enforcement.js';
import { run as renderPreview } from '../workers/template-preview-renderer.js';

export function templatesRoutes(deps: ServiceDeps): Hono {
  const app = new Hono();

  // ---- POST /v1/templates/install ----
  app.post('/v1/templates/install', async (c) => {
    const tenantId = c.req.header('x-tenant-id') ?? 'default';
    const userId = c.req.header('x-user-id') ?? 'anonymous';

    const body = await c.req.json();
    const result = await installTemplate(deps, {
      templateId: body.templateId,
      workspaceId: tenantId,
      userId,
      values: body.values ?? {},
    });
    return c.json({ deck: result.deck, manifest: result.manifest });
  });

  // ---- GET /v1/templates/:templateId/guided-order ----
  app.get('/v1/templates/:templateId/guided-order', async (c) => {
    const templateId = c.req.param('templateId');
    const order = await guidedOrder(deps, templateId);
    return c.json({ placeholders: order });
  });

  // ---- POST /v1/templates/sections/insert ----
  app.post('/v1/templates/sections/insert', async (c) => {
    const body = await c.req.json();
    const templateId = body.templateId;
    if (!templateId) throw Errors.validation('templateId is required');

    const sections = await deps.store.listSectionTemplates(templateId);
    const section = sections.find((s) => s.id === body.sectionId);
    if (!section) throw Errors.notFound(`section ${body.sectionId} in template ${templateId}`);

    const targetIndex = body.afterIndex ?? 0;
    const slides = [...section.slides];
    if (body.slide) {
      slides.splice(targetIndex + 1, 0, body.slide);
    }
    const updated = { ...section, slides, createdAt: section.createdAt };
    await deps.store.putSectionTemplate(updated);
    return c.json({ section: updated });
  });

  // ---- POST /v1/templates/locks/validate ----
  app.post('/v1/templates/locks/validate', async (c) => {
    const userId = c.req.header('x-user-id') ?? 'anonymous';
    const body = await c.req.json();

    const result = await enforceBrandLock(deps, {
      deckId: body.deckId,
      actorId: userId,
      targets: body.targets ?? [],
      operation: body.operation,
    });
    return c.json(result);
  });

  // ---- GET /v1/templates/:templateId/preview ----
  app.get('/v1/templates/:templateId/preview', async (c) => {
    const templateId = c.req.param('templateId');
    const result = await renderPreview(deps, { templateId });
    return c.json({
      svg: result.svg,
      width: result.width,
      height: result.height,
      frames: result.frames,
      placeholderCount: result.placeholderCount,
    });
  });

  return app;
}
