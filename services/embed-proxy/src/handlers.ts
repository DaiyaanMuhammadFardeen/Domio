/**
 * Embed proxy — embed page + handler types (Phase 08).
 *
 * The embed handler serves the `/v1/embed/:bindingId` page and
 * manages token creation + proxy forwarding.
 *
 * Public surface:
 *  - {@link embedHandlers} — handler-function signatures.
 *  - {@link EmbedHandlerContext} — deps bag.
 */

import type { EmbedTokenService } from './tokens.js';
import { proxyHandler, type ProxyHandlerContext } from './proxy.js';
import type { HttpRequest, HttpResponse } from './types.js';

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

export interface EmbedHandlerContext {
  readonly tokenService: EmbedTokenService;
  /** Fetch for upstream calls (proxy passthrough). */
  readonly fetchFn?: typeof fetch;
  /** Resolve a binding ID to its target URL. */
  readonly resolveBinding: (bindingId: string) => Promise<{ url: string } | null>;
}

// ---------------------------------------------------------------------------
// Response helpers
// ---------------------------------------------------------------------------

function ok<T>(body: T): HttpResponse {
  return { status: 200, body };
}
function badRequest(message: string, code: string): HttpResponse {
  return { status: 400, body: { error: message, code } };
}
function unauthorized(message: string, code: string): HttpResponse {
  return { status: 401, body: { error: message, code } };
}
function notFound(message: string): HttpResponse {
  return { status: 404, body: { error: message, code: 'NOT_FOUND' } };
}

// ---------------------------------------------------------------------------
// Embed handler — serves the embed proxy endpoint
// ---------------------------------------------------------------------------

/**
 * POST /v1/embed/:bindingId/proxy
 *
 * Creates a short-lived single-use token and proxies the request to
 * the binding's target URL.
 */
export async function embedProxyHandler(
  req: HttpRequest<{ bindingId: string }, undefined, Record<string, string | undefined>>,
  ctx: EmbedHandlerContext,
): Promise<HttpResponse> {
  const { bindingId } = req.params;

  // Resolve the binding
  const binding = await ctx.resolveBinding(bindingId);
  if (!binding) return notFound(`Binding not found: ${bindingId}`);

  // Create token
  const record = ctx.tokenService.create(bindingId, binding.url);

  // Proxy through
  const proxyCtx: ProxyHandlerContext = {
    tokenService: ctx.tokenService,
    ...(ctx.fetchFn !== undefined ? { fetchFn: ctx.fetchFn } : {}),
  };

  return proxyHandler(
    { method: 'POST', path: '', params: { token: record.token }, body: undefined, query: {}, headers: req.headers },
    proxyCtx,
  );
}

/**
 * POST /v1/embed/tokens
 *
 * Create an embed token for a binding.
 */
export async function createEmbedTokenHandler(
  req: HttpRequest<undefined, { bindingId: string; url: string }>,
  ctx: EmbedHandlerContext,
): Promise<HttpResponse> {
  const { bindingId, url } = req.body;
  if (!bindingId || !url) return badRequest('bindingId and url are required', 'MISSING_FIELDS');
  const record = ctx.tokenService.create(bindingId, url);
  return ok({ token: record.token, expiresAt: record.expiresAt });
}

/**
 * GET /v1/embed/tokens/:token
 *
 * Validate an embed token (for the embed page to check before loading).
 */
export async function validateEmbedTokenHandler(
  req: HttpRequest<{ token: string }>,
  ctx: EmbedHandlerContext,
): Promise<HttpResponse> {
  const record = ctx.tokenService.peek(req.params.token);
  if (!record) return unauthorized('Invalid embed token', 'INVALID_TOKEN');
  if (record.used) return unauthorized('Embed token already used', 'TOKEN_ALREADY_USED');
  if (ctx.tokenService.now() > record.expiresAt.getTime()) return unauthorized('Embed token expired', 'TOKEN_EXPIRED');
  return ok({ bindingId: record.bindingId, expiresAt: record.expiresAt });
}

// ---------------------------------------------------------------------------
// Named handlers + grouped export
// ---------------------------------------------------------------------------

export const embedHandlers = {
  proxy: embedProxyHandler,
  createToken: createEmbedTokenHandler,
  validateToken: validateEmbedTokenHandler,
} as const;
