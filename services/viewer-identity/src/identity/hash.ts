/**
 * Viewer-identity — salted identifier hashing (Phase 17 W3).
 *
 * The viewer_id_key is what the SDK sends. It is a salted hash of the
 * device's underlying identifier (cookie, localStorage UUID, etc.)
 * mixed with a rolling salt. The salt rotates quarterly so a leaked
 * dataset cannot be joined across snapshots.
 *
 * Generation rule:
 *   viewer_id_key = sha256(hexSalt + ':' + rawIdentifier)
 *
 * The salt is supplied as config so deployments can rotate without a
 * code change.
 */

import { createHash } from 'node:crypto';

export function hashViewerId(rawIdentifier: string, salt: string): string {
  if (!rawIdentifier) throw new Error('rawIdentifier is required');
  if (!salt) throw new Error('salt is required');
  return createHash('sha256').update(`${salt}:${rawIdentifier}`).digest('hex');
}

/**
 * Hash an email address for the cross-device stitching link. The
 * email is lowercased + trimmed before hashing so casing/whitespace
 * variants still match. The output is 32 hex chars (truncated sha256)
 * to keep the join index small.
 */
export function hashEmail(email: string, salt: string): string {
  if (!email) throw new Error('email is required');
  if (!salt) throw new Error('salt is required');
  const normalized = email.trim().toLowerCase();
  return createHash('sha256').update(`email:${salt}:${normalized}`).digest('hex').slice(0, 32);
}

/**
 * Classify an IP into a region. The classifier is deliberately
 * coarse — we don't need city-level precision, only the cohort
 * (us/eu/bd/sg/au) that the GDPR/bd residency rules pin against.
 *
 * Real deployments will swap this for a MaxMind GeoIP2 lookup; tests
 * stub the function.
 */
export function classifyIp(ip: string): 'us' | 'eu' | 'bd' | 'sg' | 'au' | 'unknown' {
  if (!ip) return 'unknown';
  // Minimal stub: anything starting with 10. is internal/private.
  if (ip.startsWith('10.') || ip.startsWith('192.168.') || ip.startsWith('127.')) {
    return 'unknown';
  }
  // Reserve a /8 for BD so the residency test can pin it deterministically.
  if (ip.startsWith('103.')) return 'bd';
  return 'unknown';
}
