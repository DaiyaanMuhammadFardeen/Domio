/**
 * Notion adapter (Phase 08).
 *
 * OAuth-based adapter for Notion API.
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

const NOTION_AUTH_URL = 'https://api.notion.com/v1/oauth/authorize';

function buildNotionAuthUrl(state: string, redirectUri?: string): string {
  const params = new URLSearchParams({
    client_id: 'fixture-client-id',
    redirect_uri: redirectUri ?? 'http://localhost:3000/callback',
    response_type: 'code',
    owner: 'user',
    state,
  });
  return `${NOTION_AUTH_URL}?${params.toString()}`;
}

export class NotionAdapter implements ConnectorAdapter {
  readonly connector_id: ConnectorId = 'notion';
  readonly version = '1.0.0';
  readonly auth_kind: AuthKind = 'oauth';

  async authStart(ctx: AdapterContext, spec: AuthStartSpec): Promise<AuthStartResult> {
    const state = `nt_${ctx.tenant_id}_${Date.now()}`;
    const redirect_url = buildNotionAuthUrl(state, spec.redirect_uri);
    return { redirect_url, state, scope: 'read_content' };
  }

  async authCallback(_ctx: AdapterContext, _spec: AuthCallbackSpec): Promise<AuthCallbackResult> {
    return { credential_ref: { vault: 'phase-01', path: `connectors/${_ctx.tenant_id}/nt_creds` } };
  }

  async ping(ctx: AdapterContext): Promise<{ ok: boolean; latency_ms: number }> {
    const t0 = Date.now();
    await ctx.transport.request({ method: 'GET', url: 'https://api.notion.com/v1/users/me' });
    return { ok: true, latency_ms: Date.now() - t0 };
  }

  async discover(_ctx: AdapterContext, _spec: DiscoverSpec): Promise<DiscoverResult> {
    return {
      tables: [
        {
          name: 'pages',
          columns: [
            { name: 'Title', type: 'string', semantic_role: 'dimension' },
            { name: 'Created', type: 'date', semantic_role: 'date' },
          ],
          row_count_estimate: 75,
        },
      ],
    };
  }

  async query(ctx: AdapterContext, spec: QuerySpec): Promise<QueryResult> {
    const t0 = Date.now();
    const resp = await ctx.transport.request({
      method: 'POST',
      url: `https://api.notion.com/v1/databases/${spec.sql}/query`,
      body: {},
    });
    const body = resp.body as { results?: Array<{ properties: Record<string, unknown> }> };
    const results = body.results ?? [];
    if (results.length === 0) {
      return {
        rows: [],
        columns: [],
        stats: { duration_ms: Date.now() - t0, row_count: 0, source: 'live' },
      };
    }
    const first = results[0]!;
    const headers = Object.keys(first.properties);
    const dataRows = results.map((r) =>
      headers.map((h) => {
        const val = r.properties[h] as Record<string, unknown>;
        if (val && typeof val === 'object' && 'title' in val) {
          const title = val['title'] as Array<Record<string, unknown>>;
          return title?.[0] && typeof title[0] === 'object' && 'text' in title[0]
            ? (title[0]['text'] as Record<string, unknown>)['content']
            : '';
        }
        return val;
      }),
    );
    const canonical = normalize(headers, dataRows);
    return {
      rows: canonical.rows,
      columns: canonical.columns,
      stats: { duration_ms: Date.now() - t0, row_count: results.length, source: 'live' },
    };
  }

  async write(_ctx: AdapterContext, _spec: WriteSpec): Promise<WriteResult> {
    throw new NotImplementedError('write for notion');
  }
}
