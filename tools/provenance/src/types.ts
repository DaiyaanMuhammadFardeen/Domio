/**
 * SLSA / in-toto provenance predicate types.
 *
 * We follow the SLSA Build Provenance v1 spec. Only the fields we actually
 * emit are typed; additional fields are allowed through via the
 * `unrecognizedFields` catch-all.
 *
 * Spec: https://slsa.dev/provenance/v1
 */

export interface ResourceDescriptor {
  digest: { [alg: string]: string };
  name?: string;
  uri?: string;
  content?: unknown;
  /** Other fields are preserved verbatim. */
  [k: string]: unknown;
}

export interface Invocation {
  configSource?: { uri: string; digest?: { [alg: string]: string }; entryPoint?: string };
  parameters?: { [k: string]: unknown };
  environment?: { [k: string]: unknown };
  by?: { [k: string]: unknown };
}

export interface BuildDefinition {
  buildType: string;
  externalParameters?: { [k: string]: unknown };
  internalParameters?: { [k: string]: unknown };
  resolvedDependencies?: ResourceDescriptor[];
}

export interface RunDetails {
  builder?: { id: string; version?: { [k: string]: unknown } };
  metadata?: {
    invocationId?: string;
    startedOn?: string;
    finishedOn?: string;
  };
  by?: { [k: string]: unknown };
}

export interface ProvenancePredicate {
  buildDefinition: BuildDefinition;
  runDetails: RunDetails;
}

export interface ProvenanceStatement {
  /** URI of the predicate type. */
  predicateType: string;
  /** A URI identifying the resource this statement is about. */
  subject: ResourceDescriptor[];
  predicate: ProvenancePredicate;
}

export interface ProvenanceEnvelope {
  payloadType: string;
  payload: string; // base64(JSON(ProvenanceStatement))
  signatures: Signature[];
}

export interface Signature {
  keyid: string;
  sig: string;
}