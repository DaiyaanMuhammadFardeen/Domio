/**
 * Embed token tests — covers TTL expiry, single-use enforcement,
 * creation, consumption, and garbage collection.
 */

import { describe, it, expect } from 'vitest';
import {
  EmbedTokenService,
  TokenExpiredError,
  TokenAlreadyUsedError,
  TokenNotFoundError,
} from './tokens.js';

describe('EmbedTokenService', () => {
  function makeSvc(ttlMs = 5 * 60 * 1000) {
    let now = 1000;
    const clock = () => now;
    const svc = new EmbedTokenService({
      ttlMs,
      clock,
      generateToken: () => 'test-token-abc',
    });
    return { svc, getNow: () => now, advance: (ms: number) => { now += ms; } };
  }

  it('creates a token with correct fields', () => {
    const { svc } = makeSvc();
    const record = svc.create('binding-1', 'https://api.example.com/data');
    expect(record.token).toBe('test-token-abc');
    expect(record.bindingId).toBe('binding-1');
    expect(record.url).toBe('https://api.example.com/data');
    expect(record.used).toBe(false);
    expect(record.expiresAt.getTime()).toBe(1000 + 5 * 60 * 1000);
  });

  it('consume marks token as used and returns record', () => {
    const { svc } = makeSvc();
    svc.create('binding-1', 'https://api.example.com/data');
    const consumed = svc.consume('test-token-abc');
    expect(consumed.used).toBe(true);
    expect(consumed.bindingId).toBe('binding-1');
  });

  it('consume fails with TokenNotFoundError for unknown token', () => {
    const { svc } = makeSvc();
    expect(() => svc.consume('nonexistent')).toThrow(TokenNotFoundError);
  });

  it('consume fails with TokenAlreadyUsedError on second use', () => {
    const { svc } = makeSvc();
    svc.create('binding-1', 'https://api.example.com/data');
    svc.consume('test-token-abc');
    expect(() => svc.consume('test-token-abc')).toThrow(TokenAlreadyUsedError);
  });

  it('consume fails with TokenExpiredError after TTL', () => {
    const { svc, advance } = makeSvc(1000); // 1 second TTL
    svc.create('binding-1', 'https://api.example.com/data');
    advance(1001); // expire
    expect(() => svc.consume('test-token-abc')).toThrow(TokenExpiredError);
  });

  it('consume succeeds within TTL window', () => {
    const { svc, advance } = makeSvc(1000);
    svc.create('binding-1', 'https://api.example.com/data');
    advance(999); // still valid
    const consumed = svc.consume('test-token-abc');
    expect(consumed.used).toBe(true);
  });

  it('peek returns record without consuming', () => {
    const { svc } = makeSvc();
    svc.create('binding-1', 'https://api.example.com/data');
    const peeked = svc.peek('test-token-abc');
    expect(peeked).not.toBeNull();
    expect(peeked!.used).toBe(false);
    // Token should still be consumable
    const consumed = svc.consume('test-token-abc');
    expect(consumed.used).toBe(true);
  });

  it('peek returns null for unknown token', () => {
    const { svc } = makeSvc();
    expect(svc.peek('nonexistent')).toBeNull();
  });

  it('gc removes expired tokens', () => {
    let tokenSeq = 0;
    let now = 1000;
    const svc = new EmbedTokenService({
      ttlMs: 1000,
      clock: () => now,
      generateToken: () => `tok-${++tokenSeq}`,
    });
    svc.create('binding-1', 'https://a.com');
    svc.create('binding-2', 'https://b.com');
    now = 3000; // both expired (expiresAt = 2000)
    const removed = svc.gc();
    expect(removed).toBe(2);
  });

  it('gc returns 0 when no expired tokens', () => {
    const { svc } = makeSvc();
    svc.create('binding-1', 'https://a.com');
    expect(svc.gc()).toBe(0);
  });
});

describe('Token errors', () => {
  it('TokenExpiredError has correct code', () => {
    const err = new TokenExpiredError('tok-123');
    expect(err.code).toBe('TOKEN_EXPIRED');
    expect(err.name).toBe('TokenExpiredError');
    expect(err.message).toContain('tok-123');
  });

  it('TokenAlreadyUsedError has correct code', () => {
    const err = new TokenAlreadyUsedError('tok-456');
    expect(err.code).toBe('TOKEN_ALREADY_USED');
    expect(err.name).toBe('TokenAlreadyUsedError');
  });

  it('TokenNotFoundError has correct code', () => {
    const err = new TokenNotFoundError('tok-789');
    expect(err.code).toBe('TOKEN_NOT_FOUND');
    expect(err.name).toBe('TokenNotFoundError');
  });
});
