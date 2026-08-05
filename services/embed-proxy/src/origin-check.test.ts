/**
 * Origin checking tests — covers exact match, subdomain match,
 * evil-subdomain denial, empty-origin handling, scheme/port matching,
 * and deny-all (empty allowlist) behavior.
 */

import { describe, it, expect } from 'vitest';
import { isAllowedOrigin } from './origin-check.js';
import { DEFAULT_POLICY, type EmbedPolicy } from './policies.js';

function makePolicy(overrides: Partial<Pick<EmbedPolicy, 'allowedOrigins'>> = {}): EmbedPolicy {
  return {
    ...DEFAULT_POLICY,
    allowedOrigins: overrides.allowedOrigins ?? [],
  };
}

describe('isAllowedOrigin — deny-all (empty allowlist)', () => {
  it('denies all origins when allowlist is empty', () => {
    const policy = makePolicy({ allowedOrigins: [] });
    expect(isAllowedOrigin(policy, 'https://app.example.com')).toBe(false);
  });

  it('denies undefined origin when allowlist is empty', () => {
    const policy = makePolicy({ allowedOrigins: [] });
    expect(isAllowedOrigin(policy, undefined)).toBe(false);
  });

  it('denies "null" origin when allowlist is empty', () => {
    const policy = makePolicy({ allowedOrigins: [] });
    expect(isAllowedOrigin(policy, 'null')).toBe(false);
  });
});

describe('isAllowedOrigin — exact match', () => {
  it('allows exact origin match', () => {
    const policy = makePolicy({ allowedOrigins: ['https://app.example.com'] });
    expect(isAllowedOrigin(policy, 'https://app.example.com')).toBe(true);
  });

  it('denies non-matching origin', () => {
    const policy = makePolicy({ allowedOrigins: ['https://app.example.com'] });
    expect(isAllowedOrigin(policy, 'https://other.example.com')).toBe(false);
  });

  it('allows multiple exact origins', () => {
    const policy = makePolicy({
      allowedOrigins: ['https://app1.example.com', 'https://app2.example.com'],
    });
    expect(isAllowedOrigin(policy, 'https://app1.example.com')).toBe(true);
    expect(isAllowedOrigin(policy, 'https://app2.example.com')).toBe(true);
    expect(isAllowedOrigin(policy, 'https://app3.example.com')).toBe(false);
  });
});

describe('isAllowedOrigin — subdomain match', () => {
  it('allows subdomain of allowed origin', () => {
    const policy = makePolicy({ allowedOrigins: ['https://example.com'] });
    expect(isAllowedOrigin(policy, 'https://app.example.com')).toBe(true);
  });

  it('allows deeply nested subdomain', () => {
    const policy = makePolicy({ allowedOrigins: ['https://example.com'] });
    expect(isAllowedOrigin(policy, 'https://a.b.c.example.com')).toBe(true);
  });

  it('denies evil-subdomain that looks similar', () => {
    const policy = makePolicy({ allowedOrigins: ['https://example.com'] });
    expect(isAllowedOrigin(policy, 'https://evil-example.com')).toBe(false);
  });

  it('denies suffix match (not subdomain)', () => {
    const policy = makePolicy({ allowedOrigins: ['https://example.com'] });
    expect(isAllowedOrigin(policy, 'https://notexample.com')).toBe(false);
  });

  it('denies domain with different TLD', () => {
    const policy = makePolicy({ allowedOrigins: ['https://example.com'] });
    expect(isAllowedOrigin(policy, 'https://example.org')).toBe(false);
  });
});

describe('isAllowedOrigin — scheme matching', () => {
  it('denies http when policy allows https', () => {
    const policy = makePolicy({ allowedOrigins: ['https://example.com'] });
    expect(isAllowedOrigin(policy, 'http://example.com')).toBe(false);
  });

  it('allows https when policy allows https', () => {
    const policy = makePolicy({ allowedOrigins: ['https://example.com'] });
    expect(isAllowedOrigin(policy, 'https://example.com')).toBe(true);
  });
});

describe('isAllowedOrigin — port matching', () => {
  it('denies non-standard port when policy specifies none', () => {
    const policy = makePolicy({ allowedOrigins: ['https://example.com'] });
    expect(isAllowedOrigin(policy, 'https://example.com:8443')).toBe(false);
  });

  it('allows matching port', () => {
    const policy = makePolicy({ allowedOrigins: ['https://example.com:8443'] });
    expect(isAllowedOrigin(policy, 'https://example.com:8443')).toBe(true);
  });

  it('denies different port', () => {
    const policy = makePolicy({ allowedOrigins: ['https://example.com:8443'] });
    expect(isAllowedOrigin(policy, 'https://example.com:9000')).toBe(false);
  });
});

describe('isAllowedOrigin — empty origin (non-browser)', () => {
  it('denies undefined origin when policy does not include empty string', () => {
    const policy = makePolicy({ allowedOrigins: ['https://example.com'] });
    expect(isAllowedOrigin(policy, undefined)).toBe(false);
  });

  it('allows undefined origin when policy explicitly includes empty string', () => {
    const policy = makePolicy({ allowedOrigins: ['https://example.com', ''] });
    expect(isAllowedOrigin(policy, undefined)).toBe(true);
  });

  it('denies "null" origin when policy does not include empty string', () => {
    const policy = makePolicy({ allowedOrigins: ['https://example.com'] });
    expect(isAllowedOrigin(policy, 'null')).toBe(false);
  });

  it('allows "null" origin when policy includes empty string', () => {
    const policy = makePolicy({ allowedOrigins: ['https://example.com', ''] });
    expect(isAllowedOrigin(policy, 'null')).toBe(true);
  });

  it('allows empty string origin when policy includes empty string', () => {
    const policy = makePolicy({ allowedOrigins: [''] });
    expect(isAllowedOrigin(policy, '')).toBe(true);
  });
});

describe('isAllowedOrigin — default policy', () => {
  it('default policy denies everything', () => {
    expect(isAllowedOrigin(DEFAULT_POLICY, 'https://example.com')).toBe(false);
    expect(isAllowedOrigin(DEFAULT_POLICY, undefined)).toBe(false);
  });
});
