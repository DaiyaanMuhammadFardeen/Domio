/**
 * AR Session — token minting & verification (Phase 11 M5.3).
 *
 * Mirrors the deep-link-svc signing approach (HMAC-SHA256 over
 * canonical JSON, base64url wire format). Each session gets a
 * unique per-session key so rotating one session's key doesn't
 * affect others.
 *
 * Wire format: base64url(JSON payload) where payload = { v, sid, exp, iat, kid, sig }
 *   sig = HMAC-SHA256(canonicalJson({ v, sid, exp, iat, kid }), secret)
 *
 * Uses `node:crypto` because HMAC minting/verification lives on the
 * server side only. The viewer never imports this module's crypto
 * entry points — the client only uses `buildAudienceUrl` and
 * `buildQrPayload`, which are defined in a separate file with no
 * Node-only dependencies.
 *
 * Injectable clock for deterministic tests.
 */

import { createHmac, timingSafeEqual, randomBytes } from 'node:crypto';

// ── Constants ────────────────────────────────────────────────────────

const TOKEN_VERSION = 1;
const DEFAULT_TTL_MS = 30 * 60 * 1000; // 30 minutes
const DEFAULT_INACTIVITY_MS = 5 * 60 * 1000; // 5 minutes

// ── Types ────────────────────────────────────────────────────────────

export interface TokenPayload {
  readonly v: number;
  readonly sid: string;
  readonly exp: number;
  readonly iat: number;
  readonly kid: string;
  readonly sig: string;
}

export interface TokenPayloadInput {
  readonly v: number;
  readonly sid: string;
  readonly exp: number;
  readonly iat: number;
  readonly kid: string;
}

export interface MintTokenOptions {
  /** Session ID. */
  readonly sessionId: string;
  /** HMAC-SHA256 secret (base64url encoded). */
  readonly secret: string;
  /** Key id for rotation tracking. */
  readonly kid: string;
  /** Clock returning ms since epoch. Defaults to Date.now. */
  readonly clock?: () => number;
  /** TTL in ms. Defaults to 30 min. */
  readonly ttlMs?: number;
}

export interface VerifyTokenOptions {
  /** The token string to verify. */
  readonly token: string;
  /** HMAC-SHA256 secret (base64url encoded). */
  readonly secret: string;
  /** Key id expected. */
  readonly kid: string;
  /** Clock returning ms since epoch. Defaults to Date.now. */
  readonly clock?: () => number;
}

export interface MintTokenResult {
  readonly token: string;
  readonly expiresAt: Date;
  readonly issuedAt: Date;
}

// ── Errors ───────────────────────────────────────────────────────────

export class TokenExpiredError extends Error {
  readonly code = 'TOKEN_EXPIRED' as const;
  constructor(message: string) {
    super(message);
    this.name = 'TokenExpiredError';
  }
}

export class TokenSignatureError extends Error {
  readonly code = 'TOKEN_SIGNATURE_INVALID' as const;
  constructor() {
    super('HMAC signature verification failed');
    this.name = 'TokenSignatureError';
  }
}

export class TokenMalformedError extends Error {
  readonly code = 'TOKEN_MALFORMED' as const;
  constructor(message: string) {
    super(message);
    this.name = 'TokenMalformedError';
  }
}

export class TokenKeyMismatchError extends Error {
  readonly code = 'TOKEN_KEY_MISMATCH' as const;
  constructor(expected: string, actual: string) {
    super(`Token kid=${actual} but expected kid=${expected}`);
    this.name = 'TokenKeyMismatchError';
  }
}

// ── Canonical JSON (mirrors @domio/deep-link state-encoder) ──────────

/** Deterministic key-sorted JSON serialisation. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(',')}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  const body = keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`).join(',');
  return `{${body}}`;
}

// ── Base64url helpers ────────────────────────────────────────────────

function bytesToB64Url(bytes: Uint8Array): string {
  const base = Buffer.from(bytes).toString('base64');
  return base.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64UrlToBytes(s: string): Buffer {
  const pad = s.length % 4;
  const norm = pad === 0 ? s : s + '='.repeat(4 - pad);
  return Buffer.from(norm.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

/** Generate a 32-byte HMAC key, base64url encoded. */
export function generateSecret(): string {
  return bytesToB64Url(randomBytes(32));
}

/** HMAC-SHA256 → base64url string. */
function hmacSign(secretB64: string, message: string): string {
  const secret = b64UrlToBytes(secretB64);
  if (secret.length < 16) {
    throw new Error('HMAC secret must decode to at least 16 bytes');
  }
  return bytesToB64Url(createHmac('sha256', secret).update(message).digest());
}

/** HMAC-SHA256 timing-safe equality. */
function hmacVerify(secretB64: string, message: string, providedB64: string): boolean {
  const secret = b64UrlToBytes(secretB64);
  const expected = createHmac('sha256', secret).update(message).digest();
  let provided: Buffer;
  try {
    provided = Buffer.from(providedB64, 'base64url');
  } catch {
    return false;
  }
  if (provided.length !== expected.length) return false;
  return timingSafeEqual(provided, expected);
}

// ── Token wire format ────────────────────────────────────────────────

/** Strip sig, canonicalise, and encode. */
function encodeTokenWire(input: TokenPayloadInput, secret: string): string {
  const wire: Omit<TokenPayload, 'sig'> = {
    v: input.v,
    sid: input.sid,
    exp: input.exp,
    iat: input.iat,
    kid: input.kid,
  };
  const sig = hmacSign(secret, canonicalJson(wire));
  const full: TokenPayload = { ...wire, sig };
  return bytesToB64Url(Buffer.from(canonicalJson(full), 'utf8'));
}

/** Decode + verify. Returns payload (with sig) on success. */
function decodeTokenWire(token: string, secret: string): TokenPayload {
  if (typeof token !== 'string' || token.length === 0) {
    throw new TokenMalformedError('Token is empty');
  }
  let raw: string;
  try {
    raw = Buffer.from(b64UrlToBytes(token)).toString('utf8');
  } catch {
    throw new TokenMalformedError('Token is not valid base64url');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new TokenMalformedError('Token payload is not valid JSON');
  }
  if (typeof parsed !== 'object' || parsed === null) {
    throw new TokenMalformedError('Token payload must be a JSON object');
  }
  const obj = parsed as Record<string, unknown>;
  for (const f of ['v', 'sid', 'exp', 'iat', 'kid', 'sig'] as const) {
    if (!(f in obj)) {
      throw new TokenMalformedError(`Missing required field: ${f}`);
    }
  }
  if (obj['v'] !== TOKEN_VERSION) {
    throw new TokenMalformedError(`Unsupported token version: ${String(obj['v'])}`);
  }
  if (typeof obj['sid'] !== 'string') {
    throw new TokenMalformedError('sid must be a string');
  }
  if (typeof obj['exp'] !== 'number' || !Number.isFinite(obj['exp'])) {
    throw new TokenMalformedError('exp must be a finite number');
  }
  if (typeof obj['iat'] !== 'number' || !Number.isFinite(obj['iat'])) {
    throw new TokenMalformedError('iat must be a finite number');
  }
  if (typeof obj['kid'] !== 'string') {
    throw new TokenMalformedError('kid must be a string');
  }
  if (typeof obj['sig'] !== 'string') {
    throw new TokenMalformedError('sig must be a string');
  }

  const sig = obj['sig'] as string;
  const wireInput: Omit<TokenPayload, 'sig'> = {
    v: obj['v'] as number,
    sid: obj['sid'] as string,
    exp: obj['exp'] as number,
    iat: obj['iat'] as number,
    kid: obj['kid'] as string,
  };
  const ok = hmacVerify(secret, canonicalJson(wireInput), sig);
  if (!ok) {
    throw new TokenSignatureError();
  }

  return {
    v: wireInput.v,
    sid: wireInput.sid,
    exp: wireInput.exp,
    iat: wireInput.iat,
    kid: wireInput.kid,
    sig,
  };
}

// ── Public API ───────────────────────────────────────────────────────

/**
 * Mint a new signed token for an AR session.
 * Returns the token string, expiry, and issued-at timestamps.
 */
export function mintToken(opts: MintTokenOptions): MintTokenResult {
  const clock = opts.clock ?? (() => Date.now());
  const now = clock();
  const ttlMs = opts.ttlMs ?? DEFAULT_TTL_MS;
  const expiresAt = now + ttlMs;

  const input: TokenPayloadInput = {
    v: TOKEN_VERSION,
    sid: opts.sessionId,
    exp: expiresAt,
    iat: now,
    kid: opts.kid,
  };

  const token = encodeTokenWire(input, opts.secret);
  return {
    token,
    expiresAt: new Date(expiresAt),
    issuedAt: new Date(now),
  };
}

/**
 * Verify a token. Returns the decoded payload on success.
 * Checks: structural integrity → HMAC signature → key match → expiry.
 */
export function verifyToken(opts: VerifyTokenOptions): TokenPayload {
  const clock = opts.clock ?? (() => Date.now());
  const payload = decodeTokenWire(opts.token, opts.secret);

  if (payload.kid !== opts.kid) {
    throw new TokenKeyMismatchError(opts.kid, payload.kid);
  }

  const now = clock();
  if (now > payload.exp) {
    throw new TokenExpiredError(`Token expired at ${new Date(payload.exp).toISOString()}`);
  }

  return payload;
}

/**
 * Re-mint a token with a new key (rotation). The old key can no
 * longer verify the session after rotation.
 */
export function rotateToken(opts: {
  readonly sessionId: string;
  readonly newSecret: string;
  readonly newKid: string;
  readonly clock?: (() => number) | undefined;
  readonly ttlMs?: number | undefined;
}): MintTokenResult {
  return mintToken({
    sessionId: opts.sessionId,
    secret: opts.newSecret,
    kid: opts.newKid,
    ...(opts.clock !== undefined ? { clock: opts.clock } : {}),
    ...(opts.ttlMs !== undefined ? { ttlMs: opts.ttlMs } : {}),
  });
}

// Re-export constants for consumers
export { DEFAULT_TTL_MS, DEFAULT_INACTIVITY_MS, TOKEN_VERSION };