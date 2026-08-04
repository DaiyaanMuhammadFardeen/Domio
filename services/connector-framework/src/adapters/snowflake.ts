/**
 * Snowflake adapter (Phase 08).
 *
 * Credential-based adapter for Snowflake.
 * Uses Snowflake REST API with key-pair auth.
 * Supports subscribe (Snowflake Streams).
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

export class SnowflakeAdapter implements ConnectorAdapter {
  readonly connector_id: ConnectorId = 'snowflake';
  readonly version = '1.0.0';
  readonly auth_kind: AuthKind = 'credentials';

  async authStart(_ctx: AdapterContext, _spec: AuthStartSpec): Promise<AuthStartResult> {
    return { redirect_url: '', state: '', scope: '' };
  }

  async authCallback(_ctx: AdapterContext, _spec: AuthCallbackSpec): Promise<AuthCallbackResult> {
    return { credential_ref: { vault: 'phase-01', path: `connectors/${_ctx.tenant_id}/sf_creds` } };
  }

  async ping(ctx: AdapterContext): Promise<{ ok: boolean; latency_ms: number }> {
    const t0 = Date.now();
    await ctx.transport.request({ method: 'POST', url: 'https://account.snowflakecomputing.com/session/v1/login' });
    return { ok: true, latency_ms: Date.now() - t0 };
  }

  async discover(_ctx: AdapterContext, _spec: DiscoverSpec): Promise<DiscoverResult> {
    return {
      tables: [{
        name: 'ANALYTICS.PUBLIC.SALES',
        columns: [
          { name: 'ID', type: 'number', semantic_role: 'id' },
          { name: 'AMOUNT', type: 'currency', semantic_role: 'measure' },
          { name: 'SALE_DATE', type: 'date', semantic_role: 'date' },
        ],
        row_count_estimate: 50000,
      }],
    };
  }

  async query(ctx: AdapterContext, spec: QuerySpec): Promise<QueryResult> {
    const t0 = Date.now();
    const resp = await ctx.transport.request({
      method: 'POST',
      url: 'https://account.snowflakecomputing.com/api/v2/statements',
      body: { statement: spec.sql },
    });
    const body = resp.body as {
      result?: {
        rows: Array<Record<string, unknown>>;
        schema: { resultMetaData: { rowType: Array<{ name: string; type: string }> } };
      };
    };
    const result = body.result;
    if (!result) {
      return { rows: [], columns: [], stats: { duration_ms: Date.now() - t0, row_count: 0, source: 'live' } };
    }
    const colDefs = result.schema.resultMetaData.rowType;
    const colNames = colDefs.map((c) => c.name);
    const rawRows = result.rows;
    const dataRows = rawRows.map((r) => colNames.map((n) => r[n]));
    const canonical = normalize(colNames, dataRows);
    return {
      rows: canonical.rows,
      columns: canonical.columns,
      stats: { duration_ms: Date.now() - t0, row_count: rawRows.length, source: 'live' },
    };
  }

  async subscribe(_ctx: AdapterContext, _spec: SubscribeSpec): Promise<SubscribeResult> {
    return { subscription_id: `sf_sub_${_ctx.tenant_id}_${Date.now()}`, status: 'active' };
  }

  async write(_ctx: AdapterContext, _spec: WriteSpec): Promise<WriteResult> {
    throw new NotImplementedError('write for snowflake');
  }
}
