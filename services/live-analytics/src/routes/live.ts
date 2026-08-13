/**
 * Live-analytics — HTTP routes (Phase 17 W10).
 *
 * Read-only endpoints for debugging and dashboard consumption. The
 * WebSocket subscription lives in routes/ws.ts and is mounted at
 * /v1/live/{sessionID}/subscribe.
 */

import { Hono } from 'hono';
import type { Orchestrator } from '../orchestrator.js';

export interface LiveRoutesDeps {
  orch: Orchestrator;
}

export function liveRoutes(deps: LiveRoutesDeps): Hono {
  const app = new Hono();

  app.get('/v1/live/pulse', (c) => {
    const workspace_id = c.req.query('workspace_id');
    const session_id = c.req.query('session_id');
    if (!workspace_id || !session_id) {
      return c.json(
        { error: { code: 'bad_request', message: 'workspace_id and session_id required' } },
        400,
      );
    }
    const pulse = deps.orch.pulse(workspace_id, session_id);
    return c.json({ pulse });
  });

  app.get('/v1/live/sessions', (c) => {
    return c.json({ session_count: deps.orch.sessionCount() });
  });

  app.post('/v1/live/flush', async (c) => {
    const body = (await c.req.json().catch(() => null)) as {
      workspace_id?: string;
      session_id?: string;
      deck_id?: string;
    } | null;
    if (!body || !body.workspace_id || !body.session_id || !body.deck_id) {
      return c.json(
        { error: { code: 'bad_request', message: 'workspace_id, session_id, deck_id required' } },
        400,
      );
    }
    const row = await deps.orch.flush(body.workspace_id, body.session_id, body.deck_id);
    if (!row) {
      return c.json({ error: { code: 'not_found', message: 'no events for session' } }, 404);
    }
    return c.json({ summary: row });
  });

  app.get('/healthz', (c) => c.json({ ok: true, service: 'live-analytics' }));
  app.get('/readyz', (c) => c.json({ ok: true }));

  return app;
}
