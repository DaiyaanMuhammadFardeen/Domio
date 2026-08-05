/**
 * Embed proxy — JWT handling (Phase 11).
 *
 * HMAC-HS256 JWT sign and verify for embed proxy JWT passthrough.
 * Uses Node.js built-in crypto — no external dependencies.
 *
 * Public surface:
 *  - {@link signJwt} — create a signed JWT
 *  - {@link verifyJwt} — verify and decode a JWT
 *  - {@link JwtError}, {@link JwtExpiredError}, {@link JwtInvalidError}
 */

import { createHmac, timingSafeEqual } from 'node:crypto';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface JwtPayload {
  readonly sub?: string;
  readonly aud?: string;
  readonly exp?: number;
  readonly iat?: number;
  readonly [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class JwtError extends Error {
  readonly code: string;
  constructor(message: string, code: string) {
    super(message);
    this.name = 'JwtError';
    this.code = code;
  }
}

export class JwtExpiredError extends JwtError {
  constructor() {
    super('JWT has expired', 'JWT_EXPIRED');
    this.name = 'JwtExpiredError';
  }
}

export class JwtInvalidError extends JwtError {
  constructor(reason: string) {
    super(`Invalid JWT: ${reason}`, 'JWT_INVALID');
    this.name = 'JwtInvalidError';
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function base64UrlEncode(data: string | Uint8Array): string {
  const buf = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  return Buffer.from(buf)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function base64UrlDecode(str: string): Uint8Array {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/');
  const pad = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4));
  return new Uint8Array(Buffer.from(padded + pad, 'base64'));
}

function base64UrlDecodeString(str: string): string {
  return new TextDecoder().decode(base64UrlDecode(str));
}

// ---------------------------------------------------------------------------
// Sign
// ---------------------------------------------------------------------------

/**
 * Sign a JWT with HMAC-SHA256.
 *
 * @param payload - The claims to encode
 * @param secret - The HMAC signing secret
 * @param expiresInMs - Optional expiry in milliseconds (sets `exp` claim)
 * @returns Compact JWT string (header.payload.signature)
 */
export function signJwt(
  payload: JwtPayload,
  secret: string,
  expiresInMs?: number,
): string {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);

  const fullPayload: Record<string, unknown> = {
    ...payload,
    iat: payload.iat ?? now,
  };

  if (expiresInMs !== undefined) {
    fullPayload.exp = now + Math.floor(expiresInMs / 1000);
  }

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(fullPayload));

  const data = `${encodedHeader}.${encodedPayload}`;
  const signature = createHmac('sha256', secret).update(data).digest();
  const encodedSignature = base64UrlEncode(signature);

  return `${data}.${encodedSignature}`;
}

// ---------------------------------------------------------------------------
// Verify
// ---------------------------------------------------------------------------

/**
 * Verify a JWT signature and decode its payload.
 *
 * @param token - The compact JWT string
 * @param secret - The HMAC signing secret
 * @param expectedAudience - Optional expected `aud` claim (validated if set)
 * @returns The decoded payload
 * @throws {JwtInvalidError} if the token is malformed or signature is invalid
 * @throws {JwtExpiredError} if the token has expired
 */
export function verifyJwt(
  token: string,
  secret: string,
  expectedAudience?: string,
): JwtPayload {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new JwtInvalidError('expected 3 dot-separated parts');
  }

  const encodedHeader = parts[0] as string;
  const encodedPayload = parts[1] as string;
  const encodedSignature = parts[2] as string;

  // Verify signature
  const data = `${encodedHeader}.${encodedPayload}`;
  const expectedSig = createHmac('sha256', secret).update(data).digest();
  const actualSig = base64UrlDecode(encodedSignature);

  if (expectedSig.length !== actualSig.length || !timingSafeEqual(expectedSig, actualSig)) {
    throw new JwtInvalidError('invalid signature');
  }

  // Decode payload
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(base64UrlDecodeString(encodedPayload));
  } catch {
    throw new JwtInvalidError('invalid payload JSON');
  }

  // Check expiry
  if (typeof payload.exp === 'number') {
    const now = Math.floor(Date.now() / 1000);
    if (now > payload.exp) {
      throw new JwtExpiredError();
    }
  }

  // Check audience
  if (expectedAudience !== undefined) {
    if (payload.aud !== expectedAudience) {
      throw new JwtInvalidError(`expected aud "${expectedAudience}", got "${String(payload.aud)}"`);
    }
  }

  return payload as JwtPayload;
}
