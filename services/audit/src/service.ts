/**
 * @domio/audit-service — service layer.
 *
 * The outbox pattern (P20.5 §4.2.2): `emit()` is synchronous in the same
 * transaction as the source action. Callers wrap their business action
 * in a DB transaction and call `emit()` with the SAME client so the audit
 * row and the source commit atomically.
 *
 * For callers that don't have an explicit transaction (e.g. a fire-and-
 * forget background job), `emitAsync()` is provided.
 */

import type { AuditEvent, AuditEventInput, AuditQuery, AuditQueryResult } from './types.js';
import {
  AuditRetentionRunRecord,
  DEFAULT_RETENTION_DAYS,
  MAX_QUERY_LIMIT,
  DEFAULT_QUERY_LIMIT,
} from './types.js';
import type { AuditStore, PgClient } from './stores.js';
import { InMemoryAuditStore, PgAuditStore, validateEventInput } from './stores.js';

// ---------------------------------------------------------------------------
// Outbox support
// ---------------------------------------------------------------------------

/**
 * Outbox client variant — accepts a {@link PgClient} so the audit insert
 * participates in the same transaction as the source action. The default
 * {@link AuditService.emit} uses this transparently if a client is passed.
 */
export interface OutboxContext {
  readonly pg: PgClient;
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const defaultId = (): string => {
  const chars = '0123456789abcdef';
  let out = '';
  for (let i = 0; i < 26; i++) out += chars[Math.floor(Math.random() * 16)]!;
  return out;
};

// ---------------------------------------------------------------------------
// Service options
// ---------------------------------------------------------------------------

export interface AuditServiceOptions {
  readonly store?: AuditStore;
  readonly idGenerator?: () => string;
  readonly clock?: () => Date;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class AuditService {
  private readonly store: AuditStore;
  private readonly idGen: () => string;
  private readonly clock: () => Date;

  constructor(opts: AuditServiceOptions = {}) {
    this.store = opts.store ?? new InMemoryAuditStore();
    this.idGen = opts.idGenerator ?? defaultId;
    this.clock = opts.clock ?? (() => new Date());
  }

  /**
   * Emit an audit event. If `outbox` is provided, the insert joins the
   * caller's transaction (outbox pattern). Otherwise, the event is written
   * via the standalone store (acceptable for fire-and-forget background
   * jobs but not for source actions that must commit atomically).
   */
  async emit(input: AuditEventInput, outbox?: OutboxContext): Promise<AuditEvent> {
    validateEventInput(input);
    const event: AuditEvent = {
      id: this.idGen(),
      tenantId: input.tenantId,
      actorId: input.actorId ?? null,
      actorKind: input.actorKind ?? 'user',
      action: input.action,
      targetKind: input.targetKind ?? null,
      targetId: input.targetId ?? null,
      metadata: input.metadata ?? {},
      ip: input.ip ?? null,
      userAgent: input.userAgent ?? null,
      createdAt: this.clock(),
    };

    if (outbox) {
      // Use the same Postgres client the caller is using for their
      // business-action transaction. Audit row commits or rolls back
      // atomically with the source.
      const store = new PgAuditStore(outbox.pg);
      await store.insert(event);
    } else {
      await this.store.insert(event);
    }

    return event;
  }

  /** Bulk emit — useful for migrations and replay tools. */
  async emitMany(inputs: readonly AuditEventInput[]): Promise<readonly AuditEvent[]> {
    const events: AuditEvent[] = [];
    for (const input of inputs) {
      events.push(await this.emit(input));
    }
    return events;
  }

  /** Query events for a tenant. */
  async query(q: AuditQuery): Promise<AuditQueryResult> {
    return this.store.query(q);
  }

  /**
   * Run the retention sweep. Deletes rows older than `retentionDays` for
   * the given tenant (default 90 days per §4.2.5). Returns the number of
   * rows deleted. Idempotent.
   */
  async runRetention(
    tenantId: string,
    retentionDays: number = DEFAULT_RETENTION_DAYS,
  ): Promise<AuditRetentionRunRecord> {
    if (retentionDays < 1) throw new Error('retentionDays must be >= 1');
    const cutoff = new Date(this.clock().getTime() - retentionDays * 86_400_000);
    const deleted = await this.store.deleteOlderThan(tenantId, cutoff);
    return new AuditRetentionRunRecord(tenantId, this.clock(), deleted);
  }

  /** Dry-run variant: count rows that WOULD be deleted. */
  async dryRunRetention(
    tenantId: string,
    retentionDays: number = DEFAULT_RETENTION_DAYS,
  ): Promise<number> {
    const cutoff = new Date(this.clock().getTime() - retentionDays * 86_400_000);
    return this.store.countOlderThan(tenantId, cutoff);
  }

  /**
   * Export query results as CSV. RFC 4180 quoting; nulls rendered as empty.
   * Header row included.
   */
  async exportCsv(q: AuditQuery): Promise<string> {
    // Override the limit ceiling for export: cap at 10 000 rows.
    const exportLimit = 10_000;
    const result = await this.store.query({
      ...q,
      limit: Math.min(q.limit ?? exportLimit, exportLimit),
      offset: 0,
    });
    return toCsv(result.events);
  }
}

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

const CSV_COLUMNS = [
  'id',
  'tenant_id',
  'actor_id',
  'actor_kind',
  'action',
  'target_kind',
  'target_id',
  'ip',
  'user_agent',
  'created_at',
  'metadata',
] as const;

export function toCsv(events: readonly AuditEvent[]): string {
  const lines: string[] = [];
  lines.push(CSV_COLUMNS.join(','));
  for (const e of events) {
    lines.push(CSV_COLUMNS.map((c) => csvField(e, c)).join(','));
  }
  return lines.join('\n') + '\n';
}

function csvField(e: AuditEvent, col: (typeof CSV_COLUMNS)[number]): string {
  let raw: unknown;
  switch (col) {
    case 'id':
      raw = e.id;
      break;
    case 'tenant_id':
      raw = e.tenantId;
      break;
    case 'actor_id':
      raw = e.actorId;
      break;
    case 'actor_kind':
      raw = e.actorKind;
      break;
    case 'action':
      raw = e.action;
      break;
    case 'target_kind':
      raw = e.targetKind;
      break;
    case 'target_id':
      raw = e.targetId;
      break;
    case 'ip':
      raw = e.ip;
      break;
    case 'user_agent':
      raw = e.userAgent;
      break;
    case 'created_at':
      raw = e.createdAt.toISOString();
      break;
    case 'metadata':
      raw = JSON.stringify(e.metadata);
      break;
  }
  return escapeCsv(raw);
}

function escapeCsv(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  if (/[",\n\r]/.test(s)) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

// ---------------------------------------------------------------------------
// Re-exports for convenience
// ---------------------------------------------------------------------------

export {
  InMemoryAuditStore,
  PgAuditStore,
  validateEventInput,
  MAX_QUERY_LIMIT,
  DEFAULT_QUERY_LIMIT,
};
