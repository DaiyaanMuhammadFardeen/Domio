/**
 * Team-analytics — HTTP routes (Phase 17 W9).
 *
 * All endpoints take workspace_id as a query parameter so the dashboard
 * (Wave 6) can drive them without an auth middleware at this layer. The
 * service is intentionally read-mostly: the only writes are the
 * rollup daemon (rollup.ts) which inserts into the materialized view.
 */

import { Hono } from 'hono';
import type { ClickHouseClient } from '../store/clickhouse.js';
import type { TemplateDao } from '../store/templates.js';

export interface TeamRoutesDeps {
  ch: ClickHouseClient;
  dao: TemplateDao;
}

interface ParsedScope {
  workspace_id: string;
  from_ms: number;
  to_ms: number;
}

function parseScope(req: { query: (k: string) => string | undefined }): ParsedScope | null {
  const workspace_id = req.query('workspace_id');
  if (!workspace_id) return null;
  const since = req.query('since');
  const until = req.query('until');
  const now = Date.now();
  const from_ms = since ? Number(since) : now - 7 * 24 * 60 * 60 * 1000;
  const to_ms = until ? Number(until) : now;
  if (!Number.isFinite(from_ms) || !Number.isFinite(to_ms)) return null;
  return { workspace_id, from_ms, to_ms };
}

function parseLimit(req: { query: (k: string) => string | undefined }, fallback: number): number {
  const raw = Number(req.query('limit') ?? String(fallback));
  if (!Number.isFinite(raw)) return fallback;
  return Math.max(1, Math.min(50, Math.floor(raw)));
}

export function teamRoutes(deps: TeamRoutesDeps): Hono {
  const app = new Hono();

  app.get('/v1/team/templates/top', async (c) => {
    const scope = parseScope(c.req);
    if (!scope) return c.json({ error: { code: 'bad_request', message: 'workspace_id required' } }, 400);
    const rows = await deps.dao.topTemplates(scope, parseLimit(c.req, 10));
    return c.json({ workspace_id: scope.workspace_id, rows });
  });

  app.get('/v1/team/components/top', async (c) => {
    const scope = parseScope(c.req);
    if (!scope) return c.json({ error: { code: 'bad_request', message: 'workspace_id required' } }, 400);
    const rows = await deps.dao.topComponents(scope, parseLimit(c.req, 10));
    return c.json({ workspace_id: scope.workspace_id, rows });
  });

  app.get('/v1/team/brands/health', async (c) => {
    const workspace_id = c.req.query('workspace_id');
    if (!workspace_id) return c.json({ error: { code: 'bad_request', message: 'workspace_id required' } }, 400);
    const rows = await deps.dao.brandHealth(workspace_id, Date.now());
    return c.json({ workspace_id, rows });
  });

  app.get('/v1/team/funnel', async (c) => {
    const scope = parseScope(c.req);
    if (!scope) return c.json({ error: { code: 'bad_request', message: 'workspace_id required' } }, 400);
    const stepsParam = c.req.query('steps');
    if (!stepsParam) {
      return c.json({ error: { code: 'bad_request', message: 'steps query parameter required' } }, 400);
    }
    const steps = stepsParam.split(',').map((s) => s.trim()).filter((s): s is string => Boolean(s));
    if (steps.length === 0) {
      return c.json({ error: { code: 'bad_request', message: 'steps must contain at least one event name' } }, 400);
    }
    const rows = await deps.dao.funnel(scope, steps);
    return c.json({ workspace_id: scope.workspace_id, steps, rows });
  });

  app.get('/v1/team/retention', async (c) => {
    const workspace_id = c.req.query('workspace_id');
    if (!workspace_id) return c.json({ error: { code: 'bad_request', message: 'workspace_id required' } }, 400);
    const weeksRaw = Number(c.req.query('weeks') ?? '8');
    const weeks = Number.isFinite(weeksRaw) ? Math.max(1, Math.min(26, Math.floor(weeksRaw))) : 8;
    const rows = await deps.dao.retentionCohorts(workspace_id, weeks, Date.now());
    return c.json({ workspace_id, rows });
  });

  app.get('/healthz', (c) => c.json({ ok: true, service: 'team-analytics' }, 200));

  app.get('/readyz', async (c) => {
    const ok = await deps.ch.ping();
    return c.json({ ok, clickhouse: ok });
  });

  return app;
}