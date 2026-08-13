import { describe, it, expect } from 'vitest';
import { hashViewerId, hashEmail, classifyIp } from './hash.js';

describe('hashViewerId', () => {
  it('produces a 64-char hex string', () => {
    const h = hashViewerId('abc', 'salt-1');
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is deterministic for the same input + salt', () => {
    expect(hashViewerId('abc', 'salt-1')).toBe(hashViewerId('abc', 'salt-1'));
  });

  it('changes with the salt', () => {
    expect(hashViewerId('abc', 'salt-1')).not.toBe(hashViewerId('abc', 'salt-2'));
  });

  it('rejects empty inputs', () => {
    expect(() => hashViewerId('', 'salt')).toThrow(/required/);
    expect(() => hashViewerId('abc', '')).toThrow(/required/);
  });
});

describe('hashEmail', () => {
  it('is case-insensitive', () => {
    expect(hashEmail('Foo@Bar.com', 's')).toBe(hashEmail('foo@bar.com', 's'));
  });

  it('is whitespace-insensitive', () => {
    expect(hashEmail(' foo@bar.com ', 's')).toBe(hashEmail('foo@bar.com', 's'));
  });

  it('truncates to 32 hex chars', () => {
    expect(hashEmail('foo@bar.com', 's')).toMatch(/^[0-9a-f]{32}$/);
  });
});

describe('classifyIp', () => {
  it('tags 103.x as BD (Bangladesh residency cohort)', () => {
    expect(classifyIp('103.10.20.30')).toBe('bd');
  });

  it('tags RFC1918 ranges as unknown', () => {
    expect(classifyIp('10.0.0.1')).toBe('unknown');
    expect(classifyIp('192.168.1.1')).toBe('unknown');
    expect(classifyIp('127.0.0.1')).toBe('unknown');
  });

  it('returns unknown for empty input', () => {
    expect(classifyIp('')).toBe('unknown');
  });
});
