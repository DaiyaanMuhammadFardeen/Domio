/**
 * AR Session — Hono route handlers (Phase 11 M5.3).
 *
 * Implements the OpenAPI contract at contracts/openapi/v1/ar-sessions.yaml.
 *
 * POST   /v1/ar_sessions          → 201 create session
 * GET    /v1/ar_sessions/:id      → 200 session status
 * DELETE /v1/ar_sessions/:id      → 204 invalidate session
 */

import { Hono } from 'hono';
import type { SessionService } from './service.js';
import {
  SessionNotFoundError,
  SessionExpiredError,
  SessionInvalidatedError,
  SessionValidationError,
  type ArSessionResponse,
} from './service.js';

// ── Response helpers ─────────────────────────────────────────────────

function jsonCreated<T>(body: T): Response {
  return new Response(JSON.stringify(body), {
    status: 201,
    headers: { 'Content-Type': 'application/json' },
  });
}

function jsonOk<T>(body: T): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function jsonNoContent(): Response {
  return new Response(null, { status: 204 });
}

function jsonError(status: number, code: string, message: string): Response {
  return new Response(JSON.stringify({ code, message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// ── Route factory ────────────────────────────────────────────────────

export interface RouteContext {
  readonly service: SessionService;
}

/**
 * Create Hono routes for the AR Sessions API.
 *
 * Mounts:
 *   POST   /v1/ar_sessions
 *   GET    /v1/ar_sessions/:id
 *   DELETE /v1/ar_sessions/:id
 */
export function createArSessionRoutes(ctx: RouteContext): Hono {
  const app = new Hono();

  // ────────────────────────────────────────────────────────────────
  // POST /v1/ar_sessions — Create a session
  // ────────────────────────────────────────────────────────────────
  app.post('/v1/ar_sessions', async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return jsonError(400, 'VALIDATION_ERROR', 'Request body must be valid JSON');
    }

    const b = body as Record<string, unknown>;
    if (typeof b !== 'object' || b === null) {
      return jsonError(400, 'VALIDATION_ERROR', 'Request body must be a JSON object');
    }

    if (typeof b['slideId'] !== 'string' || b['slideId'].length === 0) {
      return jsonError(
        400,
        'VALIDATION_ERROR',
        'slideId is required and must be a non-empty string',
      );
    }
    if (typeof b['modelAssetId'] !== 'string' || b['modelAssetId'].length === 0) {
      return jsonError(
        400,
        'VALIDATION_ERROR',
        'modelAssetId is required and must be a non-empty string',
      );
    }

    try {
      const session = await ctx.service.createSession({
        slideId: b['slideId'] as string,
        modelAssetId: b['modelAssetId'] as string,
      });
      const response: ArSessionResponse = ctx.service.toResponse(session);
      return jsonCreated(response);
    } catch (e) {
      if (e instanceof SessionValidationError) {
        return jsonError(400, e.code, e.message);
      }
      throw e;
    }
  });

  // ────────────────────────────────────────────────────────────────
  // GET /v1/ar_sessions/:id — Get session status
  // ────────────────────────────────────────────────────────────────
  app.get('/v1/ar_sessions/:id', async (c) => {
    const id = c.req.param('id');
    try {
      const session = await ctx.service.getSession(id);
      const response: ArSessionResponse = ctx.service.toResponse(session);
      return jsonOk(response);
    } catch (e) {
      if (e instanceof SessionNotFoundError) {
        return jsonError(404, e.code, e.message);
      }
      if (e instanceof SessionExpiredError) {
        return jsonError(404, e.code, e.message);
      }
      if (e instanceof SessionInvalidatedError) {
        return jsonError(404, e.code, e.message);
      }
      throw e;
    }
  });

  // ────────────────────────────────────────────────────────────────
  // DELETE /v1/ar_sessions/:id — Invalidate session
  // ────────────────────────────────────────────────────────────────
  app.delete('/v1/ar_sessions/:id', async (c) => {
    const id = c.req.param('id');
    try {
      await ctx.service.invalidateSession(id);
      return jsonNoContent();
    } catch (e) {
      if (e instanceof SessionNotFoundError) {
        return jsonError(404, e.code, e.message);
      }
      if (e instanceof SessionInvalidatedError) {
        return jsonError(404, e.code, e.message);
      }
      throw e;
    }
  });

  return app;
}
