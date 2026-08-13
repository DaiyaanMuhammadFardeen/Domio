/**
 * @domio/presenter-session — Postgres store.
 *
 * Maps the `presenter_session` table to the PresenterSessionStore interface.
 * Uses node-postgres (pg) under the hood. The runner of this service is
 * expected to construct a Pool and pass it in.
 *
 * Audit emission is NOT done here — the service layer wraps every write
 * with `audit.emit(...)`.
 */

import type { PoolClient } from 'pg';
import {
  conflictError,
  endedError,
  notFoundError,
  type PresenterSessionStore,
  type UpdateSessionRow,
} from './store.js';
import type {
  DisplayProfileSnapshot,
  ParkingLotDigest,
  PipConfig,
  PresenterSession,
  SessionMode,
  StageState,
} from '../types.js';

export interface PgClient {
  query<T = unknown>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
  /** For transactions. */
  withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T>;
}

function rowToSession(row: unknown): PresenterSession {
  const r = row as Record<string, unknown>;
  return {
    id: r.id as string,
    workspace_id: r.workspace_id as string,
    deck_id: r.deck_id as string,
    presenter_id: r.presenter_id as string,
    state: r.state as StageState,
    agenda_timers: (r.agenda_timers ?? []) as PresenterSession['agenda_timers'],
    parking_lot: (r.parking_lot ?? {
      pinned_count: 0,
      open_count: 0,
      pinned_ids: [],
    }) as ParkingLotDigest,
    display_profile: (r.display_profile ?? {}) as DisplayProfileSnapshot,
    pip_config: (r.pip_config ?? {
      position: 'corner',
      shape: 'rect',
      width_px: 320,
      height_px: 240,
      virtual_background: 'none',
      shadow: true,
      segmentation_model: 'mediapipe_selfie',
    }) as PipConfig,
    mode: r.mode as SessionMode,
    version: Number(r.version),
    started_at: (r.started_at instanceof Date
      ? r.started_at
      : new Date(r.started_at as string | number)
    ).toISOString(),
    ended_at: r.ended_at
      ? (r.ended_at instanceof Date
          ? r.ended_at
          : new Date(r.ended_at as string | number)
        ).toISOString()
      : null,
    last_heartbeat_at: r.last_heartbeat_at
      ? (r.last_heartbeat_at instanceof Date
          ? r.last_heartbeat_at
          : new Date(r.last_heartbeat_at as string | number)
        ).toISOString()
      : null,
  };
}

export class PgPresenterSessionStore implements PresenterSessionStore {
  constructor(private readonly pg: PgClient) {}

  async create(row: { session: PresenterSession }): Promise<PresenterSession> {
    const { session } = row;
    const result = await this.pg.query(
      `INSERT INTO presenter_session (
        id, workspace_id, deck_id, presenter_id,
        state, agenda_timers, parking_lot, display_profile, pip_config,
        mode, version, started_at, ended_at, last_heartbeat_at
      ) VALUES (
        $1, $2, $3, $4,
        $5, $6, $7, $8, $9,
        $10, $11, $12, $13, $14
      ) RETURNING *`,
      [
        session.id,
        session.workspace_id,
        session.deck_id,
        session.presenter_id,
        session.state,
        JSON.stringify(session.agenda_timers),
        JSON.stringify(session.parking_lot),
        JSON.stringify(session.display_profile),
        JSON.stringify(session.pip_config),
        session.mode,
        session.version,
        session.started_at,
        session.ended_at,
        session.last_heartbeat_at,
      ],
    );
    return rowToSession(result.rows[0]);
  }

  async getById(id: string): Promise<PresenterSession | null> {
    const result = await this.pg.query(`SELECT * FROM presenter_session WHERE id = $1 LIMIT 1`, [
      id,
    ]);
    if (result.rows.length === 0) return null;
    return rowToSession(result.rows[0]);
  }

  async getActiveByPresenter(
    workspaceId: string,
    presenterId: string,
  ): Promise<PresenterSession | null> {
    const result = await this.pg.query(
      `SELECT * FROM presenter_session
        WHERE workspace_id = $1 AND presenter_id = $2 AND ended_at IS NULL
        ORDER BY started_at DESC LIMIT 1`,
      [workspaceId, presenterId],
    );
    if (result.rows.length === 0) return null;
    return rowToSession(result.rows[0]);
  }

  async update(row: UpdateSessionRow): Promise<PresenterSession> {
    const { next, expected_version } = row;
    const result = await this.pg.query(
      `UPDATE presenter_session SET
        state = $2,
        agenda_timers = $3,
        parking_lot = $4,
        display_profile = $5,
        pip_config = $6,
        mode = $7,
        version = $8,
        last_heartbeat_at = $9,
        updated_at = now()
      WHERE id = $1 AND version = $10 AND ended_at IS NULL
      RETURNING *`,
      [
        next.id,
        next.state,
        JSON.stringify(next.agenda_timers),
        JSON.stringify(next.parking_lot),
        JSON.stringify(next.display_profile),
        JSON.stringify(next.pip_config),
        next.mode,
        next.version,
        next.last_heartbeat_at,
        expected_version,
      ],
    );
    if (result.rows.length === 0) {
      // Either the row doesn't exist, the version is wrong, or it already ended.
      const current = await this.getById(next.id);
      if (!current) throw notFoundError(next.id);
      if (current.ended_at) throw endedError(next.id);
      throw conflictError(next.id, current.version);
    }
    return rowToSession(result.rows[0]);
  }

  async end(id: string, expectedVersion: number): Promise<PresenterSession> {
    const result = await this.pg.query(
      `UPDATE presenter_session SET
        ended_at = now(),
        version = version + 1,
        updated_at = now()
      WHERE id = $1 AND version = $2 AND ended_at IS NULL
      RETURNING *`,
      [id, expectedVersion],
    );
    if (result.rows.length === 0) {
      const current = await this.getById(id);
      if (!current) throw notFoundError(id);
      if (current.ended_at) throw endedError(id);
      throw conflictError(id, current.version);
    }
    return rowToSession(result.rows[0]);
  }

  async listActive(workspaceId: string): Promise<PresenterSession[]> {
    const result = await this.pg.query(
      `SELECT * FROM presenter_session
        WHERE workspace_id = $1 AND ended_at IS NULL
        ORDER BY started_at DESC`,
      [workspaceId],
    );
    return result.rows.map(rowToSession);
  }
}

/** Adapter: a `pg.Pool` wrapped in a `PgClient`. */
export class PoolPgClient implements PgClient {
  constructor(
    private readonly pool: {
      query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }>;
      connect: () => Promise<PoolClient>;
    },
  ) {}

  async query<T>(sql: string, params?: unknown[]): Promise<{ rows: T[] }> {
    const result = await this.pool.query(sql, params);
    return { rows: result.rows as T[] };
  }

  async withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }
}
