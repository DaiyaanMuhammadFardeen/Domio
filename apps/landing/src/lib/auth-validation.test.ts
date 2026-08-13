/**
 * Unit tests for the auth form validators. Pure-logic, no React.
 */

import { describe, expect, it } from 'vitest';
import {
  validateEmail,
  validateForgotPassword,
  validateLogin,
  validatePassword,
  validateSignup,
} from './auth-validation';

describe('validateEmail', () => {
  it('rejects empty / whitespace / non-string input', () => {
    expect(validateEmail('')).toBeTruthy();
    expect(validateEmail('   ')).toBeTruthy();
    // @ts-expect-error - exercising runtime guard
    expect(validateEmail(undefined)).toBeTruthy();
    // @ts-expect-error - exercising runtime guard
    expect(validateEmail(null)).toBeTruthy();
    // @ts-expect-error - exercising runtime guard
    expect(validateEmail(42)).toBeTruthy();
  });

  it('rejects addresses missing a local part, domain, or @', () => {
    expect(validateEmail('@example.com')).toBeTruthy();
    expect(validateEmail('user@')).toBeTruthy();
    expect(validateEmail('user')).toBeTruthy();
    expect(validateEmail('user@@example.com')).toBeTruthy();
  });

  it('rejects addresses whose domain has no dot', () => {
    expect(validateEmail('user@localhost')).toBeTruthy();
  });

  it('rejects addresses longer than 254 chars', () => {
    const long = `${'a'.repeat(250)}@x.io`;
    expect(validateEmail(long)).toBeTruthy();
  });

  it('accepts well-formed addresses', () => {
    expect(validateEmail('jane@example.com')).toBeNull();
    expect(validateEmail('  jane.doe@sub.example.co  ')).toBeNull();
  });
});

describe('validatePassword', () => {
  it('rejects empty / non-string input', () => {
    expect(validatePassword('')).toBeTruthy();
    // @ts-expect-error - exercising runtime guard
    expect(validatePassword(undefined)).toBeTruthy();
    // @ts-expect-error - exercising runtime guard
    expect(validatePassword(42)).toBeTruthy();
  });

  it('rejects passwords shorter than 8 chars', () => {
    expect(validatePassword('short')).toBeTruthy();
    expect(validatePassword('1234567')).toBeTruthy();
  });

  it('accepts passwords at or above 8 chars', () => {
    expect(validatePassword('12345678')).toBeNull();
    expect(validatePassword('correct-horse-battery-staple')).toBeNull();
  });
});

describe('validateSignup', () => {
  const valid = {
    email: 'jane@example.com',
    password: 'hunter22hunter',
    plan: 'pro' as const,
    marketing_opt_in: true,
  };

  it('accepts a fully valid payload', () => {
    expect(validateSignup(valid).ok).toBe(true);
  });

  it('flags every field that is missing or invalid', () => {
    const result = validateSignup({});
    expect(result.ok).toBe(false);
    expect(result.errors['email']).toBeTruthy();
    expect(result.errors['password']).toBeTruthy();
    expect(result.errors['plan']).toBeTruthy();
  });

  it('rejects unknown plans', () => {
    expect(validateSignup({ ...valid, plan: 'platinum' as never }).ok).toBe(false);
  });

  it('rejects unknown SSO providers', () => {
    expect(
      validateSignup({ ...valid, sso_provider: 'twitter' as never }).ok,
    ).toBe(false);
  });

  it('accepts known SSO providers', () => {
    expect(
      validateSignup({ ...valid, sso_provider: 'google' }).ok,
    ).toBe(true);
  });

  it('flags non-boolean marketing_opt_in', () => {
    expect(
      // @ts-expect-error - exercising runtime guard
      validateSignup({ ...valid, marketing_opt_in: 'yes' }).ok,
    ).toBe(false);
  });

  it('accepts a missing marketing_opt_in (defaults to false)', () => {
    const rest = {
      email: valid.email,
      password: valid.password,
      plan: valid.plan,
    };
    expect(validateSignup(rest).ok).toBe(true);
  });
});

describe('validateLogin', () => {
  const validPassword = {
    email: 'jane@example.com',
    password: 'hunter22hunter',
  };

  it('accepts an email + password', () => {
    expect(validateLogin(validPassword).ok).toBe(true);
  });

  it('accepts an email + SSO provider', () => {
    expect(validateLogin({ email: 'jane@example.com', sso_provider: 'github' }).ok).toBe(
      true,
    );
  });

  it('rejects when both password and SSO are missing', () => {
    expect(validateLogin({ email: 'jane@example.com' }).ok).toBe(false);
  });

  it('rejects when the email is missing', () => {
    expect(validateLogin({ password: 'hunter22hunter' }).ok).toBe(false);
  });

  it('rejects short passwords when SSO is absent', () => {
    const result = validateLogin({ email: 'jane@example.com', password: 'short' });
    expect(result.ok).toBe(false);
    expect(result.errors['password']).toBeTruthy();
  });
});

describe('validateForgotPassword', () => {
  it('requires an email', () => {
    expect(validateForgotPassword({}).ok).toBe(false);
  });

  it('rejects malformed email', () => {
    expect(validateForgotPassword({ email: 'nope' }).ok).toBe(false);
  });

  it('accepts a valid email', () => {
    expect(validateForgotPassword({ email: 'jane@example.com' }).ok).toBe(true);
  });
});