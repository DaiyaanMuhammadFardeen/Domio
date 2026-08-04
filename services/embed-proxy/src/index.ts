/**
 * @domio/embed-proxy — Phase 08 embed proxy service.
 *
 * SSRF guard, embed token management, authenticated proxy forwarding.
 *
 * Public surface:
 *  - {@link SsrfBlockedError}, {@link isUrlSafe}, {@link assertUrlSafe}
 *  - {@link EmbedTokenService}, {@link TokenExpiredError}, {@link TokenAlreadyUsedError}, {@link TokenNotFoundError}
 *  - {@link embedHandlers}, {@link proxyHandler}
 */

export * from './ssrf.js';
export * from './tokens.js';
export * from './proxy.js';
export * from './handlers.js';
export type { HttpRequest, HttpResponse } from './types.js';
