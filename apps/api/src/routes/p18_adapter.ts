/**
 * Phase 18 Hono adapter.
 *
 * Bridges framework-free P18 HttpRequest → HttpResponse handlers
 * into Hono route handlers.  Used by all P18 route modules.
 */

import type { Context } from 'hono';

// ---------------------------------------------------------------------------
// P18 HTTP types (mirror the shape used by every P18 service handler)
// ---------------------------------------------------------------------------

export interface P18Request {
  readonly method: string;
  readonly path: string;
  readonly params: Record<string, string>;
  readonly body: unknown;
  readonly query: Record<string, string | undefined>;
  readonly headers: Record<string, string | undefined>;
}

export interface P18Response {
  readonly status: number;
  readonly body?: unknown;
}

/** Any P18 framework-free handler (HttpRequest → HttpResponse). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type P18Handler = (req: P18Request, ctx: { service: any }) => Promise<P18Response>;

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

/**
 * Wraps a framework-free P18 handler into a Hono route handler.
 *
 * - Builds `P18Request` from the Hono context (method, path, params, query, body, headers).
 * - Calls the handler with `{ service }`.
 * - Maps the `P18Response` back to a Hono response (handles 204/undefined body).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function adaptHandler(handler: P18Handler, service: any) {
  return async (c: Context) => {
    const req: P18Request = {
      method: c.req.method,
      path: c.req.path,
      params: c.req.param() as Record<string, string>,
      body: await c.req.json().catch(() => undefined),
      query: c.req.query() as Record<string, string | undefined>,
      headers: {
        'x-actor-id': c.req.header('x-actor-id') ?? c.req.query('actorId'),
        'x-workspace-id': c.req.header('x-workspace-id') ?? c.req.query('workspaceId'),
      },
    };

    const res = await handler(req, { service });

    if (res.status === 204 || res.body === undefined) {
      return c.body(null, 204 as any);
    }

    return c.json(res.body as any, res.status as any);
  };
}
