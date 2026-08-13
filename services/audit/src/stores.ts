/**
 * @domio/audit-service — storage abstractions.
 *
 * Two implementations:
 *   - {@link InMemoryAuditStore}: used in tests + dev. Keeps a per-tenant
 *     list of events with linear scans.
 *   - {@link PgAuditStore}: production. Backed by `audit_event` table with
 *     the index from migration `0025_audit_event.up.sql`.
 *
 * The store is the only thing that touches SQL. The service layer (above)
 * consults only the store interface, so tests can swap implementations.
 */

import type {
  AuditEvent,
  AuditEventInput,
  AuditQuery,
  AuditQueryResult,
  AuditAction,
} from './types.js';
import { MAX_QUERY_LIMIT, DEFAULT_QUERY_LIMIT, FORBIDDEN_METADATA_KEYS } from './types.js';

// ---------------------------------------------------------------------------
// Store interface
// ---------------------------------------------------------------------------

export interface AuditStore {
  insert(event: AuditEvent): Promise<void>;
  insertMany(events: readonly AuditEvent[]): Promise<void>;
  query(q: AuditQuery): Promise<AuditQueryResult>;
  deleteOlderThan(tenantId: string, cutoff: Date): Promise<number>;
  countOlderThan(tenantId: string, cutoff: Date): Promise<number>;
}

// ---------------------------------------------------------------------------
// Validation — run before any insert
// ---------------------------------------------------------------------------

const VALID_ACTIONS: ReadonlySet<string> = new Set<string>([
  'auth.login',
  'auth.login_failure',
  'auth.logout',
  'auth.mfa_enrolled',
  'auth.mfa_unenrolled',
  'auth.password_changed',
  'user.created',
  'user.disabled',
  'user.role_changed',
  'deck.created',
  'deck.edited',
  'deck.deleted',
  'deck.shared',
  'deck.unshared',
  'deck.exported',
  'share.created',
  'share.revoked',
  'billing.changed',
  'dlp.warning_shown',
  'dlp.bypass_acknowledged',
  'policy.denied',
  'rate_limit.exceeded',
  'rate_limit.anomaly',
  'tenant.circuit_breaker_engaged',
]);

const FORBIDDEN_LOWER: ReadonlySet<string> = new Set<string>(
  FORBIDDEN_METADATA_KEYS.map((k) => k.toLowerCase()),
);

export function validateEventInput(input: AuditEventInput): void {
  if (!input.tenantId || typeof input.tenantId !== 'string') {
    throw new Error('audit: tenantId required');
  }
  if (!VALID_ACTIONS.has(input.action)) {
    throw new Error(`audit: unknown action "${input.action}"`);
  }
  if (input.metadata) {
    for (const k of Object.keys(input.metadata)) {
      if (FORBIDDEN_LOWER.has(k.toLowerCase())) {
        throw new Error(`audit: forbidden metadata key "${k}"`);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// In-memory store (tests + dev)
// ---------------------------------------------------------------------------

export class InMemoryAuditStore implements AuditStore {
  private events: AuditEvent[] = [];

  async insert(event: AuditEvent): Promise<void> {
    this.events.push(event);
  }

  async insertMany(events: readonly AuditEvent[]): Promise<void> {
    for (const e of events) this.events.push(e);
  }

  async query(q: AuditQuery): Promise<AuditQueryResult> {
    const limit = Math.min(q.limit ?? DEFAULT_QUERY_LIMIT, MAX_QUERY_LIMIT);
    const offset = q.offset ?? 0;

    const filtered = this.events.filter((e) => {
      if (e.tenantId !== q.tenantId) return false;
      if (q.actorId && e.actorId !== q.actorId) return false;
      if (q.action) {
        const actions = Array.isArray(q.action) ? q.action : [q.action as AuditAction];
        if (!actions.includes(e.action)) return false;
      }
      if (q.targetKind && e.targetKind !== q.targetKind) return false;
      if (q.targetId && e.targetId !== q.targetId) return false;
      if (q.from && e.createdAt < q.from) return false;
      if (q.to && e.createdAt >= q.to) return false;
      return true;
    });

    // Newest first
    filtered.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    return {
      events: filtered.slice(offset, offset + limit),
      total: filtered.length,
    };
  }

  async deleteOlderThan(tenantId: string, cutoff: Date): Promise<number> {
    const before = this.events.length;
    this.events = this.events.filter((e) => !(e.tenantId === tenantId && e.createdAt < cutoff));
    return before - this.events.length;
  }

  async countOlderThan(tenantId: string, cutoff: Date): Promise<number> {
    return this.events.filter((e) => e.tenantId === tenantId && e.createdAt < cutoff).length;
  }

  /** Test-only: snapshot the store. */
  snapshot(): readonly AuditEvent[] {
    return [...this.events];
  }
}

// ---------------------------------------------------------------------------
// Postgres store (production)
// ---------------------------------------------------------------------------

/**
 * Postgres-backed audit store. This class is intentionally thin — it
 * delegates SQL to a {@link PgClient} interface so we can mock the pool
 * in tests without spinning up Postgres.
 */
export interface PgClient {
  query<T = unknown>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ rows: T[]; rowCount: number }>;
}

export class PgAuditStore implements AuditStore {
  constructor(private readonly pg: PgClient) {}

  async insert(event: AuditEvent): Promise<void> {
    await this.pg.query(
      `INSERT INTO audit_event (
         id, tenant_id, actor_id, actor_kind, action,
         target_kind, target_id, metadata, ip, user_agent, created_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        event.id,
        event.tenantId,
        event.actorId,
        event.actorKind,
        event.action,
        event.targetKind,
        event.targetId,
        JSON.stringify(event.metadata),
        event.ip,
        event.userAgent,
        event.createdAt,
      ],
    );
  }

  async insertMany(events: readonly AuditEvent[]): Promise<void> {
    if (events.length === 0) return;
    // Use a single transaction via BEGIN/COMMIT
    await this.pg.query('BEGIN');
    try {
      for (const e of events) {
        await this.insert(e);
      }
      await this.pg.query('COMMIT');
    } catch (err) {
      await this.pg.query('ROLLBACK');
      throw err;
    }
  }

  async query(q: AuditQuery): Promise<AuditQueryResult> {
    const limit = Math.min(q.limit ?? DEFAULT_QUERY_LIMIT, MAX_QUERY_LIMIT);
    const offset = q.offset ?? 0;

    const where: string[] = ['tenant_id = $1'];
    const params: unknown[] = [q.tenantId];

    if (q.actorId) {
      params.push(q.actorId);
      where.push(`actor_id = $${params.length}`);
    }
    if (q.action) {
      const actions = Array.isArray(q.action) ? q.action : [q.action];
      params.push(actions);
      where.push(`action = ANY($${params.length}::text[])`);
    }
    if (q.targetKind) {
      params.push(q.targetKind);
      where.push(`target_kind = $${params.length}`);
    }
    if (q.targetId) {
      params.push(q.targetId);
      where.push(`target_id = $${params.length}`);
    }
    if (q.from) {
      params.push(q.from);
      where.push(`created_at >= $${params.length}`);
    }
    if (q.to) {
      params.push(q.to);
      where.push(`created_at < $${params.length}`);
    }

    params.push(limit);
    const limitIdx = params.length;
    params.push(offset);
    const offsetIdx = params.length;

    const sql = `
      SELECT id, tenant_id, actor_id, actor_kind, action,
             target_kind, target_id, metadata, ip, user_agent, created_at
      FROM audit_event
      WHERE ${where.join(' AND ')}
      ORDER BY created_at DESC
      LIMIT $${limitIdx} OFFSET $${offsetIdx}
    `;

    const countSql = `SELECT count(*)::int AS n FROM audit_event WHERE ${where.join(' AND ')}`;
    const [page, total] = await Promise.all([
      this.pg.query<RawRow>(sql, params),
      this.pg.query<{ n: number }>(countSql, params.slice(0, params.length - 2)),
    ]);

    return {
      events: page.rows.map(rowToEvent),
      total: total.rows[0]?.n ?? 0,
    };
  }

  async deleteOlderThan(tenantId: string, cutoff: Date): Promise<number> {
    const res = await this.pg.query(
      `DELETE FROM audit_event WHERE tenant_id = $1 AND created_at < $2`,
      [tenantId, cutoff],
    );
    return res.rowCount;
  }

  async countOlderThan(tenantId: string, cutoff: Date): Promise<number> {
    const res = await this.pg.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM audit_event WHERE tenant_id = $1 AND created_at < $2`,
      [tenantId, cutoff],
    );
    return res.rows[0]?.n ?? 0;
  }
}

// ---------------------------------------------------------------------------
// Row mapping
// ---------------------------------------------------------------------------

interface RawRow {
  id: string;
  tenant_id: string;
  actor_id: string | null;
  actor_kind: string;
  action: string;
  target_kind: string | null;
  target_id: string | null;
  metadata: Record<string, unknown> | string;
  ip: string | null;
  user_agent: string | null;
  created_at: Date | string;
}

function rowToEvent(row: RawRow): AuditEvent {
  const metadata =
    typeof row.metadata === 'string'
      ? (JSON.parse(row.metadata) as Record<string, unknown>)
      : (row.metadata as Record<string, unknown>);
  return {
    id: row.id,
    tenantId: row.tenant_id,
    actorId: row.actor_id,
    actorKind: row.actor_kind as AuditEvent['actorKind'],
    action: row.action as AuditEvent['action'],
    targetKind: row.target_kind,
    targetId: row.target_id,
    metadata,
    ip: row.ip,
    userAgent: row.user_agent,
    createdAt: typeof row.created_at === 'string' ? new Date(row.created_at) : row.created_at,
  };
}
