/**
 * In-memory expiry store (Phase 18).
 *
 * Backs every method of {@link ExpiryStore} with Maps. Used in unit
 * tests and in dev when DATABASE_URL is unset.
 */

import type { ExpiryPolicy, FreshnessFlag } from '../types.js';
import type { ExpiryStore } from './store.js';

export class InMemoryExpiryStore implements ExpiryStore {
  private readonly policies = new Map<string, ExpiryPolicy>();
  private readonly flags = new Map<string, FreshnessFlag>();

  // -------------------------------------------------------------------------
  // Policies
  // -------------------------------------------------------------------------

  async upsertPolicy(policy: ExpiryPolicy): Promise<void> {
    const key = `${policy.resource_type}:${policy.resource_id}`;
    this.policies.set(key, policy);
  }

  async getPolicy(resourceType: string, resourceId: string): Promise<ExpiryPolicy | null> {
    const key = `${resourceType}:${resourceId}`;
    return this.policies.get(key) ?? null;
  }

  async listPolicies(workspaceId: string): Promise<ExpiryPolicy[]> {
    const results: ExpiryPolicy[] = [];
    for (const p of this.policies.values()) {
      if (p.workspace_id === workspaceId) results.push(p);
    }
    return results;
  }

  // -------------------------------------------------------------------------
  // Flags
  // -------------------------------------------------------------------------

  async insertFlag(flag: FreshnessFlag): Promise<void> {
    this.flags.set(flag.id, flag);
  }

  async listOpenFlags(resourceType?: string, resourceId?: string): Promise<FreshnessFlag[]> {
    const results: FreshnessFlag[] = [];
    for (const f of this.flags.values()) {
      if (f.resolved_at !== null) continue;
      if (resourceType && f.resource_type !== resourceType) continue;
      if (resourceId && f.resource_id !== resourceId) continue;
      results.push(f);
    }
    return results;
  }

  async resolveFlags(
    resourceType: string,
    resourceId: string,
    opts: { resolvedAt: Date; resolvedBy: string },
  ): Promise<number> {
    let count = 0;
    for (const f of this.flags.values()) {
      if (f.resolved_at !== null) continue;
      if (f.resource_type !== resourceType) continue;
      if (f.resource_id !== resourceId) continue;
      // Create updated flag (readonly interface, so we create new entry)
      const updated: FreshnessFlag = {
        ...f,
        resolved_at: opts.resolvedAt,
        resolved_by: opts.resolvedBy,
      };
      this.flags.set(f.id, updated);
      count++;
    }
    return count;
  }

  async getFlagHistory(resourceType: string, resourceId: string): Promise<FreshnessFlag[]> {
    const results: FreshnessFlag[] = [];
    for (const f of this.flags.values()) {
      if (f.resource_type !== resourceType) continue;
      if (f.resource_id !== resourceId) continue;
      results.push(f);
    }
    return results;
  }

  // -------------------------------------------------------------------------
  // Test helpers
  // -------------------------------------------------------------------------

  clear(): void {
    this.policies.clear();
    this.flags.clear();
  }
}
