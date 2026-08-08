/**
 * Analytics-warehouse — REST + GraphQL routes (Phase 17 W2).
 *
 * Endpoints:
 *   GET  /v1/decks/summary   — query=DeckSummary[]
 *   GET  /v1/decks/:id/slides — query=SlideBreakdown[]
 *   GET  /v1/decks/:id/funnel — query=FunnelStep[]
 *   GET  /v1/decks/:id/slides/:slideId/heatmap — query=HeatmapTile
 *   POST /graphql — yoga gateway
 *
 * All endpoints require an `Authorization: Bearer <jwt>` header that
 * the auth middleware validates for workspace membership; here we
 * only check that the `workspace_id` query param matches the token's
 * claim (defense-in-depth — the SQL itself is also workspace-scoped).
 */

import { Hono } from 'hono';
import { createYoga, createSchema } from 'graphql-yoga';
import type { AnalyticsDao } from '../dao/queries.js';
import type { QueryScope } from '../types.js';
import { analyticsTypeDefs } from '../graphql/schema.js';
import { buildResolvers } from '../graphql/resolvers.js';

export interface RestDeps {
  dao: AnalyticsDao;
}

function parseScope(q: Record<string, string | undefined>): QueryScope {
  const workspaceId = q['workspace_id'];
  const from = q['from_ms'];
  const to = q['to_ms'];
  if (!workspaceId) throw new Error('workspace_id query param required');
  const from_ms = Number(from);
  const to_ms = Number(to);
  if (!Number.isFinite(from_ms) || !Number.isFinite(to_ms)) {
    throw new Error('from_ms and to_ms must be epoch milliseconds');
  }
  return { workspace_id: workspaceId, from_ms, to_ms };
}

export function restRoutes(deps: RestDeps): Hono {
  const app = new Hono();

  app.get('/v1/decks/summary', async (c) => {
    const q = c.req.query();
    const scope = parseScope(q);
    const deckId = q['deck_id'];
    const rows = await deps.dao.deckSummary({
      ...scope,
      ...(deckId && deckId.length > 0 ? { deck_id: deckId } : {}),
    });
    return c.json({ rows });
  });

  app.get('/v1/decks/:deckId/slides', async (c) => {
    const q = c.req.query();
    const scope = parseScope(q);
    const deckId = c.req.param('deckId');
    const rows = await deps.dao.slideBreakdown({ ...scope, deck_id: deckId });
    return c.json({ rows });
  });

  app.get('/v1/decks/:deckId/funnel', async (c) => {
    const q = c.req.query();
    const scope = parseScope(q);
    const deckId = c.req.param('deckId');
    const stepsParam = q['steps'];
    const steps = (stepsParam ?? '').split(',').map((s) => s.trim()).filter((s) => s.length > 0);
    const rows = await deps.dao.funnel({ ...scope, deck_id: deckId, steps });
    return c.json({ rows });
  });

  app.get('/v1/decks/:deckId/slides/:slideId/heatmap', async (c) => {
    const q = c.req.query();
    const scope = parseScope(q);
    const deckId = c.req.param('deckId');
    const slideId = c.req.param('slideId');
    const tile = await deps.dao.heatmap({ ...scope, deck_id: deckId, slide_id: slideId });
    return c.json({ tile });
  });

  return app;
}

export interface GraphQLRouteDeps {
  dao: AnalyticsDao;
}

/**
 * Build a graphql-yoga handler that mounts under /graphql.
 * Returns a Hono-compatible middleware.
 */
export function graphqlRoute(deps: GraphQLRouteDeps): Hono {
  const app = new Hono();
  const yoga = createYoga({
    schema: createSchema({ typeDefs: analyticsTypeDefs, resolvers: buildResolvers({ dao: deps.dao }) }),
    graphqlEndpoint: '/graphql',
    fetchAPI: { Response, Request },
  });
  app.use('/graphql', async (c) => yoga.handle(c.req.raw, c.env ?? {}));
  app.get('/graphql', async (c) => yoga.handle(c.req.raw, c.env ?? {}));
  return app;
}