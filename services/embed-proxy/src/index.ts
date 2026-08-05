/**
 * @domio/embed-proxy — Phase 08/11 embed proxy service.
 *
 * SSRF guard, embed token management, authenticated proxy forwarding,
 * embed policy CRUD (Phase 11), origin checking, CSP headers, and
 * JWT verification.
 *
 * Public surface:
 *  - {@link SsrfBlockedError}, {@link isUrlSafe}, {@link assertUrlSafe}
 *  - {@link EmbedTokenService}, {@link TokenExpiredError}, {@link TokenAlreadyUsedError}, {@link TokenNotFoundError}
 *  - {@link EmbedPolicyService}, {@link PolicyNotFoundError}, {@link PolicyValidationError}, {@link DEFAULT_POLICY}
 *  - {@link isAllowedOrigin}
 *  - {@link buildCspHeader}, {@link buildFocusTrapHeader}
 *  - {@link signJwt}, {@link verifyJwt}, {@link JwtError}, {@link JwtExpiredError}, {@link JwtInvalidError}
 *  - {@link embedHandlers}, {@link policyHandlers}, {@link proxyHandler}
 */

export * from './ssrf.js';
export * from './tokens.js';
export * from './policies.js';
export * from './origin-check.js';
export * from './csp.js';
export * from './jwt.js';
export * from './proxy.js';
export * from './handlers.js';
export type { HttpRequest, HttpResponse } from './types.js';
