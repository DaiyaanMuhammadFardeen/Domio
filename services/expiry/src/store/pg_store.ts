/**
 * pg-backed expiry store (Phase 18).
 *
 * Full parameterized-SQL implementation of all 7 {@link ExpiryStore} methods.
 * Accepts a `Pool` (pg's public interface). Every mutating method checks
 * `this.pool != null` upfront and throws {@link StoreNotConfiguredError}.
 *
 * SQL conventions:
 *  - All queries use $N parameterised placeholders (no string interpolation).
 *  - timestamptz ↔ Date: node-pg returns Date for timestamptz; on insert
 *    we pass Date objects directly (pg handles conversion).
 *  - Dynamic UPDATE uses `'key' in patch` to distinguish undefined (skip) vs null (clear).
 *  - auto-updates `updated_at` when absent on tables that have it.
 */

import type { Pool as PgPool, PoolClient } from 'pg';
import type { ExpiryPolicy, FreshnessFlag } from '../types.js';
import type { ExpiryStore } from './store.js';

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export class PgExpiryStore implements ExpiryStore {
  /** Public for test injection. */
  readonly pool: PgPool | null;

  constructor(pool: PgPool | null) {
    this.pool = pool;
  }

  // -------------------------------------------------------------------------
  // Transaction helper
  // -------------------------------------------------------------------------

  /**
   * Execute `fn` inside a BEGIN/COMMIT transaction. On exception the
   * transaction is rolled back. The callback receives a PoolClient that
   * must NOT be released by the caller — this method handles cleanup.
   */
  async withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
    if (!this.pool) throw new StoreNotConfiguredError('withTransaction');
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  // -------------------------------------------------------------------------
  // Policies
  // -------------------------------------------------------------------------

  async upsertPolicy(policy: ExpiryPolicy): Promise<void> {
    if (!this.pool) throw new StoreNotConfiguredError('upsertPolicy');
    await this.pool.query(
      `INSERT INTO expiry_policy (
        id, workspace_id, resource_type, resource_id,
        interval_days, responsible_id, escalation,
        auto_revoke_share, created_at, created_by, updated_by
      ) VALUES (
        $1, $2, $3, $4,
        $5, $6, $7,
        $8, $9, $10, $11
      )
      ON CONFLICT (resource_type, resource_id) DO UPDATE SET
        workspace_id      = EXCLUDED.workspace_id,
        interval_days      = EXCLUDED.interval_days,
        responsible_id     = EXCLUDED.responsible_id,
        escalation         = EXCLUDED.escalation,
        auto_revoke_share  = EXCLUDED.auto_revoke_share,
        updated_by         = EXCLUDED.updated_by`,
      [
        policy.id,
        policy.workspace_id,
        policy.resource_type,
        policy.resource_id,
        policy.interval_days,
        policy.responsible_id,
        policy.escalation,
        policy.auto_revoke_share,
        policy.created_at,
        policy.created_by,
        policy.updated_by,
      ],
    );
  }

  async getPolicy(resourceType: string, resourceId: string): Promise<ExpiryPolicy | null> {
    if (!this.pool) throw new StoreNotConfiguredError('getPolicy');
    const { rows } = await this.pool.query(
      'SELECT * FROM expiry_policy WHERE resource_type = $1 AND resource_id = $2',
      [resourceType, resourceId],
    );
    if (rows.length === 0) return null;
    return policyRowToDomain(rows[0]!);
  }

  async listPolicies(workspaceId: string): Promise<ExpiryPolicy[]> {
    if (!this.pool) throw new StoreNotConfiguredError('listPolicies');
    const { rows } = await this.pool.query(
      'SELECT * FROM expiry_policy WHERE workspace_id = $1 ORDER BY created_at ASC',
      [workspaceId],
    );
    return rows.map(policyRowToDomain);
  }

  // -------------------------------------------------------------------------
  // Flags
  // -------------------------------------------------------------------------

  async insertFlag(flag: FreshnessFlag): Promise<void> {
    if (!this.pool) throw new StoreNotConfiguredError('insertFlag');
    await this.pool.query(
      `INSERT INTO freshness_flag (
        id, workspace_id, resource_type, resource_id,
        flagged_at, reason, resolved_at, resolved_by, created_at
      ) VALUES (
        $1, $2, $3, $4,
        $5, $6, $7, $8, $9
      )`,
      [
        flag.id,
        flag.workspace_id,
        flag.resource_type,
        flag.resource_id,
        flag.flagged_at,
        flag.reason,
        flag.resolved_at,
        flag.resolved_by,
        flag.created_at,
      ],
    );
  }

  async listOpenFlags(resourceType?: string, resourceId?: string): Promise<FreshnessFlag[]> {
    if (!this.pool) throw new StoreNotConfiguredError('listOpenFlags');
    const conditions: string[] = ['resolved_at IS NULL'];
    const params: unknown[] = [];
    let idx = 1;
    if (resourceType) {
      conditions.push(`resource_type = $${idx++}`);
      params.push(resourceType);
    }
    if (resourceId) {
      conditions.push(`resource_id = $${idx++}`);
      params.push(resourceId);
    }
    const sql = `SELECT * FROM freshness_flag WHERE ${conditions.join(' AND ')} ORDER BY flagged_at ASC`;
    const { rows } = await this.pool.query(sql, params);
    return rows.map(flagRowToDomain);
  }

  async resolveFlags(
    resourceType: string,
    resourceId: string,
    opts: { resolvedAt: Date; resolvedBy: string },
  ): Promise<number> {
    if (!this.pool) throw new StoreNotConfiguredError('resolveFlags');
    const { rowCount } = await this.pool.query(
      `UPDATE freshness_flag
       SET resolved_at = $1, resolved_by = $2
       WHERE resource_type = $3 AND resource_id = $4
         AND resolved_at IS NULL`,
      [opts.resolvedAt, opts.resolvedBy, resourceType, resourceId],
    );
    return rowCount ?? 0;
  }

  async getFlagHistory(resourceType: string, resourceId: string): Promise<FreshnessFlag[]> {
    if (!this.pool) throw new StoreNotConfiguredError('getFlagHistory');
    const { rows } = await this.pool.query(
      'SELECT * FROM freshness_flag WHERE resource_type = $1 AND resource_id = $2 ORDER BY created_at ASC',
      [resourceType, resourceId],
    );
    return rows.map(flagRowToDomain);
  }
}

// ---------------------------------------------------------------------------
// Row → domain mappers
// ---------------------------------------------------------------------------

function policyRowToDomain(row: Record<string, unknown>): ExpiryPolicy {
  return {
    id: row.id as string,
    workspace_id: row.workspace_id as string,
    resource_type: row.resource_type as string,
    resource_id: row.resource_id as string,
    interval_days: row.interval_days as number,
    responsible_id: row.responsible_id as string | null,
    escalation: row.escalation as ExpiryPolicy['escalation'],
    auto_revoke_share: row.auto_revoke_share as boolean,
    created_at: toDate(row.created_at),
    created_by: row.created_by as string,
    updated_by: row.updated_by as string,
  };
}

function flagRowToDomain(row: Record<string, unknown>): FreshnessFlag {
  return {
    id: row.id as string,
    workspace_id: row.workspace_id as string,
    resource_type: row.resource_type as string,
    resource_id: row.resource_id as string,
    flagged_at: toDate(row.flagged_at),
    reason: row.reason as FreshnessFlag['reason'],
    resolved_at: row.resolved_at != null ? toDate(row.resolved_at) : null,
    resolved_by: row.resolved_by as string | null,
    created_at: toDate(row.created_at),
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Convert a timestamptz value (Date from pg, or string) to a Date. */
function toDate(val: unknown): Date {
  if (val instanceof Date) return val;
  if (typeof val === 'string') return new Date(val);
  return new Date(val as number);
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class StoreNotConfiguredError extends Error {
  readonly code = 'STORE_NOT_CONFIGURED' as const;
  constructor(public readonly op: string) {
    super(`pg store has no pool configured (op=${op})`);
    this.name = 'StoreNotConfiguredError';
  }
}

export class StoreNotImplementedError extends Error {
  readonly code = 'STORE_NOT_IMPLEMENTED' as const;
  constructor(
    public readonly op: string,
    public readonly args: Record<string, unknown>,
  ) {
    super(`pg store op ${op} not yet implemented; args=${JSON.stringify(args)}`);
    this.name = 'StoreNotImplementedError';
  }
}
