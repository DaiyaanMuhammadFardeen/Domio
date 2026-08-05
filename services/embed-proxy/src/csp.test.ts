/**
 * CSP header builder tests — covers frame-ancestors directive
 * with various allowedOrigins configurations, and focus-trap header.
 */

import { describe, it, expect } from 'vitest';
import { buildCspHeader, buildFocusTrapHeader } from './csp.js';
import { DEFAULT_POLICY, type EmbedPolicy } from './policies.js';

function makePolicy(overrides: Partial<Pick<EmbedPolicy, 'allowedOrigins' | 'trapFocus'>> = {}): EmbedPolicy {
  return {
    ...DEFAULT_POLICY,
    allowedOrigins: overrides.allowedOrigins ?? [],
    trapFocus: overrides.trapFocus ?? false,
  };
}

describe('buildCspHeader', () => {
  it('returns frame-ancestors none when allowlist is empty', () => {
    const policy = makePolicy({ allowedOrigins: [] });
    expect(buildCspHeader(policy)).toBe("frame-ancestors 'none'");
  });

  it('returns frame-ancestors self with single origin', () => {
    const policy = makePolicy({ allowedOrigins: ['https://example.com'] });
    expect(buildCspHeader(policy)).toBe("frame-ancestors 'self' https://example.com");
  });

  it('returns frame-ancestors self with multiple origins', () => {
    const policy = makePolicy({
      allowedOrigins: ['https://a.example.com', 'https://b.example.com'],
    });
    expect(buildCspHeader(policy)).toBe(
      "frame-ancestors 'self' https://a.example.com https://b.example.com",
    );
  });

  it('filters out empty string origins', () => {
    const policy = makePolicy({
      allowedOrigins: ['https://example.com', ''],
    });
    expect(buildCspHeader(policy)).toBe("frame-ancestors 'self' https://example.com");
  });

  it('returns frame-ancestors none when only empty string in allowlist', () => {
    const policy = makePolicy({ allowedOrigins: [''] });
    expect(buildCspHeader(policy)).toBe("frame-ancestors 'none'");
  });

  it('handles default policy (empty allowedOrigins)', () => {
    expect(buildCspHeader(DEFAULT_POLICY)).toBe("frame-ancestors 'none'");
  });
});

describe('buildFocusTrapHeader', () => {
  it('returns undefined when trapFocus is false', () => {
    const policy = makePolicy({ trapFocus: false });
    expect(buildFocusTrapHeader(policy)).toBeUndefined();
  });

  it('returns "enabled" when trapFocus is true', () => {
    const policy = makePolicy({ trapFocus: true });
    expect(buildFocusTrapHeader(policy)).toBe('enabled');
  });

  it('returns undefined for default policy', () => {
    expect(buildFocusTrapHeader(DEFAULT_POLICY)).toBeUndefined();
  });
});
