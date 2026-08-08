/**
 * pg-backed task-link store (Phase 18 #191).
 *
 * Full parameterized-SQL implementation of all {@link TaskLinkStore} methods.
 * Accepts a `Pool` (pg's public interface). Every method checks
 * `this.pool != null` upfront and throws {@link StoreNotConfiguredError}.
 *
 * SQL conventions (same as collab pg_store):
 *  - All queries use $N parameterised placeholders (no string interpolation).
 *  - jsonb columns (field_map): inserted via $N::jsonb, read via JSON.parse(row.col)
 *    since node-pg returns jsonb as a plain object.
 *  - timestamptz ↔ Date: node-pg returns Date for timestamptz; on insert
 *    we pass Date objects directly (pg handles conversion).
 *  - snake_case domain fields map 1:1 to snake_case DB columns.
 */

import type { Pool as PgPool } from 'pg';
import type { TaskLink } from '../types.js';
import { TaskLinkNotFoundError } from '../types.js';
import type { TaskLinkStore } from './store.js';

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export class PgTaskLinkStore implements TaskLinkStore {
  /** Public for test injection. */
  readonly pool: PgPool | null;

  constructor(pool: PgPool | null) {
    this.pool = pool;
  }

  // -------------------------------------------------------------------------
  // CRUD
  // -------------------------------------------------------------------------

  async saveLink(link: TaskLink): Promise<void> {
    if (!this.pool) throw new StoreNotConfiguredError('saveLink');
    await this.pool.query(
      `INSERT INTO task_link (
        id, workspace_id, assignment_id, vendor,
        external_task_id, external_project_id,
        field_map, sync_mode, last_synced_at,
        created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4,
        $5, $6,
        $7::jsonb, $8, $9,
        $10, $11
      )`,
      [
        link.id,
        link.workspace_id,
        link.assignment_id,
        link.vendor,
        link.external_task_id,
        link.external_project_id,
        JSON.stringify(link.field_map),
        link.sync_mode,
        link.last_synced_at,
        link.created_at,
        link.updated_at,
      ],
    );
  }

  async getLink(linkId: string): Promise<TaskLink | null> {
    if (!this.pool) throw new StoreNotConfiguredError('getLink');
    const { rows } = await this.pool.query(
      'SELECT * FROM task_link WHERE id = $1',
      [linkId],
    );
    if (rows.length === 0) return null;
    return taskLinkRowToDomain(rows[0]!);
  }

  async listLinks(workspaceId: string): Promise<TaskLink[]> {
    if (!this.pool) throw new StoreNotConfiguredError('listLinks');
    const { rows } = await this.pool.query(
      'SELECT * FROM task_link WHERE workspace_id = $1 ORDER BY created_at ASC',
      [workspaceId],
    );
    return rows.map(taskLinkRowToDomain);
  }

  async listLinksByAssignment(assignmentId: string): Promise<TaskLink[]> {
    if (!this.pool) throw new StoreNotConfiguredError('listLinksByAssignment');
    const { rows } = await this.pool.query(
      'SELECT * FROM task_link WHERE assignment_id = $1 ORDER BY created_at ASC',
      [assignmentId],
    );
    return rows.map(taskLinkRowToDomain);
  }

  async updateLink(
    linkId: string,
    patch: Partial<Pick<TaskLink, 'field_map' | 'sync_mode' | 'last_synced_at' | 'updated_at'>>,
  ): Promise<TaskLink> {
    if (!this.pool) throw new StoreNotConfiguredError('updateLink');

    const setClauses: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    // Scalar text fields
    if ('sync_mode' in patch) {
      setClauses.push(`sync_mode = $${idx++}`);
      params.push(patch.sync_mode);
    }

    // Nullable timestamptz fields
    if ('last_synced_at' in patch) {
      setClauses.push(`last_synced_at = $${idx++}`);
      params.push(patch.last_synced_at);
    }
    if ('updated_at' in patch) {
      setClauses.push(`updated_at = $${idx++}`);
      params.push(patch.updated_at);
    }

    // JSONB field
    if ('field_map' in patch) {
      setClauses.push(`field_map = $${idx++}::jsonb`);
      params.push(JSON.stringify(patch.field_map));
    }

    if (setClauses.length === 0) {
      // Nothing to update — just fetch and return
      const existing = await this.getLink(linkId);
      if (!existing) throw new TaskLinkNotFoundError(linkId);
      return existing;
    }

    // Always bump updated_at if the patch didn't already include it
    if (!('updated_at' in patch)) {
      setClauses.push(`updated_at = $${idx++}`);
      params.push(new Date());
    }

    params.push(linkId);
    const sql = `UPDATE task_link SET ${setClauses.join(', ')} WHERE id = $${idx} RETURNING *`;
    const { rows } = await this.pool.query(sql, params);
    if (rows.length === 0) throw new TaskLinkNotFoundError(linkId);
    return taskLinkRowToDomain(rows[0]!);
  }

  async deleteLink(linkId: string): Promise<void> {
    if (!this.pool) throw new StoreNotConfiguredError('deleteLink');
    const { rowCount } = await this.pool.query(
      'DELETE FROM task_link WHERE id = $1',
      [linkId],
    );
    if (rowCount === 0) throw new TaskLinkNotFoundError(linkId);
  }
}

// ---------------------------------------------------------------------------
// Row → domain mapper
// ---------------------------------------------------------------------------

/**
 * Convert a snake_case DB row to the TaskLink domain type.
 * DB columns already use snake_case which matches the domain interface.
 * jsonb column (field_map) comes back as a parsed object from node-pg.
 */
function taskLinkRowToDomain(row: Record<string, unknown>): TaskLink {
  return {
    id: row.id as string,
    workspace_id: row.workspace_id as string,
    assignment_id: row.assignment_id as string,
    vendor: row.vendor as TaskLink['vendor'],
    external_task_id: row.external_task_id as string,
    external_project_id: row.external_project_id as string,
    field_map: parseJsonb(row.field_map) as TaskLink['field_map'],
    sync_mode: row.sync_mode as TaskLink['sync_mode'],
    last_synced_at: row.last_synced_at != null ? toDate(row.last_synced_at) : null,
    created_at: toDate(row.created_at),
    updated_at: toDate(row.updated_at),
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Parse a jsonb value that may already be an object (from node-pg) or a string. */
function parseJsonb(val: unknown): unknown {
  if (val == null) return null;
  if (typeof val === 'string') return JSON.parse(val);
  // node-pg already deserializes jsonb into a JS object
  return val;
}

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
  constructor(public readonly op: string, public readonly args: Record<string, unknown>) {
    super(`pg store op ${op} not yet implemented; args=${JSON.stringify(args)}`);
    this.name = 'StoreNotImplementedError';
  }
}
