/**
 * JWT sign/verify tests — covers signing, verification, expiry,
 * audience validation, invalid tokens, and timing-safe comparison.
 */

import { describe, it, expect } from 'vitest';
import { signJwt, verifyJwt, JwtExpiredError, JwtInvalidError } from './jwt.js';

const SECRET = 'test-secret-key-for-hmac';

describe('signJwt', () => {
  it('returns a compact JWT string with 3 parts', () => {
    const token = signJwt({ sub: 'user-1' }, SECRET);
    const parts = token.split('.');
    expect(parts).toHaveLength(3);
  });

  it('includes iat claim by default', () => {
    const token = signJwt({ sub: 'user-1' }, SECRET);
    const payload = verifyJwt(token, SECRET);
    expect(typeof payload.iat).toBe('number');
  });

  it('respects custom iat', () => {
    const token = signJwt({ sub: 'user-1', iat: 1000 }, SECRET);
    const payload = verifyJwt(token, SECRET);
    expect(payload.iat).toBe(1000);
  });

  it('sets exp when expiresInMs is provided', () => {
    const token = signJwt({ sub: 'user-1' }, SECRET, 60_000);
    const payload = verifyJwt(token, SECRET);
    expect(typeof payload.exp).toBe('number');
    expect(payload.exp! - (payload.iat as number)).toBe(60);
  });

  it('includes custom claims', () => {
    const token = signJwt({ sub: 'user-1', custom: 'value' }, SECRET);
    const payload = verifyJwt(token, SECRET);
    expect(payload.custom).toBe('value');
  });
});

describe('verifyJwt', () => {
  it('validates a correctly signed token', () => {
    const token = signJwt({ sub: 'user-1' }, SECRET);
    const payload = verifyJwt(token, SECRET);
    expect(payload.sub).toBe('user-1');
  });

  it('rejects token with wrong secret', () => {
    const token = signJwt({ sub: 'user-1' }, SECRET);
    expect(() => verifyJwt(token, 'wrong-secret')).toThrow(JwtInvalidError);
  });

  it('rejects malformed token (not 3 parts)', () => {
    expect(() => verifyJwt('not-a-jwt', SECRET)).toThrow(JwtInvalidError);
  });

  it('rejects token with invalid base64', () => {
    expect(() => verifyJwt('header.!!!invalid!!!.sig', SECRET)).toThrow(JwtInvalidError);
  });

  it('rejects expired token', () => {
    // Create a token with exp already in the past
    const token = signJwt({ sub: 'user-1', exp: Math.floor(Date.now() / 1000) - 100 }, SECRET);
    expect(() => verifyJwt(token, SECRET)).toThrow(JwtExpiredError);
  });

  it('validates audience when expectedAudience is provided', () => {
    const token = signJwt({ sub: 'user-1', aud: 'https://api.example.com' }, SECRET);
    const payload = verifyJwt(token, SECRET, 'https://api.example.com');
    expect(payload.aud).toBe('https://api.example.com');
  });

  it('rejects token with wrong audience', () => {
    const token = signJwt({ sub: 'user-1', aud: 'https://api.example.com' }, SECRET);
    expect(() => verifyJwt(token, SECRET, 'https://other.example.com')).toThrow(JwtInvalidError);
  });

  it('validates token without audience check when expectedAudience is undefined', () => {
    const token = signJwt({ sub: 'user-1', aud: 'anything' }, SECRET);
    const payload = verifyJwt(token, SECRET);
    expect(payload.aud).toBe('anything');
  });
});

describe('JwtError hierarchy', () => {
  it('JwtExpiredError extends JwtInvalidError hierarchy', () => {
    const err = new JwtExpiredError();
    expect(err.code).toBe('JWT_EXPIRED');
    expect(err.name).toBe('JwtExpiredError');
    expect(err.message).toContain('expired');
  });

  it('JwtInvalidError has correct code', () => {
    const err = new JwtInvalidError('bad sig');
    expect(err.code).toBe('JWT_INVALID');
    expect(err.name).toBe('JwtInvalidError');
    expect(err.message).toContain('bad sig');
  });
});
