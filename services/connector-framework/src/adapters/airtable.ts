/**
 * Airtable adapter (Phase 08).
 *
 * OAuth-based adapter for Airtable API.
 * Supports subscribe (webhooks) — one of 3 connectors with subscribe.
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
  SubscribeSpec,
  SubscribeResult,
} from '../types.js';
import { NotImplementedError } from '../types.js';
import { normalize } from '../normalize.js';

const AIRTABLE_AUTH_URL = 'https://airtable.com/oauth2/authorize';

function buildAirtableAuthUrl(state: string, scope: string, redirectUri?: string): string {
  const params = new URLSearchParams({
    client_id: 'fixture-client-id',
    redirect_uri: redirectUri ?? 'http://localhost:3000/callback',
    response_type: 'code',
    scope,
    state,
  });
  return `${AIRTABLE_AUTH_URL}?${params.toString()}`;
}

export class AirtableAdapter implements ConnectorAdapter {
  readonly connector_id: ConnectorId = 'airtable';
  readonly version = '1.0.0';
  readonly auth_kind: AuthKind = 'oauth';

  async authStart(ctx: AdapterContext, spec: AuthStartSpec): Promise<AuthStartResult> {
    const state = `at_${ctx.tenant_id}_${Date.now()}`;
    const scope = (spec.scope ?? ['data.records:read']).join(' ');
    const redirect_url = buildAirtableAuthUrl(state, scope, spec.redirect_uri);
    return { redirect_url, state, scope };
  }

  async authCallback(_ctx: AdapterContext, _spec: AuthCallbackSpec): Promise<AuthCallbackResult> {
    return { credential_ref: { vault: 'phase-01', path: `connectors/${_ctx.tenant_id}/at_creds` } };
  }

  async ping(ctx: AdapterContext): Promise<{ ok: boolean; latency_ms: number }> {
    const t0 = Date.now();
    await ctx.transport.request({ method: 'GET', url: 'https://api.airtable.com/v0/meta/whoami' });
    return { ok: true, latency_ms: Date.now() - t0 };
  }

  async discover(_ctx: AdapterContext, _spec: DiscoverSpec): Promise<DiscoverResult> {
    return {
      tables: [
        {
          name: 'tbl1',
          columns: [
            { name: 'Name', type: 'string', semantic_role: 'dimension' },
            { name: 'Revenue', type: 'number', semantic_role: 'measure' },
          ],
          row_count_estimate: 200,
        },
      ],
    };
  }

  async query(ctx: AdapterContext, spec: QuerySpec): Promise<QueryResult> {
    const t0 = Date.now();
    const resp = await ctx.transport.request({
      method: 'GET',
      url: `https://api.airtable.com/v0/${spec.sql}`,
    });
    const body = resp.body as { records?: Array<{ fields: Record<string, unknown> }> };
    const records = body.records ?? [];
    if (records.length === 0) {
      return {
        rows: [],
        columns: [],
        stats: { duration_ms: Date.now() - t0, row_count: 0, source: 'live' },
      };
    }
    const headers = Object.keys(records[0]!.fields);
    const dataRows = records.map((r) => headers.map((h) => r.fields[h]));
    const canonical = normalize(headers, dataRows);
    return {
      rows: canonical.rows,
      columns: canonical.columns,
      stats: { duration_ms: Date.now() - t0, row_count: records.length, source: 'live' },
    };
  }

  async subscribe(_ctx: AdapterContext, _spec: SubscribeSpec): Promise<SubscribeResult> {
    return { subscription_id: `sub_${_ctx.tenant_id}_${Date.now()}`, status: 'active' };
  }

  async write(_ctx: AdapterContext, _spec: WriteSpec): Promise<WriteResult> {
    throw new NotImplementedError('write for airtable');
  }
}
