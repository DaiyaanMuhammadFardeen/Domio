/**
 * Expiry store interface (Phase 18).
 *
 * Transport-agnostic persistence layer for expiry policies and freshness flags.
 * Two implementations:
 *  - {@link InMemoryExpiryStore} — used in tests and dev.
 *  - {@link PgExpiryStore}       — pg-pool-backed (scaffolding + nil-guards).
 */

import type { ExpiryPolicy, FreshnessFlag } from '../types.js';

// ---------------------------------------------------------------------------
// Store interface
// ---------------------------------------------------------------------------

export interface ExpiryStore {
  // -------------------------------------------------------------------------
  // Policies
  // -------------------------------------------------------------------------

  upsertPolicy(policy: ExpiryPolicy): Promise<void>;
  getPolicy(resourceType: string, resourceId: string): Promise<ExpiryPolicy | null>;
  listPolicies(workspaceId: string): Promise<ExpiryPolicy[]>;

  // -------------------------------------------------------------------------
  // Flags
  // -------------------------------------------------------------------------

  insertFlag(flag: FreshnessFlag): Promise<void>;
  listOpenFlags(resourceType?: string, resourceId?: string): Promise<FreshnessFlag[]>;
  resolveFlags(
    resourceType: string,
    resourceId: string,
    opts: { resolvedAt: Date; resolvedBy: string },
  ): Promise<number>;
  getFlagHistory(resourceType: string, resourceId: string): Promise<FreshnessFlag[]>;
}
