import { describe, it, expect } from 'vitest';
import { isValidIdempotencyKey, clientIdempotencyKey } from './idempotency.js';

describe('idempotency', () => {
  it('accepts a valid key', () => {
    expect(isValidIdempotencyKey('12345678')).toBe(true);
    expect(isValidIdempotencyKey('abcd-1234-EFGH-5678')).toBe(true);
  });

  it('rejects too-short keys', () => {
    expect(isValidIdempotencyKey('short')).toBe(false);
  });

  it('rejects keys with bad characters', () => {
    expect(isValidIdempotencyKey('with spaces here')).toBe(false);
    expect(isValidIdempotencyKey('with/slash..............')).toBe(false);
  });

  it('generates a unique client key', () => {
    const a = clientIdempotencyKey();
    const b = clientIdempotencyKey();
    expect(a).not.toBe(b);
    expect(isValidIdempotencyKey(a)).toBe(true);
  });
});
