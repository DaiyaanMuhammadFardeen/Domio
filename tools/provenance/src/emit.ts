import { createHash, createHmac } from 'node:crypto';
import { canonicalize } from './canonical.js';
import type {
  BuildDefinition,
  ProvenanceEnvelope,
  ProvenanceStatement,
  ResourceDescriptor,
  RunDetails,
  Signature,
} from './types.js';

const PREDICATE_TYPE = 'https://slsa.dev/provenance/v1';

export interface EmitOptions {
  /**
   * Identifies the builder (e.g. `https://github.com/actions/runner`).
   * Required — without it we can't attribute the build.
   */
  builderId: string;
  /** Builder version metadata (commit, runner version, etc.). */
  builderVersion?: Record<string, unknown>;
  /** The build type — e.g. `https://slsa.dev/github-actions-workflow/v1`. */
  buildType?: string;
  /** When the build started (ISO 8601). */
  startedOn?: string;
  /** When the build finished (ISO 8601). */
  finishedOn?: string;
  /** Invocation ID for the build. */
  invocationId?: string;
  /** Signing key (HMAC secret). Required to produce an envelope. */
  signingKey: string;
  /** Signing key id. */
  keyId: string;
  /** Additional external parameters to embed verbatim. */
  externalParameters?: Record<string, unknown>;
  /** Internal parameters (typically scrubbed). */
  internalParameters?: Record<string, unknown>;
  /** Environment (compiler version, etc.). */
  environment?: Record<string, unknown>;
}

export interface SubjectInput {
  /** The URI where this artifact lives. */
  uri: string;
  /** Alg -> digest map, e.g. { sha256: '...' }. At least one entry required. */
  digest: Record<string, string>;
  name?: string;
}

export interface DependencyInput {
  uri: string;
  digest: Record<string, string>;
  name?: string;
}

/**
 * Compute the SHA-256 of `buf` and return the digest in lowercase hex.
 *
 * Exported so callers can compute subject digests without rolling their
 * own crypto.
 */
export function sha256(buf: Buffer | Uint8Array): string {
  return createHash('sha256').update(buf).digest('hex');
}

/**
 * Sign the canonical JSON of `predicate` with HMAC-SHA256 using `key`.
 * Returns a base64 signature.
 */
export function signPredicate(predicate: unknown, key: string, keyId: string): Signature {
  if (!key) throw new TypeError('signingKey is required');
  if (!keyId) throw new TypeError('keyId is required');
  const canon = canonicalize(predicate);
  const sig = createHmac('sha256', key).update(canon).digest('base64');
  return { keyid: keyId, sig };
}

/**
 * Build an SLSA v1 provenance statement for a single artifact, plus
 * resolved dependency descriptors.
 */
export function buildStatement(
  subjects: SubjectInput[],
  deps: DependencyInput[],
  opts: EmitOptions,
): ProvenanceStatement {
  if (!opts.builderId) throw new TypeError('builderId is required');
  if (subjects.length === 0) throw new RangeError('at least one subject is required');

  const buildDefinition: BuildDefinition = {
    buildType: opts.buildType ?? 'https://domio.dev/provenance/manual-build/v1',
    resolvedDependencies: deps.map(toResourceDescriptor),
    ...(opts.externalParameters ? { externalParameters: opts.externalParameters } : {}),
    ...(opts.internalParameters ? { internalParameters: opts.internalParameters } : {}),
  };

  const runDetails: RunDetails = {
    builder: {
      id: opts.builderId,
      ...(opts.builderVersion ? { version: opts.builderVersion } : {}),
    },
    metadata: {
      ...(opts.invocationId ? { invocationId: opts.invocationId } : {}),
      ...(opts.startedOn ? { startedOn: opts.startedOn } : {}),
      ...(opts.finishedOn ? { finishedOn: opts.finishedOn } : {}),
    },
  };

  return {
    predicateType: PREDICATE_TYPE,
    subject: subjects.map(toResourceDescriptor),
    predicate: { buildDefinition, runDetails },
  };
}

function toResourceDescriptor(s: { uri?: string; digest: Record<string, string>; name?: string }): ResourceDescriptor {
  if (!s.digest || Object.keys(s.digest).length === 0) {
    throw new TypeError('subject/dependency must declare at least one digest');
  }
  const out: ResourceDescriptor = { digest: s.digest };
  if (s.uri) out.uri = s.uri;
  if (s.name) out.name = s.name;
  return out;
}

/**
 * Wrap a statement in an in-toto envelope, base64-encoding the canonical
 * JSON and attaching the HMAC signature.
 */
export function buildEnvelope(stmt: ProvenanceStatement, opts: EmitOptions): ProvenanceEnvelope {
  const canon = canonicalize(stmt);
  const payload = Buffer.from(canon, 'utf8').toString('base64');
  const signature = signPredicate(stmt, opts.signingKey, opts.keyId);
  return {
    payloadType: 'application/vnd.in-toto+json',
    payload,
    signatures: [signature],
  };
}

/**
 * Convenience: build + sign in one call.
 */
export function emit(
  subjects: SubjectInput[],
  deps: DependencyInput[],
  opts: EmitOptions,
): ProvenanceEnvelope {
  const stmt = buildStatement(subjects, deps, opts);
  return buildEnvelope(stmt, opts);
}