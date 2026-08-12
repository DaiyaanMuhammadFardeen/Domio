/**
 * Custom-domain service tests — Wave 3 §S3.5.
 */

import { describe, it, expect } from 'vitest';
import {
  listCustomDomains,
  getCustomDomain,
  createCustomDomain,
  verifyCustomDomain,
  revokeCustomDomain,
} from './custom-domain-service';

describe('custom-domain-service', () => {
  it('lists every seeded domain', async () => {
    const list = await listCustomDomains();
    expect(list.total).toBeGreaterThanOrEqual(4);
    expect(list.items.some((d) => d.hostname === 'decks.acme.com')).toBe(true);
  });

  it('filters by tenant_id', async () => {
    const acme = await listCustomDomains('acme');
    expect(acme.items.every((d) => d.tenant_id === 'acme')).toBe(true);
    expect(acme.items.some((d) => d.hostname === 'share.initech.io')).toBe(false);
  });

  it('retrieves a domain by id', async () => {
    const d = await getCustomDomain('cd-acme');
    expect(d?.state).toBe('verified');
  });

  it('returns undefined for unknown ids', async () => {
    expect(await getCustomDomain('nope')).toBeUndefined();
  });

  it('creates a new domain in pending_dns state', async () => {
    const created = await createCustomDomain({
      tenant_id: 'newco',
      workspace_id: 'w-newco',
      hostname: 'demo.newco.com',
      label: 'Demo',
    });
    expect(created.state).toBe('pending_dns');
    expect(created.cname_target).toBe('cname.domio.app.');
    expect(created.label).toBe('Demo');
  });

  it('rejects invalid hostnames', async () => {
    await expect(
      createCustomDomain({ tenant_id: 't', workspace_id: 'w', hostname: 'not a host' }),
    ).rejects.toThrow();
  });

  it('verifies a verified seed row positively', async () => {
    const res = await verifyCustomDomain('cd-acme');
    expect(res.cname_ok).toBe(true);
    expect(res.message).toMatch(/resolves/i);
  });

  it('verifies a pending row negatively', async () => {
    const res = await verifyCustomDomain('cd-initech');
    expect(res.cname_ok).toBe(false);
  });

  it('throws on verify of unknown id', async () => {
    await expect(verifyCustomDomain('nope')).rejects.toThrow();
  });

  it('revokes a domain', async () => {
    const res = await revokeCustomDomain('cd-acme');
    expect(res.state).toBe('revoked');
  });
});
