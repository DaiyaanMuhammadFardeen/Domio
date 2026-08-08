import { describe, it, expect } from 'vitest';
import { evaluateMode, defaultPolicyFor, ipClassFor, CURRENT_POLICY_VERSION } from './policy.js';

describe('evaluateMode', () => {
  it('accepts modes in the allowlist', () => {
    expect(evaluateMode('identified', ['identified', 'pseudonymous']).accept).toBe(true);
  });

  it('rejects modes not in the allowlist', () => {
    const out = evaluateMode('anon_no_track', ['identified', 'pseudonymous']);
    expect(out.accept).toBe(false);
    expect(out.reason).toMatch(/anon_no_track/);
  });

  it('gdpr_strict preset excludes anon_consent', () => {
    const accepted = defaultPolicyFor('gdpr_strict');
    expect(accepted).toContain('identified');
    expect(accepted).toContain('pseudonymous');
    expect(accepted).not.toContain('anon_consent');
    expect(accepted).not.toContain('anon_no_track');
  });

  it('balanced preset accepts anon_consent only', () => {
    const accepted = defaultPolicyFor('balanced');
    expect(accepted).toContain('anon_consent');
    expect(accepted).not.toContain('anon_no_track');
  });

  it('permissive preset is identical to balanced (anon_no_track never auto-accepted)', () => {
    expect(defaultPolicyFor('permissive')).toEqual(defaultPolicyFor('balanced'));
  });

  it('custom preset accepts all four', () => {
    expect(defaultPolicyFor('custom')).toContain('anon_no_track');
  });
});

describe('ipClassFor', () => {
  it('classifies 103.x as bd', () => {
    expect(ipClassFor('103.10.20.30')).toBe('bd');
  });

  it('classifies RFC1918 as internal', () => {
    expect(ipClassFor('10.0.0.1')).toBe('internal');
    expect(ipClassFor('192.168.1.1')).toBe('internal');
  });

  it('returns null for empty input', () => {
    expect(ipClassFor(null)).toBeNull();
  });
});

describe('CURRENT_POLICY_VERSION', () => {
  it('is a non-empty string', () => {
    expect(typeof CURRENT_POLICY_VERSION).toBe('string');
    expect(CURRENT_POLICY_VERSION.length).toBeGreaterThan(0);
  });
});
