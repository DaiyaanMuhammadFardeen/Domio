/**
 * @domio/phone-pairing — token mint + verify.
 *
 * The signed token is a base64url-encoded `payload | hmac` blob. HMAC-SHA256
 * over a canonical JSON payload keeps the implementation symmetric between
 * the runtime (TypeScript) and the realtime gateway (Go) — both sides
 * derive the same key from the workspace binding secret.
 *
 * Wire format:
 *   header.payload.signature
 *   where:
 *     header   = base64url('{"alg":"HS256","typ":"pairing.v1"}')
 *     payload  = base64url(canonical_json(claims))
 *     signature = base64url(HMAC_SHA256(key, header + '.' + payload))
 *
 * The verifier rejects:
 *   - malformed blobs,
 *   - bad signatures,
 *   - expired tokens,
 *   - tokens whose epoch is behind the server's current epoch for that
 *     (session_id, device_id) pair (replay/rotation protection),
 *   - tokens bound to a different session id than the one being accessed.
 */

import { createHmac, timingSafeEqual } from 'crypto';
import type {
  MintPairingTokenInput,
  MintedPairingToken,
  PairingCapability,
  PairingTokenClaims,
  VerifyPairingTokenInput,
  VerifyPairingTokenResult,
} from './types.js';
import {
  PairingSessionMismatchError,
  PairingSignatureError,
  PairingTokenExpiredError,
  PairingTokenRevokedError,
  PairingTokenReplayedError,
} from './types.js';

const HEADER_OBJECT = { alg: 'HS256', typ: 'pairing.v1' } as const;
const TOKEN_TTL_MS = 5 * 60 * 1000; // hard cap before re-pair

export interface TokenSigner {
  /** Raw 32-byte HMAC key. */
  readonly key: Uint8Array;
  /** Optional kid — useful when the gateway rotates keys. */
  readonly kid?: string;
}

function canonicalize(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map(canonicalize).join(',')}]`;
  }
  const keys = Object.keys(value as Record<string, unknown>).sort();
  const inner = keys.map(
    (k) => `${JSON.stringify(k)}:${canonicalize((value as Record<string, unknown>)[k])}`,
  );
  return `{${inner.join(',')}}`;
}

function b64urlEncode(input: Buffer | string): string {
  const buf = typeof input === 'string' ? Buffer.from(input, 'utf8') : input;
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(input: string): Buffer {
  // Pad to a multiple of 4.
  const pad = input.length % 4;
  const padded = pad === 0 ? input : input + '='.repeat(4 - pad);
  return Buffer.from(padded.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

function sign(key: Uint8Array, message: string): string {
  const sig = createHmac('sha256', Buffer.from(key)).update(message).digest();
  return b64urlEncode(sig);
}

function verifySig(key: Uint8Array, message: string, signature: string): boolean {
  let decoded: Buffer;
  try {
    decoded = b64urlDecode(signature);
  } catch {
    return false;
  }
  if (decoded.length !== 32) return false;
  const expected = createHmac('sha256', Buffer.from(key)).update(message).digest();
  // timingSafeEqual requires equal-length buffers.
  if (decoded.length !== expected.length) return false;
  return timingSafeEqual(decoded, expected);
}

// ---------------------------------------------------------------------------
// Mint
// ---------------------------------------------------------------------------

export function mintPairingToken(
  signer: TokenSigner,
  input: MintPairingTokenInput,
  args: {
    /** Server-side epoch — incremented per rotation; verifiers reject
     *  any token with a stale epoch. */
    serverEpoch: number;
    /** Issued-at time (ms). */
    now_ms: number;
    /** Override TTL for this token. Defaults to 60 s (one rotation). */
    ttl_ms?: number;
    /** Optional override for the capabilities list. */
    capabilities?: MintPairingTokenInput['capabilities'];
  },
): MintedPairingToken {
  const ttl = args.ttl_ms ?? 60 * 1000;
  const claims: PairingTokenClaims = {
    session_id: input.presenter_session_id,
    device_id: input.device_id,
    ...(input.device_name !== undefined ? { device_name: input.device_name } : {}),
    epoch: args.serverEpoch,
    issued_at_ms: args.now_ms,
    expires_at_ms: args.now_ms + ttl,
    capabilities: (args.capabilities ?? input.capabilities ?? []) as PairingCapability[],
  };
  const headerB64 = b64urlEncode(JSON.stringify(HEADER_OBJECT));
  const payloadB64 = b64urlEncode(canonicalize(claims));
  const message = `${headerB64}.${payloadB64}`;
  const sig = sign(signer.key, message);
  const token = `${message}.${sig}`;
  return {
    token,
    claims,
    epoch: args.serverEpoch,
    deep_link: `domio://pair?token=${encodeURIComponent(token)}`,
  };
}

// ---------------------------------------------------------------------------
// Verify
// ---------------------------------------------------------------------------

export function parsePairingToken(token: string):
  | {
      ok: true;
      header: Record<string, unknown>;
      payload: Record<string, unknown>;
      _sig: string;
    }
  | {
      ok: false;
      reason: string;
    } {
  const parts = token.split('.');
  if (parts.length !== 3) return { ok: false, reason: 'malformed token' };
  const [headerB64, payloadB64, sigB64] = parts as [string, string, string];
  try {
    const header = JSON.parse(b64urlDecode(headerB64).toString('utf8')) as Record<string, unknown>;
    const payload = JSON.parse(b64urlDecode(payloadB64).toString('utf8')) as Record<
      string,
      unknown
    >;
    if (header.alg !== 'HS256' || header.typ !== 'pairing.v1') {
      return { ok: false, reason: 'unsupported algorithm or type' };
    }
    return { ok: true, header, payload, _sig: sigB64 };
  } catch {
    return { ok: false, reason: 'invalid base64 or json' };
  }
}

export interface VerifyOptions {
  /** Server epoch — verifiers reject any token whose `epoch` < serverEpoch. */
  serverEpoch: number;
  /** Current time (ms). */
  now_ms: number;
  /** Throw on failure (default true). When false, returns a VerifyResult. */
  throwOnFailure?: boolean;
}

/** Verify and parse a pairing token. Throws on failure unless
 *  `throwOnFailure` is false. */
export function verifyPairingToken(
  signer: TokenSigner,
  input: VerifyPairingTokenInput,
  opts: VerifyOptions,
): PairingTokenClaims {
  const result = verifyPairingTokenResult(signer, input, opts);
  if (!result.ok || !result.claims) {
    const reason = result.reason ?? 'verify failed';
    if (reason.includes('signature')) throw new PairingSignatureError();
    if (reason.includes('expired')) throw new PairingTokenExpiredError();
    if (reason.includes('revoked')) throw new PairingTokenRevokedError();
    if (reason.includes('replay') || reason.includes('epoch')) {
      throw new PairingTokenReplayedError();
    }
    if (reason.includes('session')) throw new PairingSessionMismatchError();
    throw new PairingSignatureError(reason);
  }
  return result.claims;
}

/** Non-throwing variant. Returns a VerifyResult. */
export function verifyPairingTokenResult(
  signer: TokenSigner,
  input: VerifyPairingTokenInput,
  opts: VerifyOptions,
): VerifyPairingTokenResult {
  const parsed = parsePairingToken(input.token);
  if (!parsed.ok) {
    return { ok: false, reason: `signature invalid: ${parsed.reason}` };
  }
  const { payload } = parsed as {
    header: Record<string, unknown>;
    payload: Record<string, unknown>;
  };
  const [headerB64, payloadB64, sigB64] = input.token.split('.') as [string, string, string];
  const message = `${headerB64}.${payloadB64}`;
  if (!verifySig(signer.key, message, sigB64)) {
    return { ok: false, reason: 'signature invalid: bad hmac' };
  }
  const claims = payload as unknown as PairingTokenClaims;
  // Session binding.
  if (claims.session_id !== input.session_id) {
    return { ok: false, reason: 'session mismatch' };
  }
  // Epoch — server must have a strictly-greater-or-equal epoch.
  if (typeof claims.epoch !== 'number' || claims.epoch < opts.serverEpoch) {
    return {
      ok: false,
      reason: `replay: token epoch ${claims.epoch} < server ${opts.serverEpoch}`,
    };
  }
  // Expiry.
  if (typeof claims.expires_at_ms !== 'number' || claims.expires_at_ms < opts.now_ms) {
    return { ok: false, reason: 'expired' };
  }
  return { ok: true, claims };
}

/** Quick expiry check (used by background sweepers). */
export function isExpired(claims: PairingTokenClaims, now_ms: number): boolean {
  return claims.expires_at_ms <= now_ms;
}

/** Maximum hard TTL (used to cap the rotation window). */
export function maxTtlMs(): number {
  return TOKEN_TTL_MS;
}

export const _internal = {
  canonicalize,
  b64urlEncode,
  b64urlDecode,
};
