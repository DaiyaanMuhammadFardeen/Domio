/**
 * @domio/ar-sessions — Phase 11 M5.3 AR handoff sessions.
 *
 * Time-limited AR viewer sessions with HMAC-signed tokens.
 * 30-minute total TTL, 5-minute inactivity timeout, per-session
 * rotating keys.
 *
 * Public surface:
 *
 *  - {@link SessionService} — session CRUD, lifecycle, token verification.
 *  - {@link createArSessionRoutes} — Hono route handlers per OpenAPI contract.
 *  - Token minting/verification via {@link mintToken}/{@link verifyToken}.
 *  - Deep-link URL builder via {@link buildAudienceUrl}.
 */

export {
  SessionService,
  InMemorySessionRepository,
  SessionNotFoundError,
  SessionExpiredError,
  SessionInvalidatedError,
  SessionValidationError,
  type SessionState,
  type ArSession,
  type ArSessionResponse,
  type CreateSessionInput,
  type SessionServiceOptions,
} from './service.js';

export {
  createArSessionRoutes,
  type RouteContext,
} from './handlers.js';

export {
  mintToken,
  verifyToken,
  rotateToken,
  generateSecret,
  canonicalJson,
  TokenExpiredError,
  TokenSignatureError,
  TokenMalformedError,
  TokenKeyMismatchError,
  DEFAULT_TTL_MS,
  DEFAULT_INACTIVITY_MS,
  TOKEN_VERSION,
  type TokenPayload,
  type TokenPayloadInput,
  type MintTokenOptions,
  type VerifyTokenOptions,
  type MintTokenResult,
} from './tokens.js';

export {
  buildAudienceUrl,
  buildQrPayload,
  type QrPayload,
} from './deeplink.js';
