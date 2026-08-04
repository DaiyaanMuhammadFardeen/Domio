/**
 * Embed proxy — proxy handler (Phase 08).
 *
 * Validates the embed token, checks SSRF safety, then forwards the
 * request to the target URL with the original `Authorization` header
 * (auth_passthrough).
 *
 * Public surface:
 *  - {@link proxyHandler} — handler-function signature (framework-agnostic).
 *  - {@link ProxyHandlerContext} — deps bag.
 */

import { TokenExpiredError, TokenAlreadyUsedError, TokenNotFoundError } from './tokens.js';
import type { EmbedTokenService } from './tokens.js';
import { assertUrlSafe, SsrfBlockedError } from './ssrf.js';
import type { HttpRequest, HttpResponse } from './types.js';

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

export interface ProxyHandlerContext {
  readonly tokenService: EmbedTokenService;
  /** Fetch implementation (default: globalThis.fetch). */
  readonly fetchFn?: typeof fetch;
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export async function proxyHandler(
  req: HttpRequest<{ token: string }, undefined, Record<string, string | undefined>>,
  ctx: ProxyHandlerContext,
): Promise<HttpResponse> {
  const { token } = req.params;

  // 1. Validate token
  let record;
  try {
    record = ctx.tokenService.consume(token);
  } catch (e) {
    if (e instanceof TokenNotFoundError) {
      return { status: 401, body: { error: 'Invalid embed token', code: 'INVALID_TOKEN' } };
    }
    if (e instanceof TokenExpiredError) {
      return { status: 401, body: { error: 'Embed token expired', code: 'TOKEN_EXPIRED' } };
    }
    if (e instanceof TokenAlreadyUsedError) {
      return { status: 401, body: { error: 'Embed token already used', code: 'TOKEN_ALREADY_USED' } };
    }
    throw e;
  }

  // 2. SSRF check
  try {
    await assertUrlSafe(record.url);
  } catch (e) {
    if (e instanceof SsrfBlockedError) {
      return { status: 400, body: { error: e.message, code: e.code } };
    }
    throw e;
  }

  // 3. Forward request with auth_passthrough
  const fetchFn = ctx.fetchFn ?? globalThis.fetch;
  const authHeader = req.headers['authorization'];
  const headers: Record<string, string> = {
    accept: 'application/json',
  };
  if (authHeader) headers['authorization'] = authHeader;

  const upstreamRes = await fetchFn(record.url, {
    method: 'GET',
    headers,
  });

  const body = await upstreamRes.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    parsed = body;
  }

  return {
    status: upstreamRes.status,
    body: parsed,
  };
}
