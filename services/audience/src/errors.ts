/**
 * @domio/audience-service — error types.
 *
 * Phase 16 W1. Engines throw these to let the route adapter translate
 * into HTTP/WS errors without re-routing through the OO hierarchy.
 */

export class AudienceError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
    this.name = 'AudienceError';
  }
}

export class AudienceSessionNotFoundError extends AudienceError {
  constructor(code: string) {
    super(404, 'SESSION_NOT_FOUND', `audience session not found: ${code}`);
    this.name = 'AudienceSessionNotFoundError';
  }
}

export class AudienceSessionEndedError extends AudienceError {
  constructor(code: string) {
    super(410, 'SESSION_ENDED', `audience session has ended: ${code}`);
    this.name = 'AudienceSessionEndedError';
  }
}

export class AudienceRateLimitedError extends AudienceError {
  readonly retry_after_ms: number;
  constructor(retry_after_ms: number) {
    super(429, 'RATE_LIMITED', 'too many submissions; retry later');
    this.retry_after_ms = retry_after_ms;
    this.name = 'AudienceRateLimitedError';
  }
}

export class AudienceValidationError extends AudienceError {
  constructor(detail: string) {
    super(400, 'VALIDATION', detail);
    this.name = 'AudienceValidationError';
  }
}

export class AudienceModerationError extends AudienceError {
  constructor(detail: string) {
    super(422, 'MODERATION_REJECTED', detail);
    this.name = 'AudienceModerationError';
  }
}

export class AudienceConflictError extends AudienceError {
  constructor(detail: string) {
    super(409, 'CONFLICT', detail);
    this.name = 'AudienceConflictError';
  }
}
