/**
 * API key service tests — Wave 8 §S8.8.
 */

import { describe, it, expect } from 'vitest';
import { listAPIKeys, createAPIKey, revokeAPIKey, getAPIKey } from './api-key-service';

describe('api-key-service', () => {
  it('lists 4+ seeded keys', async () => {
    const all = await listAPIKeys({ includeRevoked: true });
    expect(all.length).toBeGreaterThanOrEqual(4);
  });

  it('createAPIKey returns a 32-char secret and the key has matching prefix', async () => {
    const result = await createAPIKey({
      name: 'Test key',
      scopes: ['read-only'],
    });
    expect(result.secret.length).toBe(32);
    expect(result.key.name).toBe('Test key');
    expect(result.key.scopes).toEqual(['read-only']);
    expect(result.key.revoked).toBe(false);
    expect(result.key.prefix).toMatch(/^dapi_/);
  });

  it('revokeAPIKey sets revoked=true', async () => {
    const revoked = await revokeAPIKey('apikey-acme-ci');
    expect(revoked.revoked).toBe(true);
  });

  it('revoked keys are excluded from listAPIKeys by default', async () => {
    // apikey-acme-ci was revoked in the previous test — confirm it's hidden.
    const visible = await listAPIKeys();
    const ids = visible.map((k) => k.id);
    expect(ids).not.toContain('apikey-acme-ci');
    const all = await listAPIKeys({ includeRevoked: true });
    const allIds = all.map((k) => k.id);
    expect(allIds).toContain('apikey-acme-ci');
  });

  it('getAPIKey returns the matching key', async () => {
    const k = await getAPIKey('apikey-initech-agent');
    expect(k?.tenant_id).toBe('initech');
    expect(k?.scopes).toContain('agent-only');
  });

  it('createAPIKey rejects empty name', async () => {
    await expect(createAPIKey({ name: '  ', scopes: ['read-only'] })).rejects.toThrow();
  });

  it('createAPIKey rejects empty scopes', async () => {
    await expect(createAPIKey({ name: 'No scopes', scopes: [] })).rejects.toThrow();
  });
});
