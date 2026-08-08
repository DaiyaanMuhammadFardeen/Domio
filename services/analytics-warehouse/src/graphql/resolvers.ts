/**
 * Analytics-warehouse — GraphQL resolvers (Phase 17 W2).
 */

import type { AnalyticsDao } from '../dao/queries.js';

export interface GraphQLDeps {
  dao: AnalyticsDao;
}

function requireString(v: unknown, name: string): string {
  if (typeof v !== 'string' || v.length === 0) {
    throw new Error(`${name} is required`);
  }
  return v;
}

function requireNumber(v: unknown, name: string): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  if (!Number.isFinite(n)) throw new Error(`${name} must be a finite number`);
  return n;
}

export function buildResolvers(deps: GraphQLDeps) {
  return {
    Query: {
      async deckSummary(_: unknown, args: Record<string, unknown>) {
        const scope = {
          workspace_id: requireString(args['workspaceId'], 'workspaceId'),
          from_ms: requireNumber(args['fromMs'], 'fromMs'),
          to_ms: requireNumber(args['toMs'], 'toMs'),
          ...(typeof args['deckId'] === 'string' && args['deckId'].length > 0
            ? { deck_id: args['deckId'] as string }
            : {}),
        };
        const rows = await deps.dao.deckSummary(scope);
        return rows.map((r) => ({
          workspaceId: r.workspace_id,
          deckId: r.deck_id,
          sessionCount: r.session_count,
          viewerCount: r.viewer_count,
          totalEvents: r.total_events,
          avgSessionMs: r.avg_session_ms,
          completionRate: r.completion_rate,
        }));
      },

      async slideBreakdown(_: unknown, args: Record<string, unknown>) {
        const rows = await deps.dao.slideBreakdown({
          workspace_id: requireString(args['workspaceId'], 'workspaceId'),
          deck_id: requireString(args['deckId'], 'deckId'),
          from_ms: requireNumber(args['fromMs'], 'fromMs'),
          to_ms: requireNumber(args['toMs'], 'toMs'),
        });
        return rows.map((r) => ({
          workspaceId: r.workspace_id,
          deckId: r.deck_id,
          slideId: r.slide_id,
          views: r.views,
          uniqueViewers: r.unique_viewers,
          avgDwellMs: r.avg_dwell_ms,
          bounceRate: r.bounce_rate,
        }));
      },

      async funnel(_: unknown, args: Record<string, unknown>) {
        const steps = Array.isArray(args['steps']) ? (args['steps'] as unknown[]) : [];
        const rows = await deps.dao.funnel({
          workspace_id: requireString(args['workspaceId'], 'workspaceId'),
          deck_id: requireString(args['deckId'], 'deckId'),
          steps: steps.map((s) => requireString(s, 'steps[]')),
          from_ms: requireNumber(args['fromMs'], 'fromMs'),
          to_ms: requireNumber(args['toMs'], 'toMs'),
        });
        return rows.map((r) => ({
          workspaceId: r.workspace_id,
          deckId: r.deck_id,
          stepName: r.step_name,
          entered: r.entered,
          completed: r.completed,
          completionRate: r.completion_rate,
        }));
      },

      async heatmap(_: unknown, args: Record<string, unknown>) {
        const tile = await deps.dao.heatmap({
          workspace_id: requireString(args['workspaceId'], 'workspaceId'),
          deck_id: requireString(args['deckId'], 'deckId'),
          slide_id: requireString(args['slideId'], 'slideId'),
          from_ms: requireNumber(args['fromMs'], 'fromMs'),
          to_ms: requireNumber(args['toMs'], 'toMs'),
        });
        return {
          workspaceId: tile.workspace_id,
          deckId: tile.deck_id,
          slideId: tile.slide_id,
          gridCols: tile.grid_cols,
          gridRows: tile.grid_rows,
          cells: tile.cells,
        };
      },
    },
  };
}
