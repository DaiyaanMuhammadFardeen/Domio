/**
 * SSO service tests — Wave 8 §S8.1.
 */

import { describe, it, expect } from 'vitest';
import { listSSOProviders, getSSOProvider, createSSOProvider, testSSOLogin } from './sso-service';

describe('sso-service', () => {
  it('lists 4+ providers from seed', async () => {
    const items = await listSSOProviders();
    expect(items.length).toBeGreaterThanOrEqual(4);
    const names = items.map((p) => p.name);
    expect(names).toContain('Okta');
    expect(names).toContain('Azure AD');
  });

  it('filters by tenant_id', async () => {
    const acme = await listSSOProviders('acme');
    expect(acme.every((p) => p.tenant_id === 'acme')).toBe(true);
    expect(acme.length).toBeGreaterThanOrEqual(1);
  });

  it('retrieves a provider by id', async () => {
    const p = await getSSOProvider('sso-okta-acme');
    expect(p?.name).toBe('Okta');
    expect(p?.protocol).toBe('saml');
  });

  it('returns undefined for unknown provider id', async () => {
    expect(await getSSOProvider('nope')).toBeUndefined();
  });

  it('testSSOLogin completes <5000ms with success', async () => {
    const start = Date.now();
    const result = await testSSOLogin({
      provider_id: 'sso-okta-acme',
      subject_email: 'user@acme.com',
    });
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(5000);
    expect(result.ok).toBe(true);
    expect(result.error).toBeNull();
    expect(result.resolved_subject).toBe('user@acme.com');
    expect(result.latency_ms).toBeGreaterThanOrEqual(0);
  });

  it('testSSOLogin with non-existent provider returns error', async () => {
    const result = await testSSOLogin({
      provider_id: 'nope',
      subject_email: 'someone@example.com',
    });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/not found/i);
  });

  it('createSSOProvider returns a provider with status pending', async () => {
    const created = await createSSOProvider({
      tenant_id: 'newco',
      name: 'Okta',
      protocol: 'saml',
    });
    expect(created.status).toBe('pending');
    expect(created.tenant_id).toBe('newco');
    expect(created.name).toBe('Okta');
    expect(created.protocol).toBe('saml');
    expect(created.acs_url).toMatch(/^https:\/\/api\.domio\.app\//);
    expect(created.entity_id).toMatch(/^urn:domio:/);
  });
});
