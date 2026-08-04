/**
 * Postgres adapter (Phase 08).
 *
 * Credential-based adapter for PostgreSQL.
 * In fixture mode, uses an HTTP SQL gateway.
 */

import type {
  ConnectorAdapter,
  ConnectorId,
  AdapterContext,
  AuthKind,
  AuthStartSpec,
  AuthStartResult,
  AuthCallbackSpec,
  AuthCallbackResult,
  DiscoverSpec,
  DiscoverResult,
  QuerySpec,
  QueryResult,
  WriteSpec,
  WriteResult,
} from '../types.js';
import { NotImplementedError } from '../types.js';
import { normalize } from '../normalize.js';

export class PostgresAdapter implements ConnectorAdapter {
  readonly connector_id: ConnectorId = 'postgres';
  readonly version = '1.0.0';
  readonly auth_kind: AuthKind = 'credentials';

  async authStart(_ctx: AdapterContext, _spec: AuthStartSpec): Promise<AuthStartResult> {
    return { redirect_url: '', state: '', scope: '' };
  }

  async authCallback(_ctx: AdapterContext, _spec: AuthCallbackSpec): Promise<AuthCallbackResult> {
    return { credential_ref: { vault: 'phase-01', path: `connectors/${_ctx.tenant_id}/pg_creds` } };
  }

  async ping(ctx: AdapterContext): Promise<{ ok: boolean; latency_ms: number }> {
    const t0 = Date.now();
    await ctx.transport.request({ method: 'POST', url: 'http://sql-gateway:3000/ping', body: { engine: 'postgres' } });
    return { ok: true, latency_ms: Date.now() - t0 };
  }

  async discover(_ctx: AdapterContext, _spec: DiscoverSpec): Promise<DiscoverResult> {
    return {
      tables: [{
        name: 'public.users',
        columns: [
          { name: 'id', type: 'number', semantic_role: 'id' },
          { name: 'email', type: 'string', semantic_role: 'dimension', pii_detected: 'medium' },
          { name: 'name', type: 'string', semantic_role: 'dimension' },
        ],
        row_count_estimate: 1000,
      }],
    };
  }

  async query(ctx: AdapterContext, spec: QuerySpec): Promise<QueryResult> {
    const t0 = Date.now();
    const resp = await ctx.transport.request({
      method: 'POST',
      url: 'http://sql-gateway:3000/query',
      body: { engine: 'postgres', sql: spec.sql, params: spec.params },
    });
    const body = resp.body as { columns: Array<{ name: string; type: string }>; rows: unknown[][]; row_count: number };
    const colNames = body.columns.map((c) => c.name);
    const canonical = normalize(colNames, body.rows);
    return {
      rows: canonical.rows,
      columns: canonical.columns,
      stats: { duration_ms: Date.now() - t0, row_count: body.row_count, source: 'live' },
    };
  }

  async write(_ctx: AdapterContext, _spec: WriteSpec): Promise<WriteResult> {
    throw new NotImplementedError('write for postgres');
  }
}
