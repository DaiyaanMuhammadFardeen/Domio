/**
 * Viewer-identity — privacy mode policy (Phase 17 W3).
 *
 * Four privacy modes are defined in contracts/events/ingest/*.json:
 *
 *   identified     — viewer has supplied a real identifier (email, etc.)
 *   pseudonymous   — viewer is identified by a salted hash, no PII
 *   anon_consent   — viewer has opted in to anonymous tracking
 *   anon_no_track  — viewer has explicitly opted out
 *
 * Each workspace chooses which of the four its deployer accepts. The
 * default policy is to accept everything except anon_no_track (the
 * "GDPR-safe" default). The SDK asks the workspace's policy before
 * sending events.
 */

import type { PrivacyMode } from '../types.js';

export type ConsentPolicy = 'gdpr_strict' | 'balanced' | 'permissive' | 'custom';

export interface PolicyDecision {
  /** True if the privacy mode is acceptable for this workspace. */
  accept: boolean;
  /** If not, why we rejected. */
  reason?: string;
}

export function evaluateMode(mode: PrivacyMode, accepted: readonly PrivacyMode[]): PolicyDecision {
  if (accepted.includes(mode)) {
    return { accept: true };
  }
  return { accept: false, reason: `privacy_mode ${mode} not accepted by workspace` };
}

/** Default accepted modes for the named policy presets. */
export function defaultPolicyFor(preset: ConsentPolicy): readonly PrivacyMode[] {
  switch (preset) {
    case 'gdpr_strict':
      return ['identified', 'pseudonymous'];
    case 'balanced':
      return ['identified', 'pseudonymous', 'anon_consent'];
    case 'permissive':
      return ['identified', 'pseudonymous', 'anon_consent'];
    case 'custom':
      return ['identified', 'pseudonymous', 'anon_consent', 'anon_no_track'];
  }
}

/**
 * Compute the policy version stamp. We bump this string every time
 * the wording of the consent banner changes so the consent_event
 * audit trail can be replayed against the exact language the user
 * saw.
 */
export const CURRENT_POLICY_VERSION = 'phase17-w3-v1';

/**
 * Derive the IP region class for the consent event. Pure function so
 * it can be re-derived from the audit log without re-asking the user.
 */
export function ipClassFor(ip: string | null): string | null {
  if (!ip) return null;
  if (ip.startsWith('103.')) return 'bd';
  if (ip.startsWith('192.168.') || ip.startsWith('10.') || ip.startsWith('127.')) return 'internal';
  return 'external';
}
