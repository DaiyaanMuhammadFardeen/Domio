import { createHmac, timingSafeEqual } from 'node:crypto';
import { canonicalize } from './canonical.js';
import type { ProvenanceEnvelope, ProvenanceStatement } from './types.js';

export interface VerifyOptions {
  /**
   * HMAC secret(s) keyed by `keyid`. If multiple are provided, the one
   * matching the signature's keyid is used. If a single secret is
   * provided, `expectedKeyId` MUST be set.
   */
  keys: Record<string, string>;
  /** Optional: validate that subjects match a list of expected digests. */
  expectedDigests?: Record<string, string>;
  /** Accept any subject URI whose digest matches `expectedDigests`. */
  matchDigestOnly?: boolean;
}

export interface VerifyResult {
  ok: boolean;
  reason?: string;
  statement?: ProvenanceStatement;
}

/**
 * Verify an in-toto provenance envelope:
 *   1. Decode the base64 payload, parse JSON.
 *   2. Verify the HMAC signature against the canonical JSON.
 *   3. Validate predicateType is the SLSA v1 URI.
 *   4. (Optional) confirm subjects' digests match expected.
 */
export function verify(envelope: unknown, opts: VerifyOptions): VerifyResult {
  if (!envelope || typeof envelope !== 'object') {
    return { ok: false, reason: 'envelope is not an object' };
  }
  const e = envelope as ProvenanceEnvelope;
  if (e.payloadType !== 'application/vnd.in-toto+json') {
    return { ok: false, reason: `unexpected payloadType: ${e.payloadType}` };
  }
  if (typeof e.payload !== 'string') {
    return { ok: false, reason: 'payload is not a string' };
  }
  if (!Array.isArray(e.signatures) || e.signatures.length === 0) {
    return { ok: false, reason: 'no signatures' };
  }

  let stmt: ProvenanceStatement;
  try {
    const json = Buffer.from(e.payload, 'base64').toString('utf8');
    stmt = JSON.parse(json) as ProvenanceStatement;
  } catch (err) {
    return { ok: false, reason: `payload decode failed: ${(err as Error).message}` };
  }

  if (stmt.predicateType !== 'https://slsa.dev/provenance/v1') {
    return { ok: false, reason: `unexpected predicateType: ${stmt.predicateType}` };
  }

  for (const sig of e.signatures) {
    const key = opts.keys[sig.keyid];
    if (!key) continue;
    const expected = createHmac('sha256', key).update(canonicalize(stmt)).digest();
    const got = Buffer.from(sig.sig, 'base64');
    if (expected.length !== got.length) {
      return { ok: false, reason: 'signature length mismatch' };
    }
    if (!timingSafeEqual(expected, got)) {
      return { ok: false, reason: 'signature mismatch' };
    }
    if (opts.expectedDigests) {
      for (const s of stmt.subject) {
        for (const [alg, d] of Object.entries(s.digest)) {
          if (opts.expectedDigests[alg] && opts.expectedDigests[alg] !== d) {
            return { ok: false, reason: `subject digest mismatch for ${alg}` };
          }
        }
      }
    }
    return { ok: true, statement: stmt };
  }
  return { ok: false, reason: 'no matching keyid in keys' };
}