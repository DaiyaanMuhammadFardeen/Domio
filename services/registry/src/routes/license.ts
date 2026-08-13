/**
 * License routes — issue and verify license grants.
 *
 *   POST /v1/license/grants   (issueLicenseGrant)
 *   POST /v1/license/verify   (verifyLicense)
 */

import { Hono } from 'hono';
import type { ServiceDeps } from '../deps.js';
import { issueLicenseGrant, verifyLicense } from '../install/license.js';

export function licenseRoutes(deps: ServiceDeps): Hono {
  const app = new Hono();

  // ---- POST /v1/license/grants — issue a license grant ----
  app.post('/v1/license/grants', async (c) => {
    const tenantId = c.req.header('x-tenant-id') ?? 'default';
    const userId = c.req.header('x-user-id');
    const body = await c.req.json();

    const grant = await issueLicenseGrant(deps, {
      workspaceId: tenantId,
      ...(userId ? { userId } : {}),
      catalogId: body.catalogId,
      version: body.version,
      listingId: body.listingId,
      seats: body.seats ?? 1,
    });

    return c.json(
      {
        grantId: grant.id,
        token: grant.signedToken,
        expiresAt: grant.expiresAt,
        grant,
      },
      201,
    );
  });

  // ---- POST /v1/license/verify — verify a license token ----
  app.post('/v1/license/verify', async (c) => {
    const body = await c.req.json();
    const result = await verifyLicense(deps, {
      token: body.token,
      ...(body.catalogId != null ? { catalogId: body.catalogId } : {}),
      ...(body.version != null ? { version: body.version } : {}),
      ...(body.workspaceId != null ? { workspaceId: body.workspaceId } : {}),
    });
    return c.json({
      valid: result.valid,
      ...(result.reason != null ? { reason: result.reason } : {}),
      ...(result.grant != null ? { grant: result.grant } : {}),
    });
  });

  return app;
}
