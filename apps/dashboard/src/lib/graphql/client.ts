/**
 * Dashboard GraphQL client for server components (Phase 17 final).
 *
 * Issues persisted-query requests against the dashboard's own
 * `/api/graphql` gateway (which in turn forwards to the warehouse).
 * Pass `query` AND `hash` — the client will use the persisted-query
 * path on the server side when `hash` is set.
 */

import { hashQuery, loadPersistedQueries } from './server.js';

export interface GqlResponse<T> {
  data?: T;
  errors?: ReadonlyArray<{ message: string }>;
}

export interface QueryOptions {
  /** Persisted-query name; looked up in persisted-queries.json. */
  name?: string;
  /** Persisted-query SHA-256 hash (overrides name if both supplied). */
  hash?: string;
  /** Raw GraphQL document; used when no persisted-query hash applies. */
  query?: string;
  variables?: Record<string, unknown>;
  /** Override the base URL (defaults to NEXT_PUBLIC_DASHBOARD_URL). */
  baseUrl?: string;
}

function resolveBaseUrl(override?: string): string {
  if (override) return override.replace(/\/$/, '');
  const fromEnv = process.env['NEXT_PUBLIC_DASHBOARD_URL'];
  if (fromEnv) return fromEnv.replace(/\/$/, '');
  return 'http://localhost:3000';
}

function resolveHash(opts: QueryOptions): string | undefined {
  if (opts.hash) return opts.hash;
  if (opts.name) {
    const pq = loadPersistedQueries();
    const entry = pq[opts.name];
    if (entry) return entry.hash;
  }
  if (opts.query) return hashQuery(opts.query);
  return undefined;
}

/** Issue a POST to the dashboard GraphQL gateway. */
export async function gqlRequest<T>(
  opts: QueryOptions,
): Promise<GqlResponse<T>> {
  const base = resolveBaseUrl(opts.baseUrl);
  const url = `${base}/api/graphql`;
  const hash = resolveHash(opts);

  const body: Record<string, unknown> = {
    variables: opts.variables ?? {},
  };
  if (hash) {
    body['extensions'] = { persistedQuery: { sha256Hash: hash, version: 1 } };
    if (opts.query) body['query'] = opts.query;
  } else if (opts.query) {
    body['query'] = opts.query;
  } else {
    throw new Error('gqlRequest: provide `name`, `hash`, or `query`');
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    cache: 'no-store',
  });
  return (await res.json()) as GqlResponse<T>;
}