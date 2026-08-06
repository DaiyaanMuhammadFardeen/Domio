/**
 * @domio/signed-link-token — token verification.
 *
 * Phase 14 W1. Companion to mint.ts. Verifies a signed link token:
 *
 *   1. Parse `<payload>.<expires>.<nonce>.<hmac>`.
 *   2. Recompute HMAC over the first 3 fields using the same key.
 *   3. Compare in constant time (timingSafeEqual-equivalent in JS).
 *   4. Reject if `expires` is in the past.
 *   5. Reject if the nonce has been seen before within the TTL window.
 *
 * Public API:
 *  - `verifyLinkToken(token, key, opts?)` → `VerifyResult`.
 *  - `VerifyResult` — discriminated union: ok | expired | badSig |
 *    badFormat | nonceReplayed | mismatchedSubject.
 *  - `parseToken(token)` — debug-only helper that decodes WITHOUT verifying.
 */

import { NonceStore } from './nonce_store.js';
import { ViewerClaims } from './mint.js';

// ---------------------------------------------------------------------------
// Result
// ---------------------------------------------------------------------------

export type VerifyResult =
  | { readonly ok: true; readonly claims: ViewerClaims; readonly expiresAtSec: number; readonly nonceB64: string }
  | { readonly ok: false; readonly code: VerifyErrorCode; readonly message: string };

export type VerifyErrorCode =
  | 'BAD_FORMAT'
  | 'BAD_SIGNATURE'
  | 'EXPIRED'
  | 'NONCE_REPLAYED'
  | 'MISMATCHED_SUBJECT';

// ---------------------------------------------------------------------------
// Errors thrown (rare — most callers should branch on VerifyResult)
// ---------------------------------------------------------------------------

export class TokenVerifyError extends Error {
  readonly code: VerifyErrorCode;
  constructor(code: VerifyErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = 'TokenVerifyError';
  }
}

// ---------------------------------------------------------------------------
// Verify
// ---------------------------------------------------------------------------

export interface VerifyOptions {
  /** Clock for tests; default `Date.now`. */
  readonly clock?: () => number;
  /** Nonce store. Required to detect replay attacks; can be omitted
   *  (or undefined) in tests that explicitly do not care about replay. */
  readonly nonceStore?: NonceStore | undefined;
  /** TTL passed to the nonce store when checking/recording.
   *  Default 24h. */
  readonly nonceTtlMs?: number;
  /** When provided, the verified token's `sub` claim must equal this.
   *  Mismatch is reported as MISMATCHED_SUBJECT. */
  readonly requireSubject?: string;
}

export async function verifyLinkToken(
  token: string,
  key: Uint8Array,
  opts: VerifyOptions = {},
): Promise<VerifyResult> {
  const clock = opts.clock ?? (() => Date.now());

  const parts = token.split('.');
  if (parts.length !== 4) {
    return { ok: false, code: 'BAD_FORMAT', message: `expected 4 parts, got ${parts.length}` };
  }
  const [payloadB64, expiresStr, nonceB64, hmacB64] = parts as [string, string, string, string];

  const expiresAtSec = Number(expiresStr);
  if (!Number.isFinite(expiresAtSec)) {
    return { ok: false, code: 'BAD_FORMAT', message: `invalid expires_at: ${expiresStr}` };
  }

  // 1. Recompute HMAC and compare in constant time.
  const message = `${payloadB64}.${expiresStr}.${nonceB64}`;
  let providedSig: Uint8Array;
  let computedSig: Uint8Array;
  try {
    providedSig = fromBase64Url(hmacB64);
    computedSig = await hmacSha256(new TextEncoder().encode(message), key);
  } catch (e) {
    return { ok: false, code: 'BAD_FORMAT', message: `decode failure: ${(e as Error).message}` };
  }
  if (!constantTimeEqual(providedSig, computedSig)) {
    return { ok: false, code: 'BAD_SIGNATURE', message: 'HMAC mismatch' };
  }

  // 2. Expiry check.
  const nowSec = Math.floor(clock() / 1000);
  if (expiresAtSec <= nowSec) {
    return { ok: false, code: 'EXPIRED', message: `token expired at ${expiresAtSec}` };
  }

  // 3. Decode payload.
  let claims: ViewerClaims;
  try {
    const payloadJson = new TextDecoder().decode(fromBase64Url(payloadB64));
    claims = JSON.parse(payloadJson) as ViewerClaims;
  } catch {
    return { ok: false, code: 'BAD_FORMAT', message: 'payload is not valid JSON' };
  }

  // 4. Optional subject pin.
  if (opts.requireSubject !== undefined && claims.sub !== opts.requireSubject) {
    return {
      ok: false,
      code: 'MISMATCHED_SUBJECT',
      message: `sub claim "${claims.sub ?? ''}" does not match required "${opts.requireSubject}"`,
    };
  }

  // 5. Replay check.
  if (opts.nonceStore) {
    const ttlMs = opts.nonceTtlMs ?? Math.max(1000, (expiresAtSec - nowSec) * 1000);
    const fresh = await opts.nonceStore.seen(nonceB64, ttlMs);
    if (!fresh) {
      return { ok: false, code: 'NONCE_REPLAYED', message: 'nonce already used' };
    }
  }

  return { ok: true, claims, expiresAtSec, nonceB64 };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Constant-time comparison for two Uint8Arrays. Returns false on length
 *  mismatch. Always reads every byte. */
export function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= (a[i] as number) ^ (b[i] as number);
  }
  return diff === 0;
}

/** Base64url decode. Throws on invalid input. */
export function fromBase64Url(s: string): Uint8Array {
  if (typeof atob === 'function') {
    const pad = '='.repeat((4 - (s.length % 4)) % 4);
    const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + pad);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  return new Uint8Array(Buffer.from(s, 'base64url'));
}

// Re-import for internal use.
async function hmacSha256(message: Uint8Array, key: Uint8Array): Promise<Uint8Array> {
  const subtle = globalThis.crypto.subtle;
  const cryptoKey = await subtle.importKey(
    'raw',
    key as BufferSource,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await subtle.sign('HMAC', cryptoKey, message as BufferSource);
  return new Uint8Array(sig);
}

// ---------------------------------------------------------------------------
// Debug parse (no verification)
// ---------------------------------------------------------------------------

export interface ParsedToken {
  readonly payloadB64: string;
  readonly expiresAtSec: number;
  readonly nonceB64: string;
  readonly hmacB64: string;
}

export function parseToken(token: string): ParsedToken | null {
  const parts = token.split('.');
  if (parts.length !== 4) return null;
  const [payloadB64, expiresStr, nonceB64, hmacB64] = parts as [string, string, string, string];
  const expiresAtSec = Number(expiresStr);
  if (!Number.isFinite(expiresAtSec)) return null;
  return { payloadB64, expiresAtSec, nonceB64, hmacB64 };
}
