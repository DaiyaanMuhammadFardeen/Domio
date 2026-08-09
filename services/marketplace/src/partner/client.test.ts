/**
 * Partner client tests (Phase 19 Wave 5 — WS-MKT-5/8/9).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { PartnerClientService } from './client.js';
import { InMemoryMarketplaceStore } from '../store/mem_store.js';
import { PartnerClientNotFoundError, InvalidClientSecretError, InsufficientScopeError } from '../types.js';
import type { PartnerClient } from '../types.js';
import { hasScope, getRateLimit, validatePartnerAccess } from './access.js';

describe('PartnerClientService', () => {
  let store: InMemoryMarketplaceStore;
  let service: PartnerClientService;

  beforeEach(() => {
    store = new InMemoryMarketplaceStore();
    service = new PartnerClientService({ store });
  });

  describe('getPartnerClient', () => {
    it('returns null for non-existent client', async () => {
      const result = await service.getPartnerClient('nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('verifyClient', () => {
    it('throws PartnerClientNotFoundError for non-existent client', async () => {
      await expect(
        service.verifyClient('nonexistent', 'secret'),
      ).rejects.toThrow(PartnerClientNotFoundError);
    });

    it('throws InvalidClientSecretError for empty secret', async () => {
      // Create a client in the store
      const client: PartnerClient = {
        id: 'pc-1',
        workspaceId: 'ws-1',
        name: 'Test Partner',
        clientId: 'partner-1',
        clientSecretHash: 'hash-1',
        scopes: ['marketplace:read'],
        tier: 'pro',
        createdBy: 'user-1',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      await (store as any).partnerClients.set('partner-1', client);

      await expect(
        service.verifyClient('partner-1', ''),
      ).rejects.toThrow(InvalidClientSecretError);
    });

    it('returns client for valid credentials', async () => {
      const client: PartnerClient = {
        id: 'pc-1',
        workspaceId: 'ws-1',
        name: 'Test Partner',
        clientId: 'partner-1',
        clientSecretHash: 'hash-1',
        scopes: ['marketplace:read'],
        tier: 'pro',
        createdBy: 'user-1',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      await (store as any).partnerClients.set('partner-1', client);

      const result = await service.verifyClient('partner-1', 'secret');
      expect(result.clientId).toBe('partner-1');
    });
  });

  describe('checkScope', () => {
    it('does not throw when scope is present', () => {
      const client: PartnerClient = {
        id: 'pc-1',
        workspaceId: 'ws-1',
        name: 'Test Partner',
        clientId: 'partner-1',
        clientSecretHash: 'hash-1',
        scopes: ['marketplace:read', 'marketplace:install'],
        tier: 'pro',
        createdBy: 'user-1',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      expect(() => service.checkScope(client, 'marketplace:read')).not.toThrow();
    });

    it('throws InsufficientScopeError when scope is missing', () => {
      const client: PartnerClient = {
        id: 'pc-1',
        workspaceId: 'ws-1',
        name: 'Test Partner',
        clientId: 'partner-1',
        clientSecretHash: 'hash-1',
        scopes: ['marketplace:read'],
        tier: 'pro',
        createdBy: 'user-1',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      expect(() => service.checkScope(client, 'marketplace:purchase'))
        .toThrow(InsufficientScopeError);
    });
  });
});

describe('Partner Access', () => {
  it('hasScope returns true when scope is present', () => {
    const client = {
      scopes: ['marketplace:read', 'marketplace:install'],
    } as any;
    expect(hasScope(client, 'marketplace:read')).toBe(true);
  });

  it('hasScope returns false when scope is missing', () => {
    const client = {
      scopes: ['marketplace:read'],
    } as any;
    expect(hasScope(client, 'marketplace:purchase')).toBe(false);
  });

  it('getRateLimit returns pro tier limit', () => {
    expect(getRateLimit('pro')).toBe(600);
  });

  it('getRateLimit returns enterprise tier limit', () => {
    expect(getRateLimit('enterprise')).toBe(6000);
  });

  it('validatePartnerAccess returns valid for correct scope', () => {
    const client = {
      scopes: ['marketplace:read'],
    } as any;
    expect(validatePartnerAccess(client, 'marketplace:read')).toEqual({ valid: true });
  });

  it('validatePartnerAccess returns invalid for missing scope', () => {
    const client = {
      scopes: ['marketplace:read'],
    } as any;
    const result = validatePartnerAccess(client, 'marketplace:purchase');
    expect(result.valid).toBe(false);
    expect((result as any).code).toBe('INSUFFICIENT_SCOPE');
  });
});
