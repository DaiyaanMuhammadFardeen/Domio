/**
 * Viewer-identity — Hono app factory (Phase 17 W3).
 */

import { Hono } from 'hono';
import type { IdentityStore } from './store/inmemory.js';
import type { PrivacyMode } from './types.js';
import { gdprRoutes } from './routes/gdpr.js';
import { healthRoutes } from './routes/health.js';

export interface AppDeps {
  store: IdentityStore;
  salt: string;
  acceptedModes: (workspace_id: string) => readonly PrivacyMode[];
}

export function buildApp(deps: AppDeps): Hono {
  const app = new Hono();

  app.onError((err, c) => {
    return c.json(
      {
        error: {
          code: 'internal_error',
          message: err instanceof Error ? err.message : String(err),
        },
      },
      500,
    );
  });

  app.route('/', healthRoutes());
  app.route('/', gdprRoutes(deps));

  return app;
}
