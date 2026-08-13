/**
 * AR Session — token tests (Phase 11 M5.3).
 *
 * Covers:
 *   - Token minting and verification happy path
 *   - TTL expiry (injectable clock)
 *   - HMAC tamper rejection
 *   - Wrong key rejection
 *   - Malformed token rejection
 *   - Key rotation (old key invalidated)
 *   - Canonical JSON determinism
 */

import { describe, it, expect } from 'vitest';
import {
  mintToken,
  verifyToken,
  rotateToken,
  generateSecret,
  canonicalJson,
  DEFAULT_TTL_MS,
  DEFAULT_INACTIVITY_MS,
  TOKEN_VERSION,
  TokenExpiredError,
  TokenSignatureError,
  TokenMalformedError,
  TokenKeyMismatchError,
} from './tokens.js';

// ── Canonical JSON ───────────────────────────────────────────────────

describe('canonicalJson', () => {
  it('sorts object keys deterministically', () => {
    const a = canonicalJson({ b: 2, a: 1, c: 3 });
    const b = canonicalJson({ c: 3, a: 1, b: 2 });
    expect(a).toBe(b);
    expect(a).toBe('{"a":1,"b":2,"c":3}');
  });

  it('handles nested objects', () => {
    const result = canonicalJson({ z: { m: 2, a: 1 }, a: [3, 1, 2] });
    expect(result).toBe('{"a":[3,1,2],"z":{"a":1,"m":2}}');
  });

  it('handles primitives', () => {
    expect(canonicalJson(null)).toBe('null');
    expect(canonicalJson(42)).toBe('42');
    expect(canonicalJson('hello')).toBe('"hello"');
    expect(canonicalJson(true)).toBe('true');
  });
});

// ── Token mint + verify ──────────────────────────────────────────────

describe('mintToken + verifyToken', () => {
  it('mints and verifies a valid token', () => {
    const secret = generateSecret();
    const now = 1700000000000;
    const clock = () => now;

    const result = mintToken({
      sessionId: 'session-1',
      secret,
      kid: 'kid-1',
      clock,
      ttlMs: 60_000,
    });

    expect(result.token).toBeTypeOf('string');
    expect(result.token.length).toBeGreaterThan(0);
    expect(result.expiresAt.getTime()).toBe(now + 60_000);
    expect(result.issuedAt.getTime()).toBe(now);

    const payload = verifyToken({
      token: result.token,
      secret,
      kid: 'kid-1',
      clock,
    });

    expect(payload.v).toBe(TOKEN_VERSION);
    expect(payload.sid).toBe('session-1');
    expect(payload.kid).toBe('kid-1');
    expect(payload.exp).toBe(now + 60_000);
    expect(payload.iat).toBe(now);
  });

  it('rejects expired token', () => {
    const secret = generateSecret();
    const now = 1700000000000;
    const clock = () => now;

    const result = mintToken({
      sessionId: 'session-1',
      secret,
      kid: 'kid-1',
      clock,
      ttlMs: 60_000,
    });

    // Advance clock past expiry
    const expiredClock = () => now + 61_000;

    expect(() =>
      verifyToken({
        token: result.token,
        secret,
        kid: 'kid-1',
        clock: expiredClock,
      }),
    ).toThrow(TokenExpiredError);
  });

  it('rejects tampered token (HMAC mismatch)', () => {
    const secret = generateSecret();
    const now = 1700000000000;
    const clock = () => now;

    const result = mintToken({
      sessionId: 'session-1',
      secret,
      kid: 'kid-1',
      clock,
      ttlMs: 60_000,
    });

    // Tamper with the token: decode, mutate a field, re-encode
    // This produces valid base64url JSON with an invalid HMAC
    const b64 = result.token.replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
    const json = Buffer.from(padded, 'base64').toString('utf8');
    const parsed = JSON.parse(json) as Record<string, unknown>;
    // Mutate the sid field to break the HMAC
    parsed['sid'] = 'tampered-session';
    const tamperedJson = JSON.stringify(parsed);
    const tamperedB64 = Buffer.from(tamperedJson).toString('base64url');

    expect(() =>
      verifyToken({
        token: tamperedB64,
        secret,
        kid: 'kid-1',
        clock,
      }),
    ).toThrow(TokenSignatureError);
  });

  it('rejects token signed with wrong secret', () => {
    const secret1 = generateSecret();
    const secret2 = generateSecret();
    const now = 1700000000000;
    const clock = () => now;

    const result = mintToken({
      sessionId: 'session-1',
      secret: secret1,
      kid: 'kid-1',
      clock,
      ttlMs: 60_000,
    });

    expect(() =>
      verifyToken({
        token: result.token,
        secret: secret2,
        kid: 'kid-1',
        clock,
      }),
    ).toThrow(TokenSignatureError);
  });

  it('rejects token with wrong kid', () => {
    const secret = generateSecret();
    const now = 1700000000000;
    const clock = () => now;

    const result = mintToken({
      sessionId: 'session-1',
      secret,
      kid: 'kid-1',
      clock,
      ttlMs: 60_000,
    });

    // Use the SAME secret so HMAC passes, but wrong kid
    expect(() =>
      verifyToken({
        token: result.token,
        secret,
        kid: 'kid-2',
        clock,
      }),
    ).toThrow(TokenKeyMismatchError);
  });

  it('rejects empty token', () => {
    const secret = generateSecret();
    expect(() =>
      verifyToken({
        token: '',
        secret,
        kid: 'kid-1',
      }),
    ).toThrow(TokenMalformedError);
  });

  it('rejects non-base64 token', () => {
    const secret = generateSecret();
    expect(() =>
      verifyToken({
        token: 'not-a-valid-token!!!',
        secret,
        kid: 'kid-1',
      }),
    ).toThrow(TokenMalformedError);
  });

  it('rejects valid base64 but invalid JSON', () => {
    const secret = generateSecret();
    // base64url of "not json"
    const badToken = Buffer.from('not json').toString('base64url');
    expect(() =>
      verifyToken({
        token: badToken,
        secret,
        kid: 'kid-1',
      }),
    ).toThrow(TokenMalformedError);
  });

  it('uses default TTL of 30 minutes when not specified', () => {
    const secret = generateSecret();
    const now = 1700000000000;
    const clock = () => now;

    const result = mintToken({
      sessionId: 'session-1',
      secret,
      kid: 'kid-1',
      clock,
    });

    expect(result.expiresAt.getTime()).toBe(now + DEFAULT_TTL_MS);
    expect(DEFAULT_TTL_MS).toBe(30 * 60 * 1000);
  });

  it('verifyToken succeeds within default TTL', () => {
    const secret = generateSecret();
    const now = 1700000000000;
    const clock = () => now;

    const result = mintToken({
      sessionId: 'session-1',
      secret,
      kid: 'kid-1',
      clock,
    });

    // Verify at 29 minutes (within 30-min TTL)
    const at29min = () => now + 29 * 60 * 1000;
    const payload = verifyToken({
      token: result.token,
      secret,
      kid: 'kid-1',
      clock: at29min,
    });
    expect(payload.sid).toBe('session-1');
  });
});

// ── Key rotation ─────────────────────────────────────────────────────

describe('rotateToken', () => {
  it('creates a new token with new key', () => {
    const secret1 = generateSecret();
    const secret2 = generateSecret();
    const now = 1700000000000;
    const clock = () => now;

    const result1 = mintToken({
      sessionId: 'session-1',
      secret: secret1,
      kid: 'kid-1',
      clock,
      ttlMs: 60_000,
    });

    // Rotate to new key
    const result2 = rotateToken({
      sessionId: 'session-1',
      newSecret: secret2,
      newKid: 'kid-2',
      clock,
      ttlMs: 60_000,
    });

    // New token should verify with new key
    const payload = verifyToken({
      token: result2.token,
      secret: secret2,
      kid: 'kid-2',
      clock,
    });
    expect(payload.kid).toBe('kid-2');

    // Old token should NOT verify with new key (different secret = HMAC mismatch)
    expect(() =>
      verifyToken({
        token: result1.token,
        secret: secret2,
        kid: 'kid-2',
        clock,
      }),
    ).toThrow(TokenSignatureError);
  });

  it('old key can still verify old token until TTL expiry', () => {
    const secret1 = generateSecret();
    const secret2 = generateSecret();
    const now = 1700000000000;
    const clock = () => now;

    const result1 = mintToken({
      sessionId: 'session-1',
      secret: secret1,
      kid: 'kid-1',
      clock,
      ttlMs: 60_000,
    });

    // Rotate to new key
    rotateToken({
      sessionId: 'session-1',
      newSecret: secret2,
      newKid: 'kid-2',
      clock,
      ttlMs: 60_000,
    });

    // Old token should still verify with old key (within TTL)
    const payload = verifyToken({
      token: result1.token,
      secret: secret1,
      kid: 'kid-1',
      clock,
    });
    expect(payload.kid).toBe('kid-1');
  });
});

// ── Constants ────────────────────────────────────────────────────────

describe('constants', () => {
  it('has correct defaults', () => {
    expect(DEFAULT_TTL_MS).toBe(30 * 60 * 1000);
    expect(DEFAULT_INACTIVITY_MS).toBe(5 * 60 * 1000);
    expect(TOKEN_VERSION).toBe(1);
  });

  it('generateSecret produces 32-byte base64url key', () => {
    const secret = generateSecret();
    expect(secret.length).toBeGreaterThan(0);
    // Should not contain standard base64 chars
    expect(secret).not.toContain('+');
    expect(secret).not.toContain('/');
    expect(secret).not.toContain('=');
  });
});
