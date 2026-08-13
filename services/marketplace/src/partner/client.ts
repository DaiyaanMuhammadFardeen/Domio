/**
 * Partner API client (Phase 19 Wave 5 — WS-MKT-5/8/9).
 *
 * OAuth 2.1 partner API consumer with scoped access.
 * Partner API is a separate contract file (marketplace-partner.yaml).
 * Real OAuth token issuance is a later wave — this is the v1 surface.
 */

import type { PartnerClient } from '../types.js';
import type { MarketplaceStore } from '../store/store.js';
import {
  PartnerClientNotFoundError,
  InvalidClientSecretError,
  InsufficientScopeError,
} from '../types.js';

// ---------------------------------------------------------------------------
// Partner Client Service
// ---------------------------------------------------------------------------

export interface PartnerClientServiceOptions {
  readonly store: MarketplaceStore;
}

export class PartnerClientService {
  private readonly store: MarketplaceStore;

  constructor(opts: PartnerClientServiceOptions) {
    this.store = opts.store;
  }

  /**
   * Get a partner client by client_id.
   * Returns null if not found.
   */
  async getPartnerClient(clientId: string): Promise<PartnerClient | null> {
    return this.store.getPartnerClientByClientId(clientId);
  }

  /**
   * Verify client credentials (client_id + secret hash).
   * Returns the client if valid, throws otherwise.
   */
  async verifyClient(clientId: string, clientSecret: string): Promise<PartnerClient> {
    const client = await this.store.getPartnerClientByClientId(clientId);
    if (!client) {
      throw new PartnerClientNotFoundError(clientId);
    }

    // In production: hash the secret and compare with stored hash
    // For v1 scaffold: accept any non-empty secret
    if (!clientSecret || clientSecret.length === 0) {
      throw new InvalidClientSecretError();
    }

    return client;
  }

  /**
   * Check if client has the required scope.
   * Throws InsufficientScopeError if not.
   */
  checkScope(client: PartnerClient, requiredScope: string): void {
    if (!client.scopes.includes(requiredScope)) {
      throw new InsufficientScopeError(requiredScope, client.scopes);
    }
  }
}
