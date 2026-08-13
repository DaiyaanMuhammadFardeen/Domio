/**
 * SCIM service tests — Wave 8 §S8.1.
 */

import { describe, it, expect } from 'vitest';
import {
  listSCIMTokens,
  createSCIMToken,
  revokeSCIMToken,
} from './scim-service';

describe('scim-service', () => {
  it('lists seeded tokens', async () => {
    const items = await listSCIMTokens();
    expect(items.length).toBeGreaterThanOrEqual(2);
    const tenantIds = items.map((t) => t.tenant_id);
    expect(tenantIds).toContain('acme');
    expect(tenantIds).toContain('initech');
  });

  it('createSCIMToken returns the secret (long string)', async () => {
    const result = await createSCIMToken({ tenant_id: 'newco' });
    expect(result.token.tenant_id).toBe('newco');
    expect(result.token.endpoint_url).toMatch(/^https:\/\/api\.domio\.app\/scim\/v2\//);
    expect(result.token_secret.length).toBeGreaterThanOrEqual(40);
    expect(result.token.token_prefix).toBe(result.token_secret.slice(0, 8));
  });

  it('createSCIMToken computes expires_at_ms from expires_in_days', async () => {
    const result = await createSCIMToken({
      tenant_id: 'newco',
      expires_in_days: 90,
    });
    expect(result.token.expires_at_ms).not.toBeNull();
    expect((result.token.expires_at_ms ?? 0) > 0).toBe(true);
  });

  it('revokeSCIMToken completes without throwing', async () => {
    await expect(revokeSCIMToken('scim-acme-001')).resolves.toBeUndefined();
  });

  it('listSCIMTokens filters by tenant', async () => {
    const acme = await listSCIMTokens('acme');
    expect(acme.every((t) => t.tenant_id === 'acme')).toBe(true);
    expect(acme.length).toBeGreaterThanOrEqual(1);
  });
});