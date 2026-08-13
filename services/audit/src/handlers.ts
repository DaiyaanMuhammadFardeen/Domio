/**
 * @domio/audit-service — REST handlers.
 *
 * Mounted under `/v1/admin/audit`:
 *   - GET  /v1/admin/audit?actor=…&action=…&from=…&to=…&limit=…&offset=…
 *   - GET  /v1/admin/audit/export?actor=…&action=…&from=…&to=…
 *   - POST /v1/admin/audit/retention/run   { retentionDays?: number }
 *   - POST /v1/admin/audit/retention/dry-run   { retentionDays?: number }
 *
 * The tenant is resolved from the caller's auth context (session JWT or
 * internal service token). The handler does NOT trust a tenantId from
 * the query string — it must be derived server-side.
 */

import type { AuditService } from './service.js';
import type { AuditAction, AuditQuery } from './types.js';
import { AUDIT_ACTIONS, MAX_QUERY_LIMIT, DEFAULT_QUERY_LIMIT } from './types.js';

// ---------------------------------------------------------------------------
// Caller context
// ---------------------------------------------------------------------------

export interface AuditCallerContext {
  /** Caller's tenant id — derived from auth, not request body. */
  readonly tenantId: string;
  /** Required role to read audit events. */
  readonly role: 'owner' | 'admin' | 'compliance-admin' | 'system';
}

// ---------------------------------------------------------------------------
// Query parsing
// ---------------------------------------------------------------------------

export interface AuditQueryRequest {
  readonly actor?: string;
  readonly action?: string;
  readonly targetKind?: string;
  readonly targetId?: string;
  readonly from?: string;
  readonly to?: string;
  readonly limit?: string;
  readonly offset?: string;
}

export function parseAuditQuery(req: AuditQueryRequest, ctx: AuditCallerContext): AuditQuery {
  const builder: {
    tenantId: string;
    actorId?: string;
    action?: AuditAction | readonly AuditAction[];
    targetKind?: string;
    targetId?: string;
    from?: Date;
    to?: Date;
    limit?: number;
    offset?: number;
  } = { tenantId: ctx.tenantId };

  if (req.actor) builder.actorId = req.actor;
  if (req.action) {
    const parts = req.action
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const valid: AuditAction[] = [];
    for (const p of parts) {
      if (AUDIT_ACTIONS.includes(p as AuditAction)) {
        valid.push(p as AuditAction);
      }
    }
    if (valid.length === 1) {
      builder.action = valid[0]!;
    } else if (valid.length > 1) {
      builder.action = valid;
    }
  }
  if (req.targetKind) builder.targetKind = req.targetKind;
  if (req.targetId) builder.targetId = req.targetId;
  if (req.from) {
    const d = new Date(req.from);
    if (isNaN(d.getTime())) throw new Error(`invalid from: ${req.from}`);
    builder.from = d;
  }
  if (req.to) {
    const d = new Date(req.to);
    if (isNaN(d.getTime())) throw new Error(`invalid to: ${req.to}`);
    builder.to = d;
  }
  if (req.limit) {
    const n = parseInt(req.limit, 10);
    if (isNaN(n) || n < 1) throw new Error(`invalid limit: ${req.limit}`);
    builder.limit = Math.min(n, MAX_QUERY_LIMIT);
  } else {
    builder.limit = DEFAULT_QUERY_LIMIT;
  }
  if (req.offset) {
    const n = parseInt(req.offset, 10);
    if (isNaN(n) || n < 0) throw new Error(`invalid offset: ${req.offset}`);
    builder.offset = n;
  }
  return builder as AuditQuery;
}

const READ_ROLES: ReadonlySet<string> = new Set(['owner', 'admin', 'compliance-admin', 'system']);

function assertCanRead(ctx: AuditCallerContext): void {
  if (!READ_ROLES.has(ctx.role)) {
    throw new Error(`role ${ctx.role} cannot read audit events`);
  }
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

export interface AuditApiResponse {
  readonly status: number;
  readonly body: unknown;
  readonly headers?: Record<string, string>;
}

export class AuditHandlers {
  constructor(private readonly service: AuditService) {}

  async list(req: AuditQueryRequest, ctx: AuditCallerContext): Promise<AuditApiResponse> {
    assertCanRead(ctx);
    const q = parseAuditQuery(req, ctx);
    const result = await this.service.query(q);
    return {
      status: 200,
      body: {
        events: result.events.map(serializeEvent),
        total: result.total,
        limit: q.limit ?? DEFAULT_QUERY_LIMIT,
        offset: q.offset ?? 0,
      },
    };
  }

  async export(req: AuditQueryRequest, ctx: AuditCallerContext): Promise<AuditApiResponse> {
    assertCanRead(ctx);
    const q = parseAuditQuery(req, ctx);
    const csv = await this.service.exportCsv(q);
    return {
      status: 200,
      body: csv,
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="audit-${ctx.tenantId}.csv"`,
      },
    };
  }

  async retentionRun(
    body: { retentionDays?: number },
    ctx: AuditCallerContext,
  ): Promise<AuditApiResponse> {
    assertCanRead(ctx);
    const record = await this.service.runRetention(ctx.tenantId, body.retentionDays);
    return {
      status: 200,
      body: {
        tenantId: record.tenantId,
        runAt: record.runAt.toISOString(),
        rowsDeleted: record.rowsDeleted,
      },
    };
  }

  async retentionDryRun(
    body: { retentionDays?: number },
    ctx: AuditCallerContext,
  ): Promise<AuditApiResponse> {
    assertCanRead(ctx);
    const n = await this.service.dryRunRetention(ctx.tenantId, body.retentionDays);
    return {
      status: 200,
      body: {
        tenantId: ctx.tenantId,
        rowsThatWouldBeDeleted: n,
      },
    };
  }
}

// ---------------------------------------------------------------------------
// Serialization
// ---------------------------------------------------------------------------

export function serializeEvent(e: {
  id: string;
  tenantId: string;
  actorId: string | null;
  actorKind: string;
  action: string;
  targetKind: string | null;
  targetId: string | null;
  metadata: Record<string, unknown>;
  ip: string | null;
  userAgent: string | null;
  createdAt: Date;
}): Record<string, unknown> {
  return {
    id: e.id,
    tenantId: e.tenantId,
    actorId: e.actorId,
    actorKind: e.actorKind,
    action: e.action,
    targetKind: e.targetKind,
    targetId: e.targetId,
    metadata: e.metadata,
    ip: e.ip,
    userAgent: e.userAgent,
    createdAt: e.createdAt.toISOString(),
  };
}
