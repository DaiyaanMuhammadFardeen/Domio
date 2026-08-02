/**
 * Library routes — team library event log, sync, policy, and activity.
 *
 *   GET    /v1/libraries/team/:libraryId/events
 *   POST   /v1/libraries/team/:libraryId/events
 *   POST   /v1/libraries/team/:libraryId/sync
 *   POST   /v1/libraries/team/:libraryId/policy
 *   GET    /v1/libraries/activity
 */

import { Hono } from 'hono';
import type { ServiceDeps } from '../deps.js';
import { Errors } from '../errors.js';
import {
  appendLibraryEvent,
  changeLibraryPolicy,
  summarizeUpdates,
} from '../libraries/libraryLog.js';
import { run as librarySyncRun } from '../workers/library-sync.js';

export function librariesRoutes(deps: ServiceDeps): Hono {
  const app = new Hono();

  // ---- GET /v1/libraries/team/:libraryId/events ----
  app.get('/v1/libraries/team/:libraryId/events', async (c) => {
    const libraryId = c.req.param('libraryId');
    const afterSeq = c.req.query('afterSeq');
    const limit = c.req.query('limit');

    const events = await deps.store.listLibraryEvents(
      libraryId,
      afterSeq ? Number(afterSeq) : 0,
      limit ? Number(limit) : 100,
    );
    return c.json({ events });
  });

  // ---- POST /v1/libraries/team/:libraryId/events ----
  app.post('/v1/libraries/team/:libraryId/events', async (c) => {
    const libraryId = c.req.param('libraryId');
    const tenantId = c.req.header('x-tenant-id') ?? 'default';
    const userId = c.req.header('x-user-id') ?? 'anonymous';
    const actorKind = (c.req.header('x-actor-kind') ?? 'user') as 'human' | 'agent';
    void tenantId;

    const body = await c.req.json();
    const event = await appendLibraryEvent(deps, {
      libraryId,
      kind: body.kind,
      componentId: body.componentId,
      ...(body.version != null ? { version: body.version } : {}),
      ...(body.payloadRef != null ? { payloadRef: body.payloadRef } : {}),
      actorId: userId,
      actorKind,
    });
    return c.json({ event }, 201);
  });

  // ---- POST /v1/libraries/team/:libraryId/sync ----
  app.post('/v1/libraries/team/:libraryId/sync', async (c) => {
    const libraryId = c.req.param('libraryId');
    const result = await librarySyncRun(deps, { libraryId });
    return c.json(result);
  });

  // ---- POST /v1/libraries/team/:libraryId/policy ----
  app.post('/v1/libraries/team/:libraryId/policy', async (c) => {
    const libraryId = c.req.param('libraryId');
    const userId = c.req.header('x-user-id') ?? 'anonymous';
    const actorKind = (c.req.header('x-actor-kind') ?? 'user') as 'human' | 'agent';

    const body = await c.req.json();
    if (!body.mode) throw Errors.validation('mode is required');
    const validModes = ['latest', 'patch', 'minor', 'pinned'] as const;
    if (!validModes.includes(body.mode)) {
      throw Errors.validation(`Invalid policy mode "${body.mode}"`);
    }
    const lib = await changeLibraryPolicy(deps, libraryId, userId, body.mode, actorKind);
    return c.json({ library: lib });
  });

  // ---- GET /v1/libraries/activity ----
  app.get('/v1/libraries/activity', async (c) => {
    const tenantId = c.req.header('x-tenant-id') ?? 'default';
    const libs = await deps.store.listTeamLibraries(tenantId);

    // Collect recent events across all team libraries
    const allEvents = await Promise.all(
      libs.map(async (lib) => {
        const events = await deps.store.listLibraryEvents(lib.id, 0, 50);
        return events;
      }),
    );
    const flat = allEvents.flat();
    const summary = summarizeUpdates(flat);
    return c.json({ updates: summary });
  });

  return app;
}
