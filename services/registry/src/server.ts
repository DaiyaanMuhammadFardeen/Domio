/**
 * Hono app assembly — mounts all route groups, adds global error handler.
 */

import { Hono } from 'hono';
import type { ServiceDeps } from './deps.js';
import { toRegistryError } from './errors.js';
import { catalogRoutes } from './routes/catalog.js';
import { marketplaceRoutes } from './routes/marketplace.js';
import { licenseRoutes } from './routes/license.js';
import { librariesRoutes } from './routes/libraries.js';
import { templatesRoutes } from './routes/templates.js';
import { mediaRoutes } from './routes/media.js';

/**
 * Build the full Hono application with all route groups mounted.
 *
 * Global error handler:
 *  - RegistryError → its status + { error: { code, message } }
 *  - anything else → 500 + { error: { code: 'ERR_VALIDATION', message } }
 */
export function buildApp(deps: ServiceDeps): Hono {
  const app = new Hono();

  // ---- Global error handler ----
  app.onError((err, c) => {
    const reg = toRegistryError(err);
    return c.json(
      { error: { code: reg.code, message: reg.message } },
      reg.status as 400 | 401 | 403 | 404 | 409 | 410 | 500,
    );
  });

  // ---- Health ----
  app.get('/healthz', (c) => c.json({ ok: true }));

  // ---- Mount route groups ----
  app.route('/', catalogRoutes(deps));
  app.route('/', marketplaceRoutes(deps));
  app.route('/', licenseRoutes(deps));
  app.route('/', librariesRoutes(deps));
  app.route('/', templatesRoutes(deps));
  app.route('/', mediaRoutes(deps));

  return app;
}

/** Convenience for tests: `app.request(...)` delegates to the hono app. */
export type { Hono };
