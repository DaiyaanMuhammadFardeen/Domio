/**
 * License signer (Phase 19 Wave 2).
 *
 * LicenseSigner interface + SandboxLicenseSigner implementation.
 * Mirrors the JWS HS256 pattern from services/registry/src/crypto/index.ts.
 *
 * Token shape: header.payload.signature (compact JWS)
 * - header: {"alg":"HS256","typ":"JWT"}
 * - payload: {listing_id, buyer_id, version, scopes, seats, iat, exp}
 * - signature: HMAC-SHA256
 *
 * Secret from env MARKETPLACE_LICENSE_SECRET (default dev string).
 */

import { createHmac } from 'crypto';

// ---------------------------------------------------------------------------
// LicenseSigner interface
// ---------------------------------------------------------------------------

export interface LicenseSigner {
  issueLicenseGrant(input: {
    listing_id: string;
    buyer_id: string;
    version: string;
    scopes: string[];
    seats: number;
  }): Promise<string>;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const LICENSE_SECRET =
  process.env.MARKETPLACE_LICENSE_SECRET ?? 'domio-marketplace-license-dev-secret';
const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// B64URL helpers (mirrors registry/src/crypto/index.ts)
// ---------------------------------------------------------------------------

function b64url(buf: Buffer | Uint8Array): string {
  return Buffer.from(buf).toString('base64url');
}

function b64urlJson(obj: unknown): string {
  return b64url(Buffer.from(JSON.stringify(obj), 'utf8'));
}

// ---------------------------------------------------------------------------
// SandboxLicenseSigner
// ---------------------------------------------------------------------------

export class SandboxLicenseSigner implements LicenseSigner {
  async issueLicenseGrant(input: {
    listing_id: string;
    buyer_id: string;
    version: string;
    scopes: string[];
    seats: number;
  }): Promise<string> {
    const now = Date.now();
    const iat = Math.floor(now / 1000);
    const exp = Math.floor((now + ONE_YEAR_MS) / 1000);

    const header = b64urlJson({ alg: 'HS256', typ: 'JWT' });
    const payload = b64urlJson({
      listing_id: input.listing_id,
      buyer_id: input.buyer_id,
      version: input.version,
      scopes: input.scopes,
      seats: input.seats,
      iat,
      exp,
    });

    const signingInput = `${header}.${payload}`;
    const signature = createHmac('sha256', LICENSE_SECRET).update(signingInput).digest();
    const sigB64 = b64url(signature);

    return `${signingInput}.${sigB64}`;
  }
}

// ---------------------------------------------------------------------------
// Verify helper (for testing)
// ---------------------------------------------------------------------------

export function verifyLicenseToken(
  token: string,
  secret: string = LICENSE_SECRET,
): {
  valid: boolean;
  payload?: Record<string, unknown>;
  reason?: string;
} {
  const parts = token.split('.');
  if (parts.length !== 3) return { valid: false, reason: 'malformed' };

  const [header, payload, sigB64] = parts as [string, string, string];
  const expected = createHmac('sha256', secret).update(`${header}.${payload}`).digest();

  let provided: Buffer;
  try {
    provided = Buffer.from(sigB64, 'base64url');
  } catch {
    return { valid: false, reason: 'malformed' };
  }

  if (provided.length !== expected.length) return { valid: false, reason: 'bad-signature' };
  if (!timingSafeEqual(provided, expected)) return { valid: false, reason: 'bad-signature' };

  try {
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return { valid: true, payload: decoded as Record<string, unknown> };
  } catch {
    return { valid: false, reason: 'malformed' };
  }
}

function timingSafeEqual(a: Buffer, b: Buffer): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a[i]! ^ b[i]!;
  }
  return result === 0;
}
