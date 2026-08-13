/**
 * Share-api audit key helper (Phase 14 W1).
 *
 * Loads an HMAC-SHA256 key (32 bytes hex-encoded) from
 * `SHARE_AUDIT_HMAC_KEY` or generates a deterministic dev key when
 * unset. Production must always set the env var.
 */

import { randomBytes, createHash } from 'crypto';
import type { Key as AuditKey } from '@domio/audit-ts';

const DEV_KID = 'dev-key-do-not-use-in-prod';

export function shareAuditKey(
  envValue: string | undefined = process.env.SHARE_AUDIT_HMAC_KEY,
): AuditKey {
  const keyHex = envValue ?? devKeyHex();
  if (keyHex.length !== 64) {
    throw new Error(
      `SHARE_AUDIT_HMAC_KEY must be 32 bytes hex-encoded (64 chars); got ${keyHex.length}`,
    );
  }
  return {
    kid: DEV_KID,
    keyHex,
    rotatedAt: new Date(0),
    expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
    overlapUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  };
}

function devKeyHex(): string {
  // Deterministic dev key so tests and dev sessions agree.
  const seed = Buffer.from('domio-share-api-dev-key-v1');
  return createHash('sha256').update(seed).digest('hex');
}

/**
 * Generate a fresh random key (32 bytes hex-encoded). Used for
 * `SHARE_AUDIT_HMAC_KEY` setup.
 */
export function generateShareAuditKeyHex(): string {
  return randomBytes(32).toString('hex');
}
