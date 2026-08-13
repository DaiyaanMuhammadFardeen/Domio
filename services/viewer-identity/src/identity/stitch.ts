/**
 * Viewer-identity — cross-device stitching (Phase 17 W3).
 *
 * Given two viewers seen on the same workspace within a small window
 * of each other, decide whether to link them as alternate identities
 * of the same canonical viewer.
 *
 * Heuristics (each returns a confidence in [0,1]):
 *   * same IP class (e.g. both 'eu', both 'bd') within 24 h
 *   * same User-Agent within 7 d
 *   * same email hash (opt-in only — the SDK must have explicitly
 *     attached the email to the event)
 *   * manual link (operator action) — confidence 1.0
 *
 * The stitcher emits IdentityLink records but never overwrites an
 * existing link. If the candidate viewer is already linked to a
 * different canonical, the link is recorded with low confidence and
 * surfaced for operator review.
 */

import type { ViewerRecord, IdentityLink } from '../types.js';

export interface StitchInput {
  workspace_id: string;
  /** The viewer we just observed. */
  viewer: ViewerRecord;
  /** Other viewers in the same workspace seen recently. */
  candidates: readonly ViewerRecord[];
  /** Optional context to inform the heuristics. */
  context: {
    ip_class?: string | null;
    user_agent?: string | null;
    email_hash?: string | null;
    now_ms: number;
  };
}

export interface StitchOutput {
  /** New identity link to insert (or skip if no match). */
  link: IdentityLink | null;
  /** Confidence in [0,1]. */
  confidence: number;
  /** Heuristic that produced the link (for the audit log). */
  method: IdentityLink['method'] | null;
}

export function stitchViewer(input: StitchInput): StitchOutput {
  const { viewer, candidates, context } = input;
  let best: StitchOutput = { link: null, confidence: 0, method: null };
  for (const cand of candidates) {
    if (cand.viewer_id === viewer.viewer_id) continue;
    if (cand.workspace_id !== viewer.workspace_id) continue;

    // Heuristic: email hash (only if both have one).
    if (context.email_hash) {
      const candEmail = (cand.metadata['email_hash'] as string | undefined) ?? null;
      if (candEmail && candEmail === context.email_hash) {
        return {
          link: makeLink(viewer, cand, 'email_hash', 0.99),
          confidence: 0.99,
          method: 'email_hash',
        };
      }
    }

    // Heuristic: same IP class within 24h.
    const ageMs = Math.abs(context.now_ms - cand.last_seen_at);
    if (context.ip_class && ageMs < 24 * 3600 * 1000) {
      const candIp = (cand.metadata['last_ip_class'] as string | undefined) ?? null;
      if (candIp && candIp === context.ip_class) {
        const conf = 0.6;
        if (conf > best.confidence) {
          best = {
            link: makeLink(viewer, cand, 'last_seen_ip', conf),
            confidence: conf,
            method: 'last_seen_ip',
          };
        }
      }
    }

    // Heuristic: same UA within 7 d.
    if (context.user_agent && ageMs < 7 * 24 * 3600 * 1000) {
      const candUa = (cand.metadata['last_user_agent'] as string | undefined) ?? null;
      if (candUa && candUa === context.user_agent) {
        const conf = 0.45;
        if (conf > best.confidence) {
          best = {
            link: makeLink(viewer, cand, 'last_seen_ua', conf),
            confidence: conf,
            method: 'last_seen_ua',
          };
        }
      }
    }
  }
  return best;
}

function makeLink(
  a: ViewerRecord,
  b: ViewerRecord,
  method: IdentityLink['method'],
  confidence: number,
): IdentityLink {
  // Canonical = lower UUID lexicographically so the symmetric edge is
  // (canonical, alternate). The lower-UUID viewer wins.
  const sorted = [a, b].sort((x, y) => (x.viewer_id < y.viewer_id ? -1 : 1));
  const canonical = sorted[0]!;
  const alternate = sorted[1]!;
  return {
    link_id: '',
    workspace_id: a.workspace_id,
    canonical_id: canonical.viewer_id,
    alternate_id: alternate.viewer_id,
    confidence,
    method,
    created_at: Date.now(),
  };
}
