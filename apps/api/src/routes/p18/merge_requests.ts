/**
 * P18 merge-requests routes.
 */

import { Hono } from 'hono';
import { handlers } from '@domio/merge-request-service';
import type { MergeRequestService } from '@domio/merge-request-service';
import { adaptHandler, type P18Handler } from '../p18_adapter.js';

export function mergeRequestRoutes(service: MergeRequestService): Hono {
  const r = new Hono();
  const h = (name: string) =>
    adaptHandler(handlers[name as keyof typeof handlers] as unknown as P18Handler, service);

  r.post('/v1/decks/:deck_id/merge-requests', h('createMergeRequest'));
  r.get('/v1/decks/:deck_id/merge-requests', h('listMergeRequests'));
  r.get('/v1/merge-requests/:id/diffs', h('getMergeRequestDiffs'));
  r.post('/v1/merge-requests/:id/merge', h('mergeMergeRequest'));
  r.post('/v1/merge-requests/:id/resolve-conflict', h('resolveMergeRequestConflict'));

  return r;
}
