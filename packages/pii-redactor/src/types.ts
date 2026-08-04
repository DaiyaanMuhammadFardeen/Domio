/**
 * PII redactor — public types.
 *
 * The redactor is field-aware: it consults a `fields` list (case-insensitive
 * match on the property name) and replaces values at those paths with a
 * deterministic placeholder. This is deliberately conservative — when
 * called with `redact(value, fields)` the redactor never inspects the
 * *content* of free-form values, only their keys, so there is no risk of
 * false positives leaking data into the telemetry stream.
 */

export type RedactionPolicy = 'mask' | 'hash' | 'drop';

export interface PiiRedactorOptions {
  /**
   * Fields to redact. Keys are matched case-insensitively. Use dotted
   * notation (`user.email`) to reach into nested objects.
   */
  readonly fields: readonly string[];
  /**
   * Redaction strategy. Defaults to `mask` which replaces the value with
   * `'[redacted]'`. `hash` produces a stable SHA-256 fingerprint so the
   * server can dedupe without seeing the plaintext. `drop` removes the
   * key entirely.
   */
  readonly policy?: RedactionPolicy;
  /**
   * Replacement string used for `mask` policy. Defaults to `'[redacted]'`.
   */
  readonly maskValue?: string;
}

export interface RedactResult<T> {
  readonly value: T;
  readonly redactedFields: readonly string[];
}