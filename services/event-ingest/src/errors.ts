/**
 * Event-ingest — error types (Phase 17 W1).
 *
 * Wire-format errors are returned to the client with a JSON body
 * { error: { code, message } }. The codes here are the canonical names
 * documented in contracts/openapi/v1/analytics.yaml.
 */

export class IngestError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: 400 | 401 | 403 | 413 | 415 | 429 | 500 | 503 = 400,
  ) {
    super(message);
    this.name = 'IngestError';
  }
}

/** HMAC signature mismatch / missing. */
export class SignatureError extends IngestError {
  constructor(message = 'invalid or missing HMAC signature') {
    super('invalid_signature', message, 401);
    this.name = 'SignatureError';
  }
}

/** Replay nonce already seen. */
export class ReplayError extends IngestError {
  constructor(message = 'nonce already seen (replay)') {
    super('replay_detected', message, 401);
    this.name = 'ReplayError';
  }
}

/** Batch is too large or too long. */
export class PayloadTooLargeError extends IngestError {
  constructor(message: string) {
    super('payload_too_large', message, 413);
    this.name = 'PayloadTooLargeError';
  }
}

/** Content-Type not application/json. */
export class UnsupportedMediaTypeError extends IngestError {
  constructor(message = 'content-type must be application/json') {
    super('unsupported_media_type', message, 415);
    this.name = 'UnsupportedMediaTypeError';
  }
}

/** Schema validation failed. */
export class SchemaError extends IngestError {
  constructor(message: string) {
    super('schema_mismatch', message, 400);
    this.name = 'SchemaError';
  }
}

/** Privacy mode rejected (e.g. anon_no_track). */
export class ConsentError extends IngestError {
  constructor(message: string) {
    super('consent_required', message, 403);
    this.name = 'ConsentError';
  }
}

/** Clock skew exceeds the limit. */
export class ClockSkewError extends IngestError {
  constructor(message: string) {
    super('clock_skew', message, 400);
    this.name = 'ClockSkewError';
  }
}

/** Kafka producer is exhausted and the disk spool is also offline. */
export class IngestUnavailableError extends IngestError {
  constructor(message = 'ingest temporarily unavailable; please retry') {
    super('unavailable', message, 503);
    this.name = 'IngestUnavailableError';
  }
}

/** Coerce any thrown value into an IngestError. */
export function toIngestError(err: unknown): IngestError {
  if (err instanceof IngestError) return err;
  if (err instanceof Error) {
    return new IngestError('internal_error', err.message, 500);
  }
  return new IngestError('internal_error', String(err), 500);
}
