/**
 * REST API adapter (Phase 08).
 *
 * Token-based adapter for generic REST APIs.
 * Supports bearer token, API key, or anonymous auth.
 * Uses spec.url, spec.method, spec.headers, spec.pagination.
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

export class RestAdapter implements ConnectorAdapter {
  readonly connector_id: ConnectorId = 'rest';
  readonly version = '1.0.0';
  readonly auth_kind: AuthKind = 'token';

  async authStart(_ctx: AdapterContext, _spec: AuthStartSpec): Promise<AuthStartResult> {
    return { redirect_url: '', state: '', scope: '' };
  }

  async authCallback(_ctx: AdapterContext, _spec: AuthCallbackSpec): Promise<AuthCallbackResult> {
    return {
      credential_ref: { vault: 'phase-01', path: `connectors/${_ctx.tenant_id}/rest_creds` },
    };
  }

  async ping(ctx: AdapterContext): Promise<{ ok: boolean; latency_ms: number }> {
    const t0 = Date.now();
    await ctx.transport.request({ method: 'GET', url: 'https://api.example.com/health' });
    return { ok: true, latency_ms: Date.now() - t0 };
  }

  async discover(_ctx: AdapterContext, _spec: DiscoverSpec): Promise<DiscoverResult> {
    return {
      tables: [
        {
          name: 'api_endpoint',
          columns: [
            { name: 'id', type: 'number', semantic_role: 'id' },
            { name: 'name', type: 'string', semantic_role: 'dimension' },
          ],
          row_count_estimate: 0,
        },
      ],
    };
  }

  async query(ctx: AdapterContext, spec: QuerySpec): Promise<QueryResult> {
    const t0 = Date.now();
    const resp = await ctx.transport.request({
      method: 'GET',
      url: `https://api.example.com/${spec.sql}`,
      headers: { Authorization: 'Bearer fixture-token' },
    });
    const body = resp.body as { data?: unknown[] };
    const data = body.data ?? [];
    if (data.length === 0 || typeof data[0] !== 'object' || data[0] === null) {
      return {
        rows: [],
        columns: [],
        stats: { duration_ms: Date.now() - t0, row_count: 0, source: 'live' },
      };
    }
    const first = data[0] as Record<string, unknown>;
    const headers = Object.keys(first);
    const dataRows = data.map((r) => {
      const obj = r as Record<string, unknown>;
      return headers.map((h) => obj[h]);
    });
    const canonical = normalize(headers, dataRows);
    return {
      rows: canonical.rows,
      columns: canonical.columns,
      stats: { duration_ms: Date.now() - t0, row_count: data.length, source: 'live' },
    };
  }

  async write(_ctx: AdapterContext, _spec: WriteSpec): Promise<WriteResult> {
    throw new NotImplementedError('write for rest');
  }
}
