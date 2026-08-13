/**
 * Dashboard graphql-yoga server (Phase 17 final).
 *
 * The dashboard ships its own gateway at `/api/graphql` so client
 * components can issue persisted-query requests over a single
 * endpoint. The gateway:
 *
 *   1. Composes the warehouse SDL with two local resolvers (live +
 *      abTestResults) using `@graphql-tools/schema`'s `makeExecutableSchema`.
 *   2. Installs a small custom `usePersistedQueries` plugin that
 *      resolves `extensions.persistedQuery.sha256Hash` to a stored
 *      query body before the GraphQL executor runs.
 *   3. Forwards query traffic to the warehouse by calling its REST
 *      endpoints (rather than re-implementing the analytics DAO).
 *
 * Persisted queries live in `persisted-queries.json`. The eight hashes
 * cover every dashboard view so a hot reload never has to ship the
 * query body over the wire.
 */

import { createYoga, createSchema } from 'graphql-yoga';
import { makeExecutableSchema } from '@graphql-tools/schema';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import type { Plugin } from 'graphql-yoga';
import { analyticsTypeDefs } from './schema.js';

const here = dirname(fileURLToPath(import.meta.url));
const pqPath = resolve(here, './persisted-queries.json');

interface PersistedQueriesFile {
  [name: string]: { hash: string; query: string };
}

/** Reads the persisted-queries manifest. Throws on malformed JSON. */
export function loadPersistedQueries(): PersistedQueriesFile {
  const raw = readFileSync(pqPath, 'utf8');
  const parsed = JSON.parse(raw) as unknown;
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('persisted-queries.json is not an object');
  }
  return parsed as PersistedQueriesFile;
}

/** Stable SHA-256 hash for a GraphQL query string. */
export function hashQuery(query: string): string {
  return createHash('sha256').update(query).digest('hex');
}

const WAREHOUSE_URL = process.env['WAREHOUSE_URL'] ?? 'http://localhost:8088';
const LIVE_URL = process.env['LIVE_ANALYTICS_URL'] ?? 'http://localhost:8094';
const AB_MEASUREMENT_URL = process.env['AB_MEASUREMENT_URL'] ?? 'http://localhost:8091';

async function callWarehouse(path: string, params: Record<string, string>): Promise<unknown> {
  const url = new URL(path, WAREHOUSE_URL);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`warehouse ${path} → ${res.status}`);
  return res.json();
}

async function callLive(path: string): Promise<unknown> {
  const url = new URL(path, LIVE_URL);
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`live-analytics ${path} → ${res.status}`);
  return res.json();
}

async function callAB(path: string, body: unknown): Promise<unknown> {
  const url = new URL(path, AB_MEASUREMENT_URL);
  const res = await fetch(url.toString(), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`ab-measurement ${path} → ${res.status}`);
  return res.json();
}

const localTypeDefs = /* GraphQL */ `
  type LiveSession {
    sessionId: String!
    concurrentViewers: Int!
    currentSlide: String
    recentReactions: [String!]!
    lastEventMs: Float!
  }

  type ABVariantResult {
    variantId: String!
    variantKey: String!
    exposures: Int!
    conversions: Int!
    rate: Float!
  }

  type ABTestResults {
    experimentId: String!
    workspaceId: String!
    status: String!
    variants: [ABVariantResult!]!
    lift: Float!
    pValue: Float!
    ciLow: Float!
    ciHigh: Float!
  }

  extend type Query {
    liveSession(sessionId: String!): LiveSession!
    abTestResults(workspaceId: String!, experimentId: String!): ABTestResults!
  }
`;

const localResolvers = {
  Query: {
    async liveSession(_: unknown, args: Record<string, unknown>) {
      const sessionId = String(args['sessionId'] ?? '');
      if (!sessionId) throw new Error('sessionId is required');
      const raw = (await callLive(
        `/v1/live/pulse?session_id=${encodeURIComponent(sessionId)}`,
      )) as {
        concurrent_viewers?: number;
        current_slide?: string | null;
        recent_reactions?: string[];
        last_event_ms?: number;
      };
      return {
        sessionId,
        concurrentViewers: raw.concurrent_viewers ?? 0,
        currentSlide: raw.current_slide ?? null,
        recentReactions: raw.recent_reactions ?? [],
        lastEventMs: raw.last_event_ms ?? 0,
      };
    },

    async abTestResults(_: unknown, args: Record<string, unknown>) {
      const workspaceId = String(args['workspaceId'] ?? '');
      const experimentId = String(args['experimentId'] ?? '');
      if (!workspaceId) throw new Error('workspaceId is required');
      if (!experimentId) throw new Error('experimentId is required');
      const body = {
        workspace_id: workspaceId,
        test_id: experimentId,
        variants: [
          { variant_id: 'a', variant_key: 'control', exposures: 1, conversions: 0 },
          { variant_id: 'b', variant_key: 'treatment', exposures: 1, conversions: 0 },
        ],
      };
      const raw = (await callAB('/v1/measure', body)) as {
        variant_a?: { exposures: number; conversions: number; rate: number };
        variant_b?: { exposures: number; conversions: number; rate: number };
        lift?: number;
        ci_low?: number;
        ci_high?: number;
        p_value?: number;
      };
      const a = raw.variant_a ?? { exposures: 0, conversions: 0, rate: 0 };
      const b = raw.variant_b ?? { exposures: 0, conversions: 0, rate: 0 };
      return {
        experimentId,
        workspaceId,
        status: 'running',
        variants: [
          {
            variantId: 'a',
            variantKey: 'control',
            exposures: a.exposures,
            conversions: a.conversions,
            rate: a.rate,
          },
          {
            variantId: 'b',
            variantKey: 'treatment',
            exposures: b.exposures,
            conversions: b.conversions,
            rate: b.rate,
          },
        ],
        lift: raw.lift ?? 0,
        pValue: raw.p_value ?? 1,
        ciLow: raw.ci_low ?? 0,
        ciHigh: raw.ci_high ?? 0,
      };
    },

    // Forward warehouse queries to the warehouse REST endpoints.
    async deckSummary(_: unknown, args: Record<string, unknown>) {
      const params: Record<string, string> = {
        workspace_id: String(args['workspaceId'] ?? ''),
        from_ms: String(args['fromMs'] ?? 0),
        to_ms: String(args['toMs'] ?? 0),
      };
      if (typeof args['deckId'] === 'string') params['deck_id'] = args['deckId'];
      const json = (await callWarehouse('/v1/decks/summary', params)) as { rows: unknown[] };
      return json.rows;
    },

    async slideBreakdown(_: unknown, args: Record<string, unknown>) {
      const params: Record<string, string> = {
        workspace_id: String(args['workspaceId'] ?? ''),
        deck_id: String(args['deckId'] ?? ''),
        from_ms: String(args['fromMs'] ?? 0),
        to_ms: String(args['toMs'] ?? 0),
      };
      const json = (await callWarehouse(`/v1/decks/${params['deck_id']}/slides`, params)) as {
        rows: unknown[];
      };
      return json.rows;
    },

    async funnel(_: unknown, args: Record<string, unknown>) {
      const params: Record<string, string> = {
        workspace_id: String(args['workspaceId'] ?? ''),
        deck_id: String(args['deckId'] ?? ''),
        from_ms: String(args['fromMs'] ?? 0),
        to_ms: String(args['toMs'] ?? 0),
        steps: Array.isArray(args['steps'])
          ? (args['steps'] as unknown[]).map(String).join(',')
          : '',
      };
      const json = (await callWarehouse(`/v1/decks/${params['deck_id']}/funnel`, params)) as {
        rows: unknown[];
      };
      return json.rows;
    },

    async heatmap(_: unknown, args: Record<string, unknown>) {
      const params: Record<string, string> = {
        workspace_id: String(args['workspaceId'] ?? ''),
        deck_id: String(args['deckId'] ?? ''),
        from_ms: String(args['fromMs'] ?? 0),
        to_ms: String(args['toMs'] ?? 0),
      };
      const deckId = params['deck_id'] ?? '';
      const slideId = String(args['slideId'] ?? '');
      const json = (await callWarehouse(
        `/v1/decks/${deckId}/slides/${slideId}/heatmap`,
        params,
      )) as {
        tile: unknown;
      };
      return json.tile;
    },
  },
};

/** Compose the warehouse SDL with the dashboard's local extensions. */
export function buildSchema() {
  return makeExecutableSchema({
    typeDefs: [analyticsTypeDefs, localTypeDefs],
    resolvers: localResolvers,
  });
}

/**
 * Yoga plugin that resolves persisted-query hashes from our manifest.
 * If the incoming request has `extensions.persistedQuery.sha256Hash`
 * and no `query` body, we attach the stored `query` so the executor
 * can parse + validate it.
 */
function usePersistedQueries(getQuery: (hash: string) => string | undefined): Plugin {
  return {
    onParams({ params, setParams }) {
      const ext = (
        params as unknown as {
          extensions?: { persistedQuery?: { sha256Hash?: string } };
        }
      ).extensions;
      const hash = ext?.persistedQuery?.sha256Hash;
      if (hash && !(params as unknown as { query?: string }).query) {
        const stored = getQuery(hash);
        if (stored) {
          setParams({ ...(params as Record<string, unknown>), query: stored } as typeof params);
        }
      }
    },
  };
}

/**
 * Build a graphql-yoga instance with persisted queries enabled.
 * The plugin map is computed lazily so tests that import this
 * function in a worker don't allocate until actually requested.
 */
export function makeYoga() {
  const persisted = loadPersistedQueries();
  const queryMap = new Map<string, string>();
  for (const [name, entry] of Object.entries(persisted)) {
    if (!entry.query || !entry.hash) continue;
    if (hashQuery(entry.query) !== entry.hash) {
      throw new Error(`persisted-queries.json: ${name} hash mismatch`);
    }
    queryMap.set(entry.hash, entry.query);
  }

  return createYoga({
    schema: buildSchema(),
    graphqlEndpoint: '/api/graphql',
    fetchAPI: { Response, Request },
    plugins: [usePersistedQueries((h) => queryMap.get(h))],
  });
}

// Re-export createSchema so `app/api/graphql/route.ts` doesn't need
// its own import path if it just wants the merged executable schema.
export { createSchema };
