/**
 * @domio/audit-service — types and constants.
 *
 * P20.5 B2 (lightweight audit log). Covers the action enum from §4.2.3 of
 * `docs/development_phases/phase-20.5-beta-security-hardening.md`.
 *
 * Append-only: every state-changing action in the application writes a row
 * via {@link AuditService.emit}. No hash chain, no ClickHouse, no WORM
 * bucket — that lands in full P20 WS-X2.
 */

// ---------------------------------------------------------------------------
// Action enum — covers all P20.5 §4.2.3 actions
// ---------------------------------------------------------------------------

export const AUDIT_ACTIONS = [
  'auth.login',
  'auth.login_failure',
  'auth.logout',
  'auth.mfa_enrolled',
  'auth.mfa_unenrolled',
  'auth.password_changed',
  'user.created',
  'user.disabled',
  'user.role_changed',
  'deck.created',
  'deck.edited',
  'deck.deleted',
  'deck.shared',
  'deck.unshared',
  'deck.exported',
  'share.created',
  'share.revoked',
  'billing.changed',
  'dlp.warning_shown',
  'dlp.bypass_acknowledged',
  'policy.denied',
  'rate_limit.exceeded',
  'rate_limit.anomaly',
  'tenant.circuit_breaker_engaged',
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export const ACTOR_KINDS = ['user', 'api_key', 'system', 'anonymous'] as const;
export type ActorKind = (typeof ACTOR_KINDS)[number];

// ---------------------------------------------------------------------------
// Domain models
// ---------------------------------------------------------------------------

export interface AuditEvent {
  readonly id: string;
  readonly tenantId: string;
  readonly actorId: string | null;
  readonly actorKind: ActorKind;
  readonly action: AuditAction;
  readonly targetKind: string | null;
  readonly targetId: string | null;
  readonly metadata: Record<string, unknown>;
  readonly ip: string | null;
  readonly userAgent: string | null;
  readonly createdAt: Date;
}

export interface AuditEventInput {
  readonly tenantId: string;
  readonly actorId?: string | null;
  readonly actorKind?: ActorKind;
  readonly action: AuditAction;
  readonly targetKind?: string | null;
  readonly targetId?: string | null;
  readonly metadata?: Record<string, unknown>;
  readonly ip?: string | null;
  readonly userAgent?: string | null;
}

export interface AuditQuery {
  readonly tenantId: string;
  readonly actorId?: string;
  readonly action?: AuditAction | readonly AuditAction[];
  readonly targetKind?: string;
  readonly targetId?: string;
  /** Inclusive lower bound on `createdAt`. */
  readonly from?: Date;
  /** Exclusive upper bound on `createdAt`. */
  readonly to?: Date;
  readonly limit?: number;
  readonly offset?: number;
}

export interface AuditQueryResult {
  readonly events: readonly AuditEvent[];
  readonly total: number;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class AuditValidationError extends Error {
  readonly code = 'AUDIT_VALIDATION_ERROR' as const;
  constructor(message: string) {
    super(message);
    this.name = 'AuditValidationError';
  }
}

/**
 * Retention run result. Plain data record; constructed by the service and
 * returned from {@link AuditService.runRetention}.
 */
export class AuditRetentionRunRecord {
  constructor(
    public readonly tenantId: string,
    public readonly runAt: Date,
    public readonly rowsDeleted: number,
  ) {}
}

// ---------------------------------------------------------------------------
// Default limits
// ---------------------------------------------------------------------------

export const DEFAULT_QUERY_LIMIT = 50;
export const MAX_QUERY_LIMIT = 500;
export const DEFAULT_RETENTION_DAYS = 90;

// Reserved metadata keys that must NEVER carry sensitive payloads (per
// §6.1 verification matrix "sensitive fields never appear in metadata").
export const FORBIDDEN_METADATA_KEYS = [
  'password',
  'password_hash',
  'mfa_secret',
  'mfa_secret_enc',
  'token',
  'access_token',
  'refresh_token',
  'session_token',
  'credit_card',
  'ssn',
  'social_security_number',
] as const;

/** Reserved fields that store-and-retrieve callers can pass through. */
export const ALLOWED_IPV4_PATTERN = /^(\d{1,3}\.){3}\d{1,3}$/;