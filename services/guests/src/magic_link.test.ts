/**
 * Magic-link pure logic tests (Phase 18).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  issueMagicLinkToken,
  isExpired,
  validateCapabilities,
  resolveTtlMinutes,
  DEFAULT_TTL_MINUTES,
  ALLOWED_CAPABILITIES,
  DEV_SECRET,
} from './magic_link.js';
import { InvalidCapabilityError } from './types.js';
import { createHash } from 'crypto';

describe('issueMagicLinkToken', () => {
  it('produces deterministic token for same inputs', () => {
    const expiresAt = new Date('2026-01-01T00:15:00Z');
    const r1 = issueMagicLinkToken('ga-001', 'guest@example.com', expiresAt, 'secret');
    const r2 = issueMagicLinkToken('ga-001', 'guest@example.com', expiresAt, 'secret');
    expect(r1.token).toBe(r2.token);
    expect(r1.tokenHash).toBe(r2.tokenHash);
  });

  it('produces different tokens for different nonces', () => {
    const expiresAt = new Date('2026-01-01T00:15:00Z');
    const r1 = issueMagicLinkToken('ga-001', 'guest@example.com', expiresAt, 'secret', 'nonce-1');
    const r2 = issueMagicLinkToken('ga-001', 'guest@example.com', expiresAt, 'secret', 'nonce-2');
    expect(r1.token).not.toBe(r2.token);
    expect(r1.tokenHash).not.toBe(r2.tokenHash);
  });

  it('tokenHash is SHA-256 hex of token', () => {
    const expiresAt = new Date('2026-01-01T00:15:00Z');
    const { token, tokenHash } = issueMagicLinkToken('ga-001', 'guest@example.com', expiresAt, 'secret');
    const expectedHash = createHash('sha256').update(token).digest('hex');
    expect(tokenHash).toBe(expectedHash);
  });

  it('different secrets produce different tokens', () => {
    const expiresAt = new Date('2026-01-01T00:15:00Z');
    const r1 = issueMagicLinkToken('ga-001', 'guest@example.com', expiresAt, 'secret1');
    const r2 = issueMagicLinkToken('ga-001', 'guest@example.com', expiresAt, 'secret2');
    expect(r1.token).not.toBe(r2.token);
  });

  it('uses DEV_SECRET when no secret provided', () => {
    const expiresAt = new Date('2026-01-01T00:15:00Z');
    const r1 = issueMagicLinkToken('ga-001', 'guest@example.com', expiresAt);
    const r2 = issueMagicLinkToken('ga-001', 'guest@example.com', expiresAt, DEV_SECRET);
    expect(r1.token).toBe(r2.token);
  });
});

describe('isExpired', () => {
  it('returns false when now is before expiresAt', () => {
    expect(isExpired(new Date('2026-01-01T00:15:00Z'), new Date('2026-01-01T00:14:59Z'))).toBe(false);
  });

  it('returns true when now equals expiresAt', () => {
    const t = new Date('2026-01-01T00:15:00Z');
    expect(isExpired(t, t)).toBe(true);
  });

  it('returns true when now is after expiresAt', () => {
    expect(isExpired(new Date('2026-01-01T00:15:00Z'), new Date('2026-01-01T00:15:01Z'))).toBe(true);
  });
});

describe('validateCapabilities', () => {
  it('accepts valid capabilities', () => {
    expect(() => validateCapabilities(['comment', 'suggest', 'view'])).not.toThrow();
    expect(() => validateCapabilities(['view'])).not.toThrow();
    expect(() => validateCapabilities([])).not.toThrow();
  });

  it('rejects download', () => {
    expect(() => validateCapabilities(['download'])).toThrow(InvalidCapabilityError);
  });

  it('rejects export', () => {
    expect(() => validateCapabilities(['export'])).toThrow(InvalidCapabilityError);
  });

  it('rejects unknown capability', () => {
    expect(() => validateCapabilities(['admin'])).toThrow(InvalidCapabilityError);
  });

  it('rejects if any single capability is invalid', () => {
    expect(() => validateCapabilities(['comment', 'download'])).toThrow(InvalidCapabilityError);
  });
});

describe('resolveTtlMinutes', () => {
  const OLD_ENV = process.env['GUEST_MAGIC_LINK_TTL_MINUTES'];

  beforeEach(() => {
    if (OLD_ENV !== undefined) {
      process.env['GUEST_MAGIC_LINK_TTL_MINUTES'] = OLD_ENV;
    } else {
      delete process.env['GUEST_MAGIC_LINK_TTL_MINUTES'];
    }
  });

  it('returns override when provided', () => {
    expect(resolveTtlMinutes(30)).toBe(30);
  });

  it('returns default when no override and no env', () => {
    delete process.env['GUEST_MAGIC_LINK_TTL_MINUTES'];
    expect(resolveTtlMinutes()).toBe(DEFAULT_TTL_MINUTES);
  });

  it('reads from GUEST_MAGIC_LINK_TTL_MINUTES env', () => {
    process.env['GUEST_MAGIC_LINK_TTL_MINUTES'] = '45';
    expect(resolveTtlMinutes()).toBe(45);
  });

  it('falls back to default for invalid env', () => {
    process.env['GUEST_MAGIC_LINK_TTL_MINUTES'] = 'not-a-number';
    expect(resolveTtlMinutes()).toBe(DEFAULT_TTL_MINUTES);
  });

  it('override takes precedence over env', () => {
    process.env['GUEST_MAGIC_LINK_TTL_MINUTES'] = '45';
    expect(resolveTtlMinutes(10)).toBe(10);
  });
});

describe('ALLOWED_CAPABILITIES', () => {
  it('contains exactly comment, suggest, view', () => {
    expect(ALLOWED_CAPABILITIES).toEqual(['comment', 'suggest', 'view']);
  });
});
