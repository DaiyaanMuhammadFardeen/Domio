/**
 * @domio/web-security — security headers tests (P20.5 B5).
 *
 * Covers:
 *   - CSP defaults (default-src 'self', object-src 'none', frame-ancestors 'none')
 *   - CSP respects allowlist overrides
 *   - nextSecurityHeaders emits CSP + HSTS + X-Frame-Options + nosniff + Permissions-Policy
 *   - HSTS only when https=true
 *   - Cookie validator rejects missing Secure / HttpOnly / SameSite
 *   - hardenSetCookie fills gaps safely
 */

import { describe, it, expect } from 'vitest';
import {
  buildCsp,
  nextSecurityHeaders,
  assertSecureCookie,
  hardenSetCookie,
  InsecureCookieError,
} from './headers.js';

describe('buildCsp', () => {
  it('emits a strict default-src self policy', () => {
    const csp = buildCsp();
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("base-uri 'self'");
  });

  it('does not include unsafe-eval by default', () => {
    const csp = buildCsp();
    expect(csp).not.toContain('unsafe-eval');
  });

  it('honours allowlist overrides for connect-src', () => {
    const csp = buildCsp({ allowlist: { connect: ['https://api.domio.example.com'] } });
    expect(csp).toContain("connect-src 'self' https://api.domio.example.com");
  });

  it('honours multiple img hosts', () => {
    const csp = buildCsp({
      allowlist: { img: ['https://cdn.domio.example.com', 'https://*.googleusercontent.com'] },
    });
    expect(csp).toMatch(
      /img-src 'self' data: blob: https:\/\/cdn\.domio\.example\.com https:\/\/\*\.googleusercontent\.com/,
    );
  });
});

describe('nextSecurityHeaders', () => {
  it('emits CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy', () => {
    const headers = nextSecurityHeaders({ https: false });
    const keys = headers.map((h) => h.key);
    expect(keys).toContain('Content-Security-Policy');
    expect(keys).toContain('X-Frame-Options');
    expect(keys).toContain('X-Content-Type-Options');
    expect(keys).toContain('Referrer-Policy');
    expect(keys).toContain('Permissions-Policy');
    // No HSTS in dev
    expect(keys).not.toContain('Strict-Transport-Security');
  });

  it('emits HSTS only when https=true', () => {
    const headers = nextSecurityHeaders({ https: true });
    const hsts = headers.find((h) => h.key === 'Strict-Transport-Security');
    expect(hsts).toBeDefined();
    expect(hsts?.value).toContain('max-age=63072000');
    expect(hsts?.value).toContain('includeSubDomains');
    expect(hsts?.value).toContain('preload');
  });

  it('X-Frame-Options is DENY', () => {
    const headers = nextSecurityHeaders();
    const xfo = headers.find((h) => h.key === 'X-Frame-Options');
    expect(xfo?.value).toBe('DENY');
  });

  it('Permissions-Policy denies sensors the app does not need', () => {
    const headers = nextSecurityHeaders();
    const pp = headers.find((h) => h.key === 'Permissions-Policy');
    expect(pp?.value).toContain('camera=()');
    expect(pp?.value).toContain('microphone=()');
    expect(pp?.value).toContain('geolocation=()');
    expect(pp?.value).toContain('payment=()');
  });
});

describe('assertSecureCookie', () => {
  it('accepts a fully hardened cookie', () => {
    expect(() =>
      assertSecureCookie('session=abc; HttpOnly; Secure; SameSite=Lax', { requireHttps: true }),
    ).not.toThrow();
  });

  it('rejects a cookie missing HttpOnly', () => {
    expect(() =>
      assertSecureCookie('session=abc; Secure; SameSite=Lax', { requireHttps: true }),
    ).toThrow(InsecureCookieError);
  });

  it('rejects a cookie missing Secure when https required', () => {
    expect(() =>
      assertSecureCookie('session=abc; HttpOnly; SameSite=Lax', { requireHttps: true }),
    ).toThrow(/missing Secure/);
  });

  it('allows Secure-less cookies in dev (requireHttps=false)', () => {
    expect(() =>
      assertSecureCookie('session=abc; HttpOnly; SameSite=Lax', { requireHttps: false }),
    ).not.toThrow();
  });

  it('rejects SameSite=None without Secure', () => {
    expect(() =>
      assertSecureCookie('session=abc; HttpOnly; SameSite=None', { requireHttps: true }),
    ).toThrow(/SameSite=None requires Secure/);
  });

  it('rejects a cookie missing SameSite', () => {
    expect(() =>
      assertSecureCookie('session=abc; HttpOnly; Secure', { requireHttps: true }),
    ).toThrow(/missing SameSite/);
  });

  it('uses cookie name in the error message', () => {
    expect(() =>
      assertSecureCookie('auth_token=xyz; Secure; SameSite=Lax', { requireHttps: true }),
    ).toThrow(/auth_token/);
  });
});

describe('hardenSetCookie', () => {
  it('adds missing HttpOnly + Secure + SameSite=Lax', () => {
    const out = hardenSetCookie('session=abc', { https: true });
    expect(out).toContain('HttpOnly');
    expect(out).toContain('Secure');
    expect(out).toContain('SameSite=Lax');
  });

  it('does not duplicate existing attributes', () => {
    const out = hardenSetCookie('session=abc; HttpOnly; Secure; SameSite=Lax', { https: true });
    const matches = out.match(/HttpOnly/g) ?? [];
    expect(matches.length).toBe(1);
  });

  it('omits Secure in dev (https=false)', () => {
    const out = hardenSetCookie('session=abc', { https: false });
    expect(out).not.toContain('Secure');
    expect(out).toContain('SameSite=Lax');
  });
});
