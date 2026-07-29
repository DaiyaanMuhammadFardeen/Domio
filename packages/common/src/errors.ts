/**
 * Domio error taxonomy. Mirrors the proto ErrorCode enum so the same
 * codes travel across the wire.
 */

export type ErrorCode =
  | 'internal'
  | 'unavailable'
  | 'timeout'
  | 'cancelled'
  | 'deprecated'
  | 'unauthenticated'
  | 'forbidden'
  | 'permission_denied'
  | 'tenant_isolation'
  | 'brand_lock_violation'
  | 'invalid_argument'
  | 'out_of_range'
  | 'required'
  | 'already_exists'
  | 'not_found'
  | 'conflict'
  | 'precondition_failed'
  | 'idempotency_key_reused'
  | 'idempotency_key_conflict'
  | 'rate_limited'
  | 'quota_exceeded'
  | 'upstream_failure'
  | 'vendor_rejected';

export interface DomioErrorOptions {
  code: ErrorCode;
  message: string;
  details?: Record<string, string>;
  trace_id?: string;
  retryable?: boolean;
  retry_after_seconds?: number;
  cause?: unknown;
}

export class DomioError extends Error {
  public readonly code: ErrorCode;
  public readonly details: Record<string, string>;
  public readonly trace_id: string | undefined;
  public readonly retryable: boolean;
  public readonly retry_after_seconds: number | undefined;
  public override readonly cause: unknown;

  constructor(options: DomioErrorOptions) {
    super(options.message);
    this.name = 'DomioError';
    this.code = options.code;
    this.details = options.details ?? {};
    this.trace_id = options.trace_id;
    this.retryable = options.retryable ?? false;
    this.retry_after_seconds = options.retry_after_seconds;
    this.cause = options.cause;
  }

  toJSON(): {
    code: ErrorCode;
    message: string;
    details: Record<string, string>;
    trace_id: string | undefined;
    retryable: boolean;
    retry_after_seconds: number | undefined;
  } {
    return {
      code: this.code,
      message: this.message,
      details: this.details,
      trace_id: this.trace_id,
      retryable: this.retryable,
      retry_after_seconds: this.retry_after_seconds,
    };
  }
}

export function isDomioError(e: unknown): e is DomioError {
  return e instanceof DomioError;
}
