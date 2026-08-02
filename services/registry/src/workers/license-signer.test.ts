import { describe, it, expect } from 'vitest';
import { InMemoryStore } from '../store/memory.js';
import { defaultDeps, type ServiceDeps } from '../deps.js';
import { run } from './license-signer.js';
import { verifyLicense } from '../install/license.js';
import type { MarketplaceListing } from '../store/types.js';

function makeDeps(store: InMemoryStore): ServiceDeps {
  return defaultDeps(store, {
    ulid: () => `ulid-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    now: () => 1700000000000,
  });
}

const testListing: MarketplaceListing = {
  id: 'ls-001',
  catalogId: 'ui-button',
  sellerId: 'seller-1',
  title: 'Button Pro',
  description: 'A premium button',
  status: 'published',
  isFree: false,
  priceCents: 499,
  currency: 'usd',
  tags: ['ui'],
  createdAt: 1700000000000,
  updatedAt: 1700000000000,
};

describe('license-signer worker', () => {
  it('issues a grant with explicit listingId', async () => {
    const store = new InMemoryStore();
    const deps = makeDeps(store);
    await store.putListing(testListing);

    const result = await run(deps, {
      workspaceId: 'ws-1',
      userId: 'user-1',
      catalogId: 'ui-button',
      version: '2.0.0',
      listingId: 'ls-001',
      seats: 3,
    });

    expect(result.grantId).toBeDefined();
    expect(result.token).toBeDefined();
    expect(result.expiresAt).toBeGreaterThan(1700000000000);

    // Verify the grant was stored
    const grant = await store.getLicenseGrant(result.grantId);
    expect(grant).toBeDefined();
    expect(grant!.catalogId).toBe('ui-button');
    expect(grant!.version).toBe('2.0.0');
    expect(grant!.seats).toBe(3);
    expect(grant!.workspaceId).toBe('ws-1');
    expect(grant!.userId).toBe('user-1');
  });

  it('issues a grant with listingId resolved from catalogId', async () => {
    const store = new InMemoryStore();
    const deps = makeDeps(store);
    await store.putListing(testListing);

    const result = await run(deps, {
      workspaceId: 'ws-1',
      catalogId: 'ui-button',
      version: '2.0.0',
      // No listingId — should resolve from catalogId
    });

    expect(result.grantId).toBeDefined();
    expect(result.token).toBeDefined();

    const grant = await store.getLicenseGrant(result.grantId);
    expect(grant!.listingId).toBe('ls-001');
  });

  it('throws when no listing found for catalogId', async () => {
    const store = new InMemoryStore();
    const deps = makeDeps(store);

    await expect(
      run(deps, {
        workspaceId: 'ws-1',
        catalogId: 'nonexistent',
        version: '1.0.0',
      }),
    ).rejects.toThrow('No published listing found');
  });

  it('token verifies via verifyLicense', async () => {
    const store = new InMemoryStore();
    const deps = makeDeps(store);
    await store.putListing(testListing);

    const result = await run(deps, {
      workspaceId: 'ws-1',
      catalogId: 'ui-button',
      version: '2.0.0',
      listingId: 'ls-001',
    });

    const verification = await verifyLicense(deps, {
      token: result.token,
      catalogId: 'ui-button',
      version: '2.0.0',
      workspaceId: 'ws-1',
      now: 1700000000000,
    });

    expect(verification.valid).toBe(true);
    expect(verification.grant).toBeDefined();
    expect(verification.grant!.id).toBe(result.grantId);
  });

  it('defaults seats to 1 when omitted', async () => {
    const store = new InMemoryStore();
    const deps = makeDeps(store);
    await store.putListing(testListing);

    const result = await run(deps, {
      workspaceId: 'ws-1',
      catalogId: 'ui-button',
      version: '2.0.0',
      listingId: 'ls-001',
      // No seats
    });

    const grant = await store.getLicenseGrant(result.grantId);
    expect(grant!.seats).toBe(1);
  });

  it('works without userId', async () => {
    const store = new InMemoryStore();
    const deps = makeDeps(store);
    await store.putListing(testListing);

    const result = await run(deps, {
      workspaceId: 'ws-1',
      catalogId: 'ui-button',
      version: '2.0.0',
      listingId: 'ls-001',
      // No userId
    });

    const grant = await store.getLicenseGrant(result.grantId);
    expect(grant!.userId).toBeUndefined();
  });
});
