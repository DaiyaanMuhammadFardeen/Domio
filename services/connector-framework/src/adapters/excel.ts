/**
 * Excel adapter (Phase 08).
 *
 * OAuth-based adapter for Microsoft Excel via Graph API.
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

const MS_AUTH_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize';

function buildMsAuthUrl(state: string, scope: string, redirectUri?: string): string {
  const params = new URLSearchParams({
    client_id: 'fixture-client-id',
    redirect_uri: redirectUri ?? 'http://localhost:3000/callback',
    response_type: 'code',
    scope,
    state,
  });
  return `${MS_AUTH_URL}?${params.toString()}`;
}

export class ExcelAdapter implements ConnectorAdapter {
  readonly connector_id: ConnectorId = 'excel';
  readonly version = '1.0.0';
  readonly auth_kind: AuthKind = 'oauth';

  async authStart(ctx: AdapterContext, spec: AuthStartSpec): Promise<AuthStartResult> {
    const state = `xl_${ctx.tenant_id}_${Date.now()}`;
    const scope = (spec.scope ?? ['Files.Read.All']).join(' ');
    const redirect_url = buildMsAuthUrl(state, scope, spec.redirect_uri);
    return { redirect_url, state, scope };
  }

  async authCallback(_ctx: AdapterContext, _spec: AuthCallbackSpec): Promise<AuthCallbackResult> {
    return { credential_ref: { vault: 'phase-01', path: `connectors/${_ctx.tenant_id}/xl_creds` } };
  }

  async ping(ctx: AdapterContext): Promise<{ ok: boolean; latency_ms: number }> {
    const t0 = Date.now();
    await ctx.transport.request({
      method: 'GET',
      url: 'https://graph.microsoft.com/v1.0/me/drive/items',
    });
    return { ok: true, latency_ms: Date.now() - t0 };
  }

  async discover(_ctx: AdapterContext, _spec: DiscoverSpec): Promise<DiscoverResult> {
    return {
      tables: [
        {
          name: 'Sheet1',
          columns: [{ name: 'Column1', type: 'string', semantic_role: 'dimension' }],
          row_count_estimate: 50,
        },
      ],
    };
  }

  async query(ctx: AdapterContext, spec: QuerySpec): Promise<QueryResult> {
    const t0 = Date.now();
    const resp = await ctx.transport.request({
      method: 'GET',
      url: `https://graph.microsoft.com/v1.0/me/drive/items/${spec.sql}`,
    });
    const body = resp.body as { values?: string[][] };
    const rows = body.values ?? [];
    const headers = rows[0] ?? [];
    const dataRows = rows.slice(1);
    const canonical = normalize(headers, dataRows);
    return {
      rows: canonical.rows,
      columns: canonical.columns,
      stats: { duration_ms: Date.now() - t0, row_count: dataRows.length, source: 'live' },
    };
  }

  async write(_ctx: AdapterContext, _spec: WriteSpec): Promise<WriteResult> {
    throw new NotImplementedError('write for excel');
  }
}
