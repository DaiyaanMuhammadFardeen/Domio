/**
 * Event-ingest — HMAC verification (Phase 17 W1).
 *
 * Mirrors packages/analytics-sdk/src/hmac.ts so a single key derivation
 * works on both sides. The signed body layout is:
 *
 *   sha256=<hex(HMAC_SHA256(hexKeyBytes, headerString))>
 *
 * where headerString is exactly:
 *
 *   `${timestamp}.${nonce}.${rawRequestBody}`
 *
 * The header is checked in constant time. The nonce is then checked
 * against the NonceCache (Redis or in-memory).
 */

import { createHmac, timingSafeEqual } from 'node:crypto';
import { SignatureError } from './errors.js';

export const HMAC_HEADER_NAME = 'X-Domio-Signature';
export const TIMESTAMP_HEADER_NAME = 'X-Domio-Timestamp';
export const NONCE_HEADER_NAME = 'X-Domio-Nonce';
export const HMAC_SCHEME = 'sha256=';

export interface VerifyInput {
  rawBody: string;
  signatureHeader: string | null;
  timestampHeader: string | null;
  nonceHeader: string | null;
  maxClockSkewMs: number;
  now: number;
}

export interface HmacVerifier {
  sign(rawBody: string, timestamp: number, nonce: string): string;
  verify(input: VerifyInput): { timestamp: number; nonce: string };
}

export { SignatureError };

function hexToBytes(hex: string): Buffer {
  if (hex.length % 2 !== 0) {
    throw new SignatureError('hmac key must have an even number of hex characters');
  }
  const out = Buffer.alloc(hex.length / 2);
  for (let i = 0; i < out.length; i += 1) {
    const byte = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    if (!Number.isFinite(byte)) {
      throw new SignatureError(`hmac key has invalid hex at byte ${i}`);
    }
    out[i] = byte;
  }
  return out;
}

function bytesToHex(bytes: Buffer): string {
  return bytes.toString('hex');
}

function compute(secret: Buffer, payload: string): Buffer {
  return createHmac('sha256', secret).update(payload).digest();
}

export function buildHmacVerifier(hexKey: string): HmacVerifier {
  if (!hexKey) {
    throw new SignatureError('hmac key is not configured (set INGEST_HMAC_KEY_HEX)');
  }
  const secret = hexToBytes(hexKey);

  return {
    sign(rawBody, timestamp, nonce) {
      const header = `${timestamp}.${nonce}.${rawBody}`;
      const mac = compute(secret, header);
      return `${HMAC_SCHEME}${bytesToHex(mac)}`;
    },
    verify({ rawBody, signatureHeader, timestampHeader, nonceHeader, maxClockSkewMs, now }) {
      if (!signatureHeader) throw new SignatureError('missing X-Domio-Signature header');
      if (!timestampHeader) throw new SignatureError('missing X-Domio-Timestamp header');
      if (!nonceHeader) throw new SignatureError('missing X-Domio-Nonce header');

      const ts = Number.parseInt(timestampHeader, 10);
      if (!Number.isFinite(ts)) throw new SignatureError('X-Domio-Timestamp must be an integer');
      const nonce = nonceHeader;
      if (nonce.length < 8) throw new SignatureError('X-Domio-Nonce must be at least 8 characters');

      const skew = Math.abs(now - ts);
      if (skew > maxClockSkewMs) {
        throw new SignatureError(`clock skew ${skew}ms exceeds limit ${maxClockSkewMs}ms`);
      }

      if (!signatureHeader.startsWith(HMAC_SCHEME)) {
        throw new SignatureError('signature must be prefixed with sha256=');
      }
      const expectedHex = signatureHeader.slice(HMAC_SCHEME.length);
      let expected: Buffer;
      try {
        expected = hexToBytes(expectedHex);
      } catch {
        throw new SignatureError('signature is not valid hex');
      }
      const actual = compute(secret, `${ts}.${nonce}.${rawBody}`);
      if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
        throw new SignatureError('signature mismatch');
      }

      return { timestamp: ts, nonce };
    },
  };
}

/**
 * Convenience: build a verifier with no key (testing only). All
 * verification attempts will throw SignatureError.
 */
export function buildNoopHmacVerifier(): HmacVerifier {
  return {
    sign() {
      throw new SignatureError('hmac verifier is not configured');
    },
    verify() {
      throw new SignatureError('hmac verifier is not configured');
    },
  };
}