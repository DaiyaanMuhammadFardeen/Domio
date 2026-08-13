/**
 * P18 collab routes.
 *
 * Mounts comments, approval-requests, and assignment endpoints.
 */

import { Hono } from 'hono';
import { handlers } from '@domio/collab-service';
import type { CollabService } from '@domio/collab-service';
import { adaptHandler, type P18Handler } from '../p18_adapter.js';

export function collabRoutes(service: CollabService): Hono {
  const r = new Hono();
  const h = (name: string) =>
    adaptHandler(handlers[name as keyof typeof handlers] as unknown as P18Handler, service);

  // Comments
  r.post('/v1/decks/:deck_id/comments', h('createComment'));
  r.get('/v1/decks/:deck_id/comments', h('listComments'));
  r.patch('/v1/comments/:comment_id', h('updateComment'));
  r.post('/v1/comments/:comment_id/resolve', h('resolveComment'));
  r.post('/v1/comments/:comment_id/reactions', h('addReaction'));
  r.delete('/v1/comments/:comment_id/reactions/:emoji', h('removeReaction'));
  r.post('/v1/comments/:comment_id/promote-orphan', h('promoteOrphan'));

  // Approval requests
  r.post('/v1/decks/:deck_id/approval-requests', h('createApprovalRequest'));
  r.post('/v1/approval-requests/:id/submit', h('submitApprovalRequest'));
  r.post('/v1/approval-requests/:id/decisions', h('recordApprovalDecision'));
  r.get('/v1/decks/:deck_id/approval-requests', h('listApprovalRequests'));
  r.post('/v1/approval-requests/:id/back-to-draft', h('backToDraft'));

  // Assignments
  r.post('/v1/decks/:deck_id/assignments', h('createAssignment'));
  r.patch('/v1/assignments/:assignment_id', h('updateAssignment'));
  r.get('/v1/users/:user_id/assignments', h('listUserAssignments'));

  return r;
}
