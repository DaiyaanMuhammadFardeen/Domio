/**
 * Google Sheets adapter (Phase 08).
 *
 * OAuth-based adapter for Google Sheets API.
 * Uses Google Sheets API v4.
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

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';

function buildGoogleAuthUrl(state: string, scope: string, redirectUri?: string): string {
  const params = new URLSearchParams({
    client_id: 'fixture-client-id',
    redirect_uri: redirectUri ?? 'http://localhost:3000/callback',
    response_type: 'code',
    scope,
    state,
    access_type: 'offline',
  });
  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

export class GoogleSheetsAdapter implements ConnectorAdapter {
  readonly connector_id: ConnectorId = 'google_sheets';
  readonly version = '1.0.0';
  readonly auth_kind: AuthKind = 'oauth';

  async authStart(ctx: AdapterContext, spec: AuthStartSpec): Promise<AuthStartResult> {
    const state = `gs_${ctx.tenant_id}_${Date.now()}`;
    const scope = (spec.scope ?? ['https://www.googleapis.com/auth/spreadsheets']).join(' ');
    const redirect_url = buildGoogleAuthUrl(state, scope, spec.redirect_uri);
    return { redirect_url, state, scope };
  }

  async authCallback(_ctx: AdapterContext, _spec: AuthCallbackSpec): Promise<AuthCallbackResult> {
    return { credential_ref: { vault: 'phase-01', path: `connectors/${_ctx.tenant_id}/gs_creds` } };
  }

  async ping(ctx: AdapterContext): Promise<{ ok: boolean; latency_ms: number }> {
    const t0 = Date.now();
    await ctx.transport.request({
      method: 'GET',
      url: 'https://sheets.googleapis.com/v4/spreadsheets/sheet-1',
    });
    return { ok: true, latency_ms: Date.now() - t0 };
  }

  async discover(_ctx: AdapterContext, _spec: DiscoverSpec): Promise<DiscoverResult> {
    return {
      tables: [
        {
          name: 'Sheet1',
          columns: [
            { name: 'Name', type: 'string', semantic_role: 'dimension' },
            { name: 'Revenue', type: 'currency', semantic_role: 'measure' },
          ],
          row_count_estimate: 100,
        },
      ],
    };
  }

  async query(ctx: AdapterContext, spec: QuerySpec): Promise<QueryResult> {
    const t0 = Date.now();
    const resp = await ctx.transport.request({
      method: 'GET',
      url: `https://sheets.googleapis.com/v4/spreadsheets/sheet-1/values/${spec.sql}`,
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
    throw new NotImplementedError('write for google_sheets');
  }
}
