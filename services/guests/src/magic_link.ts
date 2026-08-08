/**
 * Magic-link pure logic (Phase 18).
 *
 * Token issuance, hashing, and expiry checks.
 * No side-effects — pure functions only.
 */

import { createHmac, createHash } from 'crypto';
import { InvalidCapabilityError } from './types.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Allowed guest capabilities. download/export are DISABLED by default. */
export const ALLOWED_CAPABILITIES = ['comment', 'suggest', 'view'] as const;

/** Default magic-link TTL in minutes. */
export const DEFAULT_TTL_MINUTES = 15;

/** Dev default secret (production must inject a real secret). */
export const DEV_SECRET = 'domio-guest-link-dev-secret-change-me';

// ---------------------------------------------------------------------------
// Token issuance
// ---------------------------------------------------------------------------

/**
 * Issue a magic-link token.
 *
 * 1. Build message: `${guestAccessId}.${email}.${expiresAt.getTime()}`
 * 2. HMAC-SHA256(message, secret) → hex token
 * 3. SHA-256(token) → tokenHash (stored in DB)
 *
 * @returns `{ token, tokenHash }` — token is the plain-text link token,
 *          tokenHash is the SHA-256 hex to persist.
 */
export function issueMagicLinkToken(
  guestAccessId: string,
  email: string,
  expiresAt: Date,
  secret: string = DEV_SECRET,
  nonce?: string,
): { token: string; tokenHash: string } {
  const noncePart = nonce != null ? `.${nonce}` : '';
  const message = `${guestAccessId}.${email}.${expiresAt.getTime()}${noncePart}`;
  const token = createHmac('sha256', secret).update(message).digest('hex');
  const tokenHash = createHash('sha256').update(token).digest('hex');
  return { token, tokenHash };
}

// ---------------------------------------------------------------------------
// Expiry check
// ---------------------------------------------------------------------------

/**
 * Returns true if the given `expiresAt` is at or after `now`.
 */
export function isExpired(expiresAt: Date, now: Date): boolean {
  return now.getTime() >= expiresAt.getTime();
}

// ---------------------------------------------------------------------------
// Capability validation
// ---------------------------------------------------------------------------

/**
 * Validate that all requested capabilities are in the allowed set.
 * Throws {@link InvalidCapabilityError} for any disallowed capability.
 */
export function validateCapabilities(capabilities: string[]): void {
  for (const cap of capabilities) {
    if (!(ALLOWED_CAPABILITIES as readonly string[]).includes(cap)) {
      throw new InvalidCapabilityError(cap);
    }
  }
}

// ---------------------------------------------------------------------------
// TTL
// ---------------------------------------------------------------------------

/**
 * Resolve the TTL in minutes from an optional override or the env var or
 * the default constant.
 */
export function resolveTtlMinutes(override?: number): number {
  if (override != null && override > 0) return override;
  const envVal = process.env['GUEST_MAGIC_LINK_TTL_MINUTES'];
  if (envVal) {
    const parsed = parseInt(envVal, 10);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }
  return DEFAULT_TTL_MINUTES;
}
