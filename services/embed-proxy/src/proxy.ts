/**
 * Embed proxy — proxy handler (Phase 08/11).
 *
 * Phase 08: Validates the embed token, checks SSRF safety, then forwards the
 * request to the target URL with the original `Authorization` header
 * (auth_passthrough).
 *
 * Phase 11 additions: When the request targets a deck/live-app path,
 * resolves the embed policy and enforces:
 *  - Origin allowlist (Content-Security-Policy frame-ancestors)
 *  - JWT passthrough (HMAC-HS256 with service secret)
 *  - Trap-focus header
 *
 * Public surface:
 *  - {@link proxyHandler} — handler-function signature (framework-agnostic).
 *  - {@link ProxyHandlerContext} — deps bag.
 */

import { TokenExpiredError, TokenAlreadyUsedError, TokenNotFoundError } from './tokens.js';
import type { EmbedTokenService } from './tokens.js';
import { assertUrlSafe, SsrfBlockedError } from './ssrf.js';
import type { EmbedPolicy } from './policies.js';
import { buildCspHeader, buildFocusTrapHeader } from './csp.js';
import { verifyJwt, JwtError } from './jwt.js';
import type { HttpRequest, HttpResponse } from './types.js';

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

export interface ProxyHandlerContext {
  readonly tokenService: EmbedTokenService;
  /** Fetch implementation (default: globalThis.fetch). */
  readonly fetchFn?: typeof fetch;
  /**
   * (Phase 11) Resolve an embed path to its policy.
   * When provided, the proxy enforces policy-based origin checks,
   * JWT validation, CSP headers, and trap-focus.
   */
  readonly resolvePolicy?: (path: string) => Promise<EmbedPolicy | null>;
  /**
   * (Phase 11) HMAC-HS256 secret for JWT verification.
   * Required when resolvePolicy is provided.
   */
  readonly jwtSecret?: string;
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

  // 3. Phase 11: Resolve embed policy (when policy resolver is available)
  const extraHeaders: Record<string, string> = {};
  let policy: EmbedPolicy | null = null;

  if (ctx.resolvePolicy) {
    policy = await ctx.resolvePolicy(record.url);

    if (policy) {
      // 3a. JWT verification (when policy requires it)
      if (policy.jwtRequired) {
        const authHeader = req.headers['authorization'];
        const jwtToken = extractBearerToken(authHeader);

        if (!jwtToken || !ctx.jwtSecret) {
          return { status: 401, body: { error: 'Missing or invalid token', code: 'JWT_REQUIRED' } };
        }

        try {
          verifyJwt(jwtToken, ctx.jwtSecret, policy.jwtAudience ?? undefined);
        } catch (e) {
          if (e instanceof JwtError) {
            return { status: 401, body: { error: 'Missing or invalid token', code: 'JWT_INVALID' } };
          }
          throw e;
        }
      }

      // 3b. CSP frame-ancestors header
      extraHeaders['Content-Security-Policy'] = buildCspHeader(policy);

      // 3c. Focus-trap header
      const focusTrap = buildFocusTrapHeader(policy);
      if (focusTrap) {
        extraHeaders['Focus-Trap'] = focusTrap;
      }
    }
  }

  // 4. Forward request with auth_passthrough
  const fetchFn = ctx.fetchFn ?? globalThis.fetch;
  const authHeader = req.headers['authorization'];
  const headers: Record<string, string> = {
    accept: 'application/json',
    ...extraHeaders,
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extract the Bearer token from an Authorization header.
 * Returns undefined if the header is missing or not Bearer-scheme.
 */
function extractBearerToken(authHeader: string | undefined): string | undefined {
  if (!authHeader) return undefined;
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match?.[1];
}
