import { describe, it, expect } from 'vitest';
import { DomioError, isDomioError } from './errors.js';

describe('DomioError', () => {
  it('captures code, message, and retryable hint', () => {
    const e = new DomioError({
      code: 'not_found',
      message: 'Deck not found',
      retryable: false,
    });
    expect(e.code).toBe('not_found');
    expect(e.message).toBe('Deck not found');
    expect(e.retryable).toBe(false);
    expect(e.name).toBe('DomioError');
  });

  it('serializes to JSON with the right shape', () => {
    const e = new DomioError({
      code: 'rate_limited',
      message: 'Too many requests',
      retryable: true,
      retry_after_seconds: 30,
    });
    expect(e.toJSON()).toMatchObject({
      code: 'rate_limited',
      message: 'Too many requests',
      retryable: true,
      retry_after_seconds: 30,
    });
  });

  it('isDomioError discriminates correctly', () => {
    const e: unknown = new DomioError({ code: 'conflict', message: '' });
    expect(isDomioError(e)).toBe(true);
    expect(isDomioError(new Error('plain'))).toBe(false);
    expect(isDomioError(null)).toBe(false);
  });
});
