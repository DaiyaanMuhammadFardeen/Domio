/**
 * Media routes — icons, stock search, lottie validation, sticker packs.
 *
 *   POST /v1/media/icons/ingest
 *   GET  /v1/media/icons/search
 *   POST /v1/media/icons/:iconId/recolor
 *   GET  /v1/media/stock
 *   POST /v1/media/lottie/validate
 *   GET  /v1/media/stickers
 *   POST /v1/media/stickers/:packId/install
 */

import { Hono } from 'hono';
import type { ServiceDeps } from '../deps.js';
import { Errors } from '../errors.js';
import { ingestIcon, searchIcons, recolorIcon } from '../media/icons.js';
import { searchStock } from '../media/stock.js';
import { validateLottie } from '../media/animations.js';
import { installStickerPack, listAvailableStickerPacks } from '../media/stickers.js';

export function mediaRoutes(deps: ServiceDeps): Hono {
  const app = new Hono();

  // ---- POST /v1/media/icons/ingest ----
  app.post('/v1/media/icons/ingest', async (c) => {
    const body = await c.req.json();
    const icon = await ingestIcon(deps, {
      name: body.name,
      ...(body.synonyms != null ? { synonyms: body.synonyms } : {}),
      ...(body.styles != null ? { styles: body.styles } : {}),
      pathData: body.pathData,
      ...(body.viewBox != null ? { viewBox: body.viewBox } : {}),
      ...(body.vendor != null ? { vendor: body.vendor } : {}),
      ...(body.licenseId != null ? { licenseId: body.licenseId } : {}),
    });
    return c.json({ icon }, 201);
  });

  // ---- GET /v1/media/icons/search ----
  app.get('/v1/media/icons/search', async (c) => {
    const q = c.req.query('q');
    if (!q) throw Errors.validation('q parameter is required');
    const styles = c.req.query('styles');
    const limit = c.req.query('limit');

    const icons = await searchIcons(deps, {
      q,
      ...(styles ? { styles: styles.split(',') } : {}),
      ...(limit ? { limit: Number(limit) } : {}),
    });
    return c.json({ icons });
  });

  // ---- POST /v1/media/icons/:iconId/recolor ----
  app.post('/v1/media/icons/:iconId/recolor', async (c) => {
    const iconId = c.req.param('iconId');
    const body = await c.req.json();
    const icon = await deps.store.getIcon(iconId);
    if (!icon) throw Errors.notFound(`icon ${iconId}`);

    const recolored = recolorIcon(icon.pathData, body.color);
    return c.json({
      iconId,
      color: body.color,
      pathData: recolored,
      viewBox: icon.viewBox,
    });
  });

  // ---- GET /v1/media/stock ----
  app.get('/v1/media/stock', async (c) => {
    const q = c.req.query('q');
    const provider = c.req.query('provider');
    if (!q) throw Errors.validation('q parameter is required');
    if (!provider) throw Errors.validation('provider parameter is required');

    const results = await searchStock(deps, {
      providerId: provider,
      q,
    });
    return c.json({ results });
  });

  // ---- POST /v1/media/lottie/validate ----
  app.post('/v1/media/lottie/validate', async (c) => {
    const body = await c.req.json();
    const result = validateLottie(body.json, {
      ...(body.maxBytes != null ? { maxBytes: body.maxBytes } : {}),
      ...(body.maxLayers != null ? { maxLayers: body.maxLayers } : {}),
    });
    return c.json(result);
  });

  // ---- GET /v1/media/stickers ----
  app.get('/v1/media/stickers', async (c) => {
    const theme = c.req.query('theme');
    const packs = await listAvailableStickerPacks(deps, {
      ...(theme ? { theme } : {}),
    });
    return c.json({ packs });
  });

  // ---- POST /v1/media/stickers/:packId/install ----
  app.post('/v1/media/stickers/:packId/install', async (c) => {
    const packId = c.req.param('packId');
    const tenantId = c.req.header('x-tenant-id') ?? 'default';
    const userId = c.req.header('x-user-id') ?? 'anonymous';

    const records = await installStickerPack(deps, {
      packId,
      workspaceId: tenantId,
      userId,
    });
    return c.json({ stickers: records });
  });

  return app;
}
