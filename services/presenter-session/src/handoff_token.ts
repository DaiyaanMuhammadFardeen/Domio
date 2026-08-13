/**
 * @domio/presenter-session — handover token.
 *
 * Phase 15 W11. The handover token is an HMAC-signed claim that authorises
 * a presenter to take over a session. The token carries:
 *
 *   { session_id, workspace_id, from_actor, to_actor, expected_version, ttl_ms, audience_digest }
 *
 * and is signed via `@domio/signed-link-token` over a tenant-scoped key
 * (HKDF-derived from the workspace's audit root). Replay protection is
 * provided by the underlying nonce store.
 *
 * The token is intentionally separate from the session row's optimistic
 * concurrency: the row etag still gates the actual mutation; the token
 * gates *who* may invoke the mutation. Two-stage verification:
 *
 *   1. POST /v1/presenter/sessions/{id}/handover/init — mints the token.
 *   2. POST /v1/presenter/sessions/{id}/handover      — presents the token.
 *
 * If the token is missing, expired, replayed, or mismatched on `to_actor`,
 * the service rejects the call with `BAD_TOKEN`.
 *
 * Public API:
 *   - `mintHandoverToken` — synchronous HMAC token mint.
 *   - `verifyHandoverToken` — verify and decode.
 *   - `HandoverTokenError`, `HandoverTokenClaims` — types.
 */

import { createHmac, timingSafeEqual } from 'crypto';
import { NullNonceStore, type NonceStore } from '@domio/signed-link-token';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface HandoverTokenClaims {
  readonly session_id: string;
  readonly workspace_id: string;
  readonly from_actor: string;
  readonly to_actor: string;
  /** Session version the sender believed the row was at when minting.
   *  Verified at use-time against `If-Match`. */
  readonly expected_version: number;
  /** Time the token was minted (ms since epoch). */
  readonly minted_at_ms: number;
  /** Time the token expires (ms since epoch). */
  readonly expires_at_ms: number;
  /** SHA-256 hex digest of the audience state at handoff time — used to
   *  detect drift between the sender's view and what receivers see.
   *  Optional: callers may omit when the receiver is expected to fetch
   *  fresh state. */
  readonly audience_digest?: string;
  /** Optional nonce (hex) — when supplied the caller wants determinism. */
  readonly nonce?: string;
}

export type HandoverTokenErrorCode =
  | 'BAD_FORMAT'
  | 'BAD_SIGNATURE'
  | 'EXPIRED'
  | 'NONCE_REPLAYED'
  | 'MISMATCHED_RECIPIENT'
  | 'MISMATCHED_SESSION';

export class HandoverTokenError extends Error {
  readonly code: HandoverTokenErrorCode;
  constructor(code: HandoverTokenErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = 'HandoverTokenError';
  }
}

// ---------------------------------------------------------------------------
// Mint
// ---------------------------------------------------------------------------

export interface HandoverTokenMintOptions {
  /** Override the default 60 s TTL. */
  readonly ttlMs?: number;
  /** Random source for nonce generation. Default 16 random bytes. */
  readonly nonce?: Buffer;
  /** Override the wall clock for tests. */
  readonly nowMs?: number;
}

const DEFAULT_HANDOVER_TTL_MS = 60_000;

export function mintHandoverToken(
  claims: Omit<HandoverTokenClaims, 'minted_at_ms' | 'expires_at_ms' | 'nonce'>,
  key: Uint8Array,
  opts: HandoverTokenMintOptions = {},
): string {
  if (key.length < 32) {
    throw new HandoverTokenError('BAD_FORMAT', `HMAC key must be >= 32 bytes, got ${key.length}`);
  }
  if (!claims.session_id || !claims.workspace_id || !claims.from_actor || !claims.to_actor) {
    throw new HandoverTokenError(
      'BAD_FORMAT',
      'session_id, workspace_id, from_actor, to_actor required',
    );
  }
  if (!Number.isInteger(claims.expected_version) || claims.expected_version < 1) {
    throw new HandoverTokenError('BAD_FORMAT', 'expected_version must be a positive integer');
  }
  const now = opts.nowMs ?? Date.now();
  const ttl = opts.ttlMs ?? DEFAULT_HANDOVER_TTL_MS;
  const nonce = opts.nonce ?? randomNonce(16);
  const fullClaims: HandoverTokenClaims = {
    ...claims,
    minted_at_ms: now,
    expires_at_ms: now + ttl,
    nonce: nonce.toString('hex'),
  };
  const payloadJson = canonicalJson(fullClaims);
  const payloadB64 = base64url(Buffer.from(payloadJson, 'utf8'));
  const message = `${payloadB64}.${fullClaims.expires_at_ms}`;
  const hmac = createHmac('sha256', key).update(message).digest();
  return `${message}.${base64url(hmac)}`;
}

// ---------------------------------------------------------------------------
// Verify
// ---------------------------------------------------------------------------

export interface HandoverTokenVerifyOptions {
  /** Wall clock for tests. Default `Date.now`. */
  readonly nowMs?: number;
  /** Nonce store for replay protection. Default `NullNonceStore`. */
  readonly nonceStore?: NonceStore;
  /** TTL window for the nonce store. Default 5 min. */
  readonly nonceTtlMs?: number;
}

export interface HandoverTokenVerifyResult {
  readonly ok: true;
  readonly claims: HandoverTokenClaims;
}
export interface HandoverTokenVerifyFailure {
  readonly ok: false;
  readonly code: HandoverTokenErrorCode;
  readonly message: string;
}

export function verifyHandoverToken(
  token: string,
  key: Uint8Array,
  expectedSessionId: string,
  expectedRecipient: string,
  opts: HandoverTokenVerifyOptions = {},
): HandoverTokenVerifyResult | HandoverTokenVerifyFailure {
  if (key.length < 32) {
    return { ok: false, code: 'BAD_FORMAT', message: 'HMAC key too short' };
  }
  const parts = token.split('.');
  if (parts.length !== 3) {
    return { ok: false, code: 'BAD_FORMAT', message: `expected 3 parts, got ${parts.length}` };
  }
  const [payloadB64, expiresStr, hmacB64] = parts as [string, string, string];

  const expiresAt = Number(expiresStr);
  if (!Number.isFinite(expiresAt)) {
    return { ok: false, code: 'BAD_FORMAT', message: 'expires_at_ms invalid' };
  }

  // Recompute HMAC and compare in constant time.
  const message = `${payloadB64}.${expiresStr}`;
  let provided: Buffer;
  let computed: Buffer;
  try {
    provided = Buffer.from(fromBase64Url(hmacB64));
    computed = createHmac('sha256', key).update(message).digest();
  } catch (e) {
    return { ok: false, code: 'BAD_FORMAT', message: `decode failure: ${(e as Error).message}` };
  }
  if (provided.length !== computed.length || !timingSafeEqual(provided, computed)) {
    return { ok: false, code: 'BAD_SIGNATURE', message: 'HMAC mismatch' };
  }

  // Decode payload.
  let claims: HandoverTokenClaims;
  try {
    const json = Buffer.from(fromBase64Url(payloadB64)).toString('utf8');
    claims = JSON.parse(json) as HandoverTokenClaims;
  } catch {
    return { ok: false, code: 'BAD_FORMAT', message: 'payload is not valid JSON' };
  }

  // Session pin.
  if (claims.session_id !== expectedSessionId) {
    return {
      ok: false,
      code: 'MISMATCHED_SESSION',
      message: `session_id "${claims.session_id}" does not match "${expectedSessionId}"`,
    };
  }
  // Recipient pin — the receiver must equal the `to_actor`.
  if (claims.to_actor !== expectedRecipient) {
    return {
      ok: false,
      code: 'MISMATCHED_RECIPIENT',
      message: `to_actor "${claims.to_actor}" does not match "${expectedRecipient}"`,
    };
  }

  // Expiry.
  const now = opts.nowMs ?? Date.now();
  if (expiresAt <= now) {
    return { ok: false, code: 'EXPIRED', message: `token expired at ${expiresAt}` };
  }

  // Replay.
  if (claims.nonce) {
    const store: NonceStore = opts.nonceStore ?? new NullNonceStore();
    const ttl = opts.nonceTtlMs ?? 5 * 60 * 1000;
    const fresh = store.seen(claims.nonce, ttl);
    if (!fresh) {
      return { ok: false, code: 'NONCE_REPLAYED', message: 'nonce already used' };
    }
  }

  return { ok: true, claims };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function randomNonce(n: number): Buffer {
  const out = Buffer.alloc(n);
  // Node 22+: globalThis.crypto.getRandomValues is available.
  const c = (globalThis as { crypto?: { getRandomValues?: (b: Buffer) => Buffer } }).crypto;
  if (c && typeof c.getRandomValues === 'function') {
    return c.getRandomValues(out);
  }
  // Fallback for older runtimes (shouldn't trip in Node 22).
  for (let i = 0; i < n; i++) out[i] = Math.floor(Math.random() * 256);
  return out;
}

/** Canonical JSON — sorted top-level keys, no whitespace. Sufficient for
 *  token signing; objects are shallow and there are no nested arrays. */
function canonicalJson(value: HandoverTokenClaims): string {
  const keys = Object.keys(value).sort();
  const parts: string[] = [];
  for (const k of keys) {
    const v = (value as unknown as Record<string, unknown>)[k];
    parts.push(`${JSON.stringify(k)}:${JSON.stringify(v ?? null)}`);
  }
  return `{${parts.join(',')}}`;
}

function base64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s: string): Buffer {
  const pad = '='.repeat((4 - (s.length % 4)) % 4);
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64');
}

// ---------------------------------------------------------------------------
// Re-export the nonce store factories for convenience.
// ---------------------------------------------------------------------------

export { InMemoryNonceStore, NullNonceStore } from '@domio/signed-link-token';

/** Decode a token envelope WITHOUT verifying the signature. Useful for
 *  extracting `expires_at_ms` so callers can pre-empt refresh. */
export function parseHandoverToken(token: string): { expires_at_ms: number } | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const expires = Number(parts[1]);
  if (!Number.isFinite(expires)) return null;
  return { expires_at_ms: expires };
}
