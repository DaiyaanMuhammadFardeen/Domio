/**
 * HMAC-SHA256 signing + verification for the analytics ingest pipeline.
 *
 * Every request from @domio/analytics-sdk to services/event-ingest is
 * HMAC-signed. The signature is computed over the request body and
 * shipped in the `X-Domio-Signature` header as hex.
 *
 * The key is per-session (rotated hourly by services/event-ingest). The
 * SDK ships with a long-lived key fetched from the dashboard bootstrap
 * response; the ephemeral session key is fetched lazily on first emit.
 *
 * Format: X-Domio-Signature: sha256=<hex digest>
 *
 * Reuse: signBody / verifyBody are exported so services/event-ingest
 * (Node) and apps/api can re-use the same implementation.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';

export const SIGNATURE_VERSION = 'sha256';

export interface SignedRequest {
  body: string;
  signature: string;
}

/**
 * Sign a string body with the workspace's HMAC key.
 * Returns the header value, e.g. "sha256=abc123...".
 */
export function signBody(keyHex: string, body: string): string {
  if (!/^[0-9a-fA-F]+$/.test(keyHex)) {
    throw new Error('hmac key must be hex-encoded');
  }
  const key = Buffer.from(keyHex, 'hex');
  const sig = createHmac('sha256', key).update(body, 'utf8').digest('hex');
  return `${SIGNATURE_VERSION}=${sig}`;
}

/**
 * Constant-time verify. Use this on the server side.
 * Returns true when signature matches the expected signature for body.
 */
export function verifyBody(keyHex: string, body: string, headerValue: string): boolean {
  const expected = signBody(keyHex, body);
  if (expected.length !== headerValue.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(headerValue));
}

/**
 * Convenience: serialize an array of events to JSON and sign the result.
 */
export function signEvents<T>(keyHex: string, events: readonly T[]): SignedRequest {
  const body = JSON.stringify({ events });
  return { body, signature: signBody(keyHex, body) };
}
