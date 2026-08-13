/**
 * Connector framework — core types (Phase 08).
 *
 * Canonical types shared across adapters, registry, transport, and
 * normalization layers.
 */

// ---------------------------------------------------------------------------
// Connector identifiers
// ---------------------------------------------------------------------------

export type ConnectorId =
  | 'google_sheets'
  | 'excel'
  | 'airtable'
  | 'notion'
  | 'postgres'
  | 'mysql'
  | 'bigquery'
  | 'snowflake'
  | 'rest'
  | 'graphql';

// ---------------------------------------------------------------------------
// Connection
// ---------------------------------------------------------------------------

export type ConnectionScope = 'personal' | 'team' | 'org';

export interface Connection {
  readonly id: string;
  readonly tenant_id: string;
  readonly owner_id: string;
  readonly connector_id: ConnectorId;
  readonly connector_ver: string;
  readonly label: string;
  readonly scope: ConnectionScope;
  readonly created_at: Date;
}

// ---------------------------------------------------------------------------
// Credentials
// ---------------------------------------------------------------------------

export type AuthKind = 'oauth' | 'credentials' | 'token' | 'anonymous';

export interface CredentialRef {
  readonly vault: string;
  readonly path: string;
}

// ---------------------------------------------------------------------------
// Schema / discover
// ---------------------------------------------------------------------------

export type ColumnType = 'string' | 'number' | 'boolean' | 'date' | 'currency' | 'percent';

export type SemanticRole = 'dimension' | 'measure' | 'date' | 'currency' | 'percent' | 'id';

export interface CanonicalColumn {
  readonly name: string;
  readonly type: ColumnType;
  readonly semantic_role: SemanticRole;
  readonly pii_detected?: PiiLevel;
}

export interface CanonicalRows {
  readonly columns: CanonicalColumn[];
  readonly rows: ReadonlyArray<ReadonlyArray<unknown>>;
}

// ---------------------------------------------------------------------------
// Query / write
// ---------------------------------------------------------------------------

export type WriteOp = 'insert' | 'update' | 'delete';

export interface QuerySpec {
  readonly connection_id: string;
  readonly sql: string;
  readonly params?: ReadonlyArray<unknown>;
  readonly max_rows?: number;
  readonly cursor?: string;
}

export interface QueryResult {
  readonly rows: ReadonlyArray<ReadonlyArray<unknown>>;
  readonly columns: CanonicalColumn[];
  readonly cursor?: string;
  readonly stats: {
    readonly duration_ms: number;
    readonly row_count: number;
    readonly source: 'live' | 'cache';
  };
}

export interface WriteSpec {
  readonly connection_id: string;
  readonly op: WriteOp;
  readonly table: string;
  readonly rows: ReadonlyArray<ReadonlyArray<unknown>>;
  readonly columns: CanonicalColumn[];
}

export interface WriteResult {
  readonly affected_rows: number;
  readonly source: 'live' | 'cache';
}

// ---------------------------------------------------------------------------
// Discover
// ---------------------------------------------------------------------------

export interface DiscoverSpec {
  readonly connection_id: string;
  readonly tables?: string[];
}

export interface DiscoverResult {
  readonly tables: ReadonlyArray<{
    readonly name: string;
    readonly columns: CanonicalColumn[];
    readonly row_count_estimate?: number;
  }>;
}

// ---------------------------------------------------------------------------
// Subscribe
// ---------------------------------------------------------------------------

export interface SubscribeSpec {
  readonly connection_id: string;
  readonly table: string;
  readonly cursor?: string;
}

export interface SubscribeResult {
  readonly subscription_id: string;
  readonly status: 'active' | 'not_implemented';
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export interface AuthStartSpec {
  readonly connection_id: string;
  readonly redirect_uri?: string;
  readonly scope?: string[];
}

export interface AuthStartResult {
  readonly redirect_url: string;
  readonly state: string;
  readonly scope: string;
}

export interface AuthCallbackSpec {
  readonly connection_id: string;
  readonly code: string;
  readonly state: string;
}

export interface AuthCallbackResult {
  readonly credential_ref: CredentialRef;
}

// ---------------------------------------------------------------------------
// PII
// ---------------------------------------------------------------------------

export type PiiType = 'email' | 'phone' | 'ssn' | 'ip';

export type PiiLevel = 'none' | 'low' | 'medium' | 'high' | 'restricted';

// ---------------------------------------------------------------------------
// Adapter interface
// ---------------------------------------------------------------------------

export interface AdapterContext {
  readonly tenant_id: string;
  readonly owner_id: string;
  readonly connection: Connection;
  readonly credential: CredentialRef;
  readonly transport: Transport;
}

export interface ConnectorAdapter {
  readonly connector_id: ConnectorId;
  readonly version: string;
  readonly auth_kind: AuthKind;

  authStart(ctx: AdapterContext, spec: AuthStartSpec): Promise<AuthStartResult>;
  authCallback(ctx: AdapterContext, spec: AuthCallbackSpec): Promise<AuthCallbackResult>;
  ping(ctx: AdapterContext): Promise<{ ok: boolean; latency_ms: number }>;
  discover(ctx: AdapterContext, spec: DiscoverSpec): Promise<DiscoverResult>;
  query(ctx: AdapterContext, spec: QuerySpec): Promise<QueryResult>;
  subscribe?(ctx: AdapterContext, spec: SubscribeSpec): Promise<SubscribeResult>;
  write(ctx: AdapterContext, spec: WriteSpec): Promise<WriteResult>;
}

// ---------------------------------------------------------------------------
// Transport
// ---------------------------------------------------------------------------

export interface HttpRequestOpts {
  readonly method: string;
  readonly url: string;
  readonly headers?: Record<string, string>;
  readonly body?: unknown;
}

export interface HttpResponse {
  readonly status: number;
  readonly body: unknown;
}

export interface Transport {
  request(opts: HttpRequestOpts): Promise<HttpResponse>;
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export interface AdapterVersionInfo {
  readonly connector_id: ConnectorId;
  readonly version: string;
  readonly auth_kind: AuthKind;
  readonly deprecated: boolean;
  readonly deprecated_since?: string;
  readonly replaced_by?: string;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class AdapterVersionMismatchError extends Error {
  readonly code = 'ADAPTER_VERSION_MISMATCH' as const;
  constructor(
    public readonly connector_id: ConnectorId,
    public readonly requested_version: string,
    public readonly available_versions: string[],
  ) {
    super(
      `No adapter found for ${connector_id} at version ${requested_version}. Available: ${available_versions.join(', ')}`,
    );
    this.name = 'AdapterVersionMismatchError';
  }
}

export class ConnectorNotFoundError extends Error {
  readonly code = 'CONNECTOR_NOT_FOUND' as const;
  constructor(public readonly connector_id: string) {
    super(`Connector ${connector_id} not found`);
    this.name = 'ConnectorNotFoundError';
  }
}

export class NotImplementedError extends Error {
  readonly code = 'NOT_IMPLEMENTED' as const;
  constructor(public readonly feature: string) {
    super(`Feature not implemented: ${feature}`);
    this.name = 'NotImplementedError';
  }
}

export class CredentialValidationError extends Error {
  readonly code = 'CREDENTIAL_VALIDATION_ERROR' as const;
  constructor(
    public readonly connector_id: ConnectorId,
    public readonly errors: Array<{ field: string; message: string }>,
  ) {
    super(
      `Credential validation failed for ${connector_id}: ${errors.map((e) => `${e.field}: ${e.message}`).join('; ')}`,
    );
    this.name = 'CredentialValidationError';
  }
}

export class CircuitOpenError extends Error {
  readonly code = 'CIRCUIT_OPEN' as const;
  constructor(public readonly connector_id: ConnectorId) {
    super(`Circuit breaker open for ${connector_id}`);
    this.name = 'CircuitOpenError';
  }
}

export class AuthStateMismatchError extends Error {
  readonly code = 'AUTH_STATE_MISMATCH' as const;
  constructor() {
    super('OAuth callback state does not match auth start state');
    this.name = 'AuthStateMismatchError';
  }
}
