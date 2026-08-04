/**
 * @domio/deep-link-service — Phase 10 M7 data plane.
 *
 * Public surface:
 *   - In-memory repositories (testing + dev fallback)
 *   - DeepLinkService — shortener + resolver + key rotation
 *   - Web-framework-free HTTP handlers
 *   - Hono app builder
 *
 * Endpoints:
 *   POST   /v1/tenants/:tenantId/decks/:deckId/deep-links/shorten
 *   POST   /v1/tenants/:tenantId/deep-links/resolve
 *   GET    /v1/tenants/:tenantId/decks/:deckId/deep-links
 *   DELETE /v1/tenants/:tenantId/deep-links/:id
 *   GET    /v1/tenants/:tenantId/deep-links/:id/stats
 *   POST   /v1/tenants/:tenantId/decks/:deckId/deep-links/rotate-key
 */

import { Hono } from 'hono';
import type { Context as HonoContext } from 'hono';
import { DeepLinkService } from './service.js';
import {
  InMemoryDeepLinkRepository,
  InMemoryDeepLinkKeyRepository,
  type DeepLinkRepository,
  type DeepLinkKeyRepository,
} from './dal.js';
import {
  handlers,
  type DeepLinkHandlerContext,
  type HttpRequest,
  type HttpResponse,
} from './handlers.js';

export * from './dal.js';
export * from './service.js';
export * from './handlers.js';

/** Adapter from Hono's Context into our framework-free `HttpRequest`. */
function fromHono(c: HonoContext): HttpRequest {
  const params = c.req.param();
  const path = c.req.path;
  const method = c.req.method;
  const headers: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(c.req.header())) {
    headers[k.toLowerCase()] = v;
  }
  let body: unknown = {};
  if (method === 'POST' || method === 'PATCH' || method === 'PUT') {
    try {
      body = c.req.json();
    } catch {
      body = {};
    }
  }
  return {
    method,
    path,
    params: params as unknown as Record<string, string>,
    body: body as unknown,
    query: c.req.query() as Record<string, string | undefined>,
    headers,
  };
}

/** Adapter from our `HttpResponse` into Hono's response shape. */
function toHono(res: HttpResponse): Response {
  return new Response(JSON.stringify(res.body), {
    status: res.status,
    headers: { 'content-type': 'application/json' },
  });
}

export interface CreateAppOptions {
  readonly service: DeepLinkService;
  readonly resolveActorId?: (req: HttpRequest) => string | undefined;
}

/** Build a Hono app that wires every handler to its route. */
export function createApp(opts: CreateAppOptions): Hono {
  const app = new Hono();
  const ctx: DeepLinkHandlerContext = {
    service: opts.service,
    ...(opts.resolveActorId ? { resolveActorId: opts.resolveActorId } : {}),
  };
  const wrap =
    <P, B>(fn: (req: HttpRequest<P, B>, ctx: DeepLinkHandlerContext) => Promise<HttpResponse>) =>
    async (c: HonoContext): Promise<Response> => {
      const req = fromHono(c) as unknown as HttpRequest<P, B>;
      const res = await fn(req, ctx);
      return toHono(res);
    };

  app.post('/v1/tenants/:tenantId/decks/:deckId/deep-links/shorten', wrap(handlers.shorten));
  app.post('/v1/tenants/:tenantId/deep-links/resolve', wrap(handlers.resolve));
  app.get('/v1/tenants/:tenantId/decks/:deckId/deep-links', wrap(handlers.list));
  app.delete('/v1/tenants/:tenantId/deep-links/:id', wrap(handlers.delete));
  app.get('/v1/tenants/:tenantId/deep-links/:id/stats', wrap(handlers.stats));
  app.post('/v1/tenants/:tenantId/decks/:deckId/deep-links/rotate-key', wrap(handlers.rotateKey));

  return app;
}

/** Convenience constructor for in-memory dev/test wiring. */
export function createInMemoryService(opts?: { clock?: () => number }): DeepLinkService {
  return new DeepLinkService({
    repo: new InMemoryDeepLinkRepository(),
    keys: new InMemoryDeepLinkKeyRepository(),
    ...(opts?.clock ? { clock: opts.clock } : {}),
  });
}

/** Build a ready-to-run Hono app backed by the in-memory service. */
export function createInMemoryApp(): Hono {
  return createApp({ service: createInMemoryService() });
}

export type { DeepLinkRepository, DeepLinkKeyRepository };