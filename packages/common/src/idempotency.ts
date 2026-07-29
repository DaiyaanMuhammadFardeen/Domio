/**
 * Idempotency-key validation.
 *
 * Clients must supply a unique key for every state-changing request.
 * The same key with the same body returns the cached response within 24
 * hours. Different bodies with the same key return
 * `idempotency_key_conflict`.
 */

const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;

export function isValidIdempotencyKey(key: string): boolean {
  return IDEMPOTENCY_KEY_PATTERN.test(key);
}

export function clientIdempotencyKey(prefix = 'domio'): string {
  return `${prefix}-${globalThis.crypto.randomUUID()}`;
}
