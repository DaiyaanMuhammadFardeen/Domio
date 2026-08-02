import { describe, it, expect } from 'vitest';
import { InMemoryStore } from '../store/memory.js';
import { defaultDeps, DEFAULT_LIMITS, type ServiceDeps } from '../deps.js';
import { run } from './cdn-signer.js';

function makeDeps(overrides: Partial<ServiceDeps> = {}): ServiceDeps {
  return defaultDeps(new InMemoryStore(), overrides);
}

describe('cdn-signer worker', () => {
  it('returns signed URL with sig and expiry params', () => {
    const fixedNow = 1000000;
    const deps = makeDeps({ now: () => fixedNow });
    const sha256 = 'abc123def456abc123def456abc123def456abc123def456abc123def456abcd';

    const result = run(deps, { sha256 });

    expect(result.url).toContain('sig=');
    expect(result.url).toContain('expires=');
    expect(result.url).toContain(sha256);
    expect(result.expiresAt).toBe(fixedNow + deps.limits.signedUrlTtlMs);
  });

  it('expiry is within TTL window', () => {
    const fixedNow = 500000;
    const deps = makeDeps({ now: () => fixedNow });
    const sha256 = 'abc123def456abc123def456abc123def456abc123def456abc123def456abcd';

    const result = run(deps, { sha256 });

    expect(result.expiresAt).toBeGreaterThan(fixedNow);
    expect(result.expiresAt).toBeLessThanOrEqual(fixedNow + deps.limits.signedUrlTtlMs);
  });

  it('uses custom method when provided', () => {
    const deps = makeDeps();
    const sha256 = 'abc123def456abc123def456abc123def456abc123def456abc123def456abcd';

    const result = run(deps, { sha256, method: 'HEAD' });

    // The URL should still contain the sha256
    expect(result.url).toContain(sha256);
  });

  it('uses bundleBaseUrl from deps', () => {
    const deps = makeDeps({ bundleBaseUrl: 'https://cdn.example.com' });
    const sha256 = 'abc123def456abc123def456abc123def456abc123def456abc123def456abcd';

    const result = run(deps, { sha256 });

    expect(result.url).toContain('https://cdn.example.com');
  });

  it('URL can be verified with verifySignedUrl', async () => {
    const { verifySignedUrl } = await import('../crypto/index.js');
    const fixedNow = 2000000;
    const ttl = 300000;
    const deps = makeDeps({
      now: () => fixedNow,
      limits: { ...DEFAULT_LIMITS, signedUrlTtlMs: ttl },
    });
    const sha256 = 'abc123def456abc123def456abc123def456abc123def456abc123def456abcd';

    const result = run(deps, { sha256 });

    const verification = verifySignedUrl('GET', result.url, deps.signUrlSecret, fixedNow + 1);
    expect(verification.valid).toBe(true);
  });
});
