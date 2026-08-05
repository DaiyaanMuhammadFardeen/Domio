/**
 * LaTeX Render API — Hono routes (Phase 11).
 *
 * POST /v1/latex/render — render LaTeX source to HTML/SVG/PNG
 * GET  /v1/latex/render/:cache_key — retrieve cached render
 *
 * Implements the OpenAPI contract at contracts/openapi/v1/latex.yaml.
 */

import { Hono } from 'hono';
import { validateSafeSubset } from './safesubset.js';
import { renderLatex, RenderError } from './render.js';
import type { RenderCache } from './cache.js';

export interface RouteContext {
  readonly cache: RenderCache;
}

export function createLatexRoutes(ctx: RouteContext): Hono {
  const app = new Hono();

  // ---------------------------------------------------------------
  // POST /v1/latex/render
  // ---------------------------------------------------------------
  app.post('/v1/latex/render', async (c) => {
    const body = await c.req.json<{
      source: unknown;
      format: unknown;
      themeHash?: unknown;
    }>();

    // Validate required fields
    if (typeof body.source !== 'string' || body.source.length === 0) {
      return c.json(
        { code: 'VALIDATION_ERROR', message: 'source is required and must be a non-empty string' },
        400,
      );
    }
    if (typeof body.format !== 'string' || !['html', 'svg', 'png'].includes(body.format)) {
      return c.json(
        { code: 'VALIDATION_ERROR', message: 'format must be one of: html, svg, png' },
        400,
      );
    }
    const source: string = body.source;
    const format: string = body.format;
    const themeHash: string = typeof body.themeHash === 'string' ? body.themeHash : 'default';

    // Enforce max length per OpenAPI spec
    if (source.length > 8192) {
      return c.json(
        { code: 'VALIDATION_ERROR', message: 'source must not exceed 8192 characters' },
        400,
      );
    }

    // PNG — requires headless browser, unsupported in edge-render env
    if (format === 'png') {
      return c.json(
        {
          unsupported: true,
          message: 'PNG requires a headless browser — use HTML',
        },
        400,
      );
    }

    // SVG — also unsupported (KaTeX outputs HTML or MathML, not raw SVG)
    if (format === 'svg') {
      return c.json(
        {
          unsupported: true,
          message: 'SVG requires a headless browser — use HTML',
        },
        400,
      );
    }

    // Safe-subset gate
    const gate = validateSafeSubset(source);
    if (!gate.ok) {
      return c.json({ error: gate.message }, 400);
    }

    // Render via KaTeX
    try {
      const result = renderLatex(source, {
        themeHash,
        displayMode: false,
      });

      // Cache the result
      ctx.cache.set(result.cache_key, result.html, result.rendered_at);

      return c.json({
        rendered: result.html,
        cacheKey: result.cache_key,
      }, 200);
    } catch (err) {
      if (err instanceof RenderError) {
        return c.json({ error: err.message }, 422);
      }
      throw err;
    }
  });

  // ---------------------------------------------------------------
  // GET /v1/latex/render/:cache_key
  // ---------------------------------------------------------------
  app.get('/v1/latex/render/:cache_key', async (c) => {
    const cacheKey = c.req.param('cache_key');
    const entry = ctx.cache.get(cacheKey);
    if (!entry) {
      return c.json({ error: 'Not found or expired' }, 404);
    }
    return c.json({
      rendered: entry.html,
      cacheKey,
      renderedAt: entry.rendered_at,
      expiresAt: entry.expires_at,
    }, 200);
  });

  return app;
}
