/**
 * Catalog + blob routes — component publish/search/install/deprecate + blob store.
 *
 *   POST   /v1/registry/packages           (publishPackage)
 *   GET    /v1/registry/packages            (search/list)
 *   GET    /v1/registry/packages/:catalogId (get by version or latest)
 *   GET    /v1/registry/packages/:catalogId/versions
 *   GET    /v1/registry/packages/:catalogId/variants
 *   POST   /v1/registry/packages/:catalogId/install
 *   POST   /v1/registry/packages/:catalogId/deprecate
 *   POST   /v1/blobs                        (store raw blob)
 *   GET    /v1/blobs/:sha256                (retrieve blob)
 */

import { Hono } from 'hono';
import { sha256Hex } from '../crypto/index.js';
import type { ServiceDeps } from '../deps.js';
import { Errors } from '../errors.js';
import { publishPackage, deprecatePackage, searchPackages } from '../catalog/catalog.js';
import { installPackage } from '../install/install.js';
import { listVariantChoices } from '../catalog/variants.js';

export function catalogRoutes(deps: ServiceDeps): Hono {
  const app = new Hono();

  // ---- POST /v1/registry/packages — publish ----
  app.post('/v1/registry/packages', async (c) => {
    const tenantId = c.req.header('x-tenant-id') ?? 'default';
    const userId = c.req.header('x-user-id') ?? 'anonymous';
    void tenantId;
    void userId;

    const body = await c.req.json();
    const result = await publishPackage(deps, {
      catalogId: body.catalogId,
      version: body.version,
      kind: body.kind,
      name: body.name,
      ...(body.description != null ? { description: body.description } : {}),
      ...(body.category != null ? { category: body.category } : {}),
      ...(body.author != null ? { author: body.author } : {}),
      ...(body.licenseId != null ? { licenseId: body.licenseId } : {}),
      ...(body.propsSchema != null ? { propsSchema: body.propsSchema } : {}),
      ...(body.variants != null ? { variants: body.variants } : {}),
      ...(body.files != null ? { files: body.files } : {}),
      ...(body.packageHash != null ? { packageHash: body.packageHash } : {}),
      ...(body.signingKeyId != null ? { signingKeyId: body.signingKeyId } : {}),
      ...(body.signature != null ? { signature: body.signature } : {}),
      ...(body.sizeBudgetBytes != null ? { sizeBudgetBytes: body.sizeBudgetBytes } : {}),
    });
    return c.json({ pkg: result.pkg, created: result.created }, result.created ? 201 : 200);
  });

  // ---- GET /v1/registry/packages — search / list ----
  app.get('/v1/registry/packages', async (c) => {
    const q = c.req.query('q');
    const kind = c.req.query('kind');
    const category = c.req.query('category');
    const limit = c.req.query('limit');
    const offset = c.req.query('offset');
    const lim = limit ? Number(limit) : undefined;

    let packages;
    if (q) {
      packages = await searchPackages(deps, q, {
        ...(kind ? { kind } : {}),
        ...(lim != null ? { limit: lim } : {}),
      });
    } else {
      packages = await deps.store.listPackages({
        ...(kind ? { kind } : {}),
        ...(category ? { category } : {}),
        ...(lim != null ? { limit: lim } : {}),
      });
    }

    // Simple offset pagination
    if (offset) {
      const off = Number(offset);
      packages = packages.slice(off);
    }

    return c.json({ packages });
  });

  // ---- GET /v1/registry/packages/:catalogId — get specific package ----
  app.get('/v1/registry/packages/:catalogId', async (c) => {
    const catalogId = c.req.param('catalogId');
    const version = c.req.query('version');

    if (version) {
      const pkg = await deps.store.getPackage(catalogId, version);
      if (!pkg) throw Errors.notFound(`component ${catalogId}@${version}`);
      return c.json({ pkg });
    }

    // Latest version
    const versions = await deps.store.listVersions(catalogId);
    if (!versions.length) throw Errors.notFound(`component ${catalogId}`);
    return c.json({ pkg: versions[0] });
  });

  // ---- GET /v1/registry/packages/:catalogId/versions ----
  app.get('/v1/registry/packages/:catalogId/versions', async (c) => {
    const catalogId = c.req.param('catalogId');
    const versions = await deps.store.listVersions(catalogId);
    return c.json({ versions: versions.map((v) => v.version) });
  });

  // ---- GET /v1/registry/packages/:catalogId/variants ----
  app.get('/v1/registry/packages/:catalogId/variants', async (c) => {
    const catalogId = c.req.param('catalogId');
    const version = c.req.query('version');

    let pkg;
    if (version) {
      pkg = await deps.store.getPackage(catalogId, version);
    } else {
      const versions = await deps.store.listVersions(catalogId);
      pkg = versions[0];
    }
    if (!pkg) throw Errors.notFound(`component ${catalogId}`);

    const choices = listVariantChoices(pkg);
    return c.json({ variants: choices });
  });

  // ---- POST /v1/registry/packages/:catalogId/install ----
  app.post('/v1/registry/packages/:catalogId/install', async (c) => {
    const catalogId = c.req.param('catalogId');
    const tenantId = c.req.header('x-tenant-id') ?? 'default';
    const userId = c.req.header('x-user-id') ?? 'anonymous';
    void tenantId;

    const body = await c.req.json();
    const result = await installPackage(deps, {
      workspaceId: tenantId,
      userId,
      catalogId,
      ...(body.version != null ? { version: body.version } : {}),
      ...(body.pinMode != null ? { pinMode: body.pinMode } : {}),
      ...(body.pinValue != null ? { pinValue: body.pinValue } : {}),
      ...(body.seats != null ? { seats: body.seats } : {}),
    });
    return c.json({
      version: result.version,
      bundleUrls: result.bundleUrls,
      ...(result.licenseGrant ? { licenseGrant: result.licenseGrant } : {}),
      updated: result.updated,
    });
  });

  // ---- POST /v1/registry/packages/:catalogId/deprecate ----
  app.post('/v1/registry/packages/:catalogId/deprecate', async (c) => {
    const catalogId = c.req.param('catalogId');
    const body = await c.req.json();
    const result = await deprecatePackage(deps, {
      catalogId,
      ...(body.version != null ? { version: body.version } : {}),
      reason: body.reason ?? 'deprecated',
      ...(body.replaceWith != null ? { replaceWith: body.replaceWith } : {}),
    });
    return c.json({ pkg: result });
  });

  // ---- POST /v1/blobs — store raw blob ----
  app.post('/v1/blobs', async (c) => {
    const bytes = new Uint8Array(await c.req.arrayBuffer());
    if (bytes.length === 0) throw Errors.validation('Empty blob');
    if (bytes.length > deps.limits.maxPackageBytes) {
      throw Errors.validation(`Blob exceeds max size ${deps.limits.maxPackageBytes} bytes`);
    }
    const sha = sha256Hex(bytes);
    const existing = await deps.store.hasBlob(sha);
    if (!existing) {
      await deps.store.putBlob({
        sha256: sha,
        bytes,
        storedAt: Date.now(),
      });
    }
    return c.json({ sha256: sha }, existing ? 200 : 201);
  });

  // ---- GET /v1/blobs/:sha256 — retrieve blob ----
  app.get('/v1/blobs/:sha256', async (c) => {
    const sha = c.req.param('sha256');
    const blob = await deps.store.getBlob(sha);
    if (!blob) throw Errors.notFound(`blob ${sha}`);

    // Verify stored hash matches
    const actual = sha256Hex(blob.bytes);
    if (actual !== sha) throw Errors.tampered(`Blob ${sha} failed hash verification`);

    return new Response(blob.bytes, {
      headers: {
        'content-type': 'application/octet-stream',
        'x-sha256': sha,
      },
    });
  });

  return app;
}
