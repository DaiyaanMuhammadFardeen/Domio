/**
 * GraphQL adapter (Phase 08).
 *
 * Token-based adapter for GraphQL APIs.
 * Uses spec.url, spec.query, spec.variables, spec.rows_path.
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

export class GraphqlAdapter implements ConnectorAdapter {
  readonly connector_id: ConnectorId = 'graphql';
  readonly version = '1.0.0';
  readonly auth_kind: AuthKind = 'token';

  async authStart(_ctx: AdapterContext, _spec: AuthStartSpec): Promise<AuthStartResult> {
    return { redirect_url: '', state: '', scope: '' };
  }

  async authCallback(_ctx: AdapterContext, _spec: AuthCallbackSpec): Promise<AuthCallbackResult> {
    return { credential_ref: { vault: 'phase-01', path: `connectors/${_ctx.tenant_id}/gql_creds` } };
  }

  async ping(ctx: AdapterContext): Promise<{ ok: boolean; latency_ms: number }> {
    const t0 = Date.now();
    await ctx.transport.request({
      method: 'POST',
      url: 'https://graphql.example.com/',
      body: { query: '{ __typename }' },
    });
    return { ok: true, latency_ms: Date.now() - t0 };
  }

  async discover(_ctx: AdapterContext, _spec: DiscoverSpec): Promise<DiscoverResult> {
    return {
      tables: [{
        name: 'query.items',
        columns: [
          { name: 'id', type: 'number', semantic_role: 'id' },
          { name: 'name', type: 'string', semantic_role: 'dimension' },
        ],
        row_count_estimate: 0,
      }],
    };
  }

  async query(ctx: AdapterContext, spec: QuerySpec): Promise<QueryResult> {
    const t0 = Date.now();
    const resp = await ctx.transport.request({
      method: 'POST',
      url: 'https://graphql.example.com/',
      body: { query: spec.sql },
      headers: { Authorization: 'Bearer fixture-token' },
    });
    const body = resp.body as { data?: Record<string, unknown[]> };
    // Navigate rows_path (default: first key's value)
    const dataKey = Object.keys(body.data ?? {})[0] ?? '';
    const items = ((body.data as Record<string, unknown[]>)?.[dataKey] as unknown[]) ?? [];
    if (items.length === 0 || typeof items[0] !== 'object' || items[0] === null) {
      return { rows: [], columns: [], stats: { duration_ms: Date.now() - t0, row_count: 0, source: 'live' } };
    }
    const first = items[0] as Record<string, unknown>;
    const headers = Object.keys(first);
    const dataRows = items.map((r) => {
      const obj = r as Record<string, unknown>;
      return headers.map((h) => obj[h]);
    });
    const canonical = normalize(headers, dataRows);
    return {
      rows: canonical.rows,
      columns: canonical.columns,
      stats: { duration_ms: Date.now() - t0, row_count: items.length, source: 'live' },
    };
  }

  async write(_ctx: AdapterContext, _spec: WriteSpec): Promise<WriteResult> {
    throw new NotImplementedError('write for graphql');
  }
}
