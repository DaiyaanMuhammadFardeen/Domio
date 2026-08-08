/**
 * Notification dispatcher — collaboration event → Notification mapper.
 *
 * Each event type is mapped to one or more Notification objects.
 * Every recipient receives both an `in_app` and a `slack` notification
 * (two separate Notification objects) so the Router can dispatch them
 * through the existing channel senders.
 *
 * Deep-link patterns:
 *   comment.mentioned  → /decks/{deck_id}/comments/{comment_id}
 *   approval.requested  → /decks/{deck_id}/approvals/{request_id}
 *   assignment.created  → /decks/{deck_id}/assignments/{assignment_id}
 */

import type { Notification, NotificationPayload } from '../types.js';
import type {
  CollabEventEnvelope,
  CommentMentionedPayload,
  ApprovalRequestedPayload,
  AssignmentCreatedPayload,
} from './types.js';

/**
 * mapCollabEvent converts a validated envelope into 0..N notifications.
 * Returns [] for unknown event types or payloads that don't match
 * the expected shape.
 */
export function mapCollabEvent(envelope: CollabEventEnvelope): Notification[] {
  switch (envelope.event_type) {
    case 'comment.mentioned':
      return mapCommentMentioned(envelope);
    case 'approval.requested':
      return mapApprovalRequested(envelope);
    case 'assignment.created':
      return mapAssignmentCreated(envelope);
    default:
      return [];
  }
}

// ── comment.mentioned ────────────────────────────────────────────

function mapCommentMentioned(env: CollabEventEnvelope): Notification[] {
  const p = env.payload as unknown as CommentMentionedPayload;
  // Only dispatch for user mentions (group/role expansion is a later wave).
  if (p.mentioned_type !== 'user') return [];
  if (!p.mentioned_id || !p.comment_id || !p.deck_id) return [];

  const link = `/decks/${p.deck_id}/comments/${p.comment_id}`;
  const body = sanitizeBody(p.body_md, 120);
  const payload: NotificationPayload = {
    title: 'You were mentioned in a comment',
    body,
    link,
  };

  return buildDualChannel(env.workspace_id, 'collab-comment.mentioned', p.mentioned_id, payload);
}

// ── approval.requested ───────────────────────────────────────────

function mapApprovalRequested(env: CollabEventEnvelope): Notification[] {
  const p = env.payload as unknown as ApprovalRequestedPayload;
  if (!p.approver_id || !p.request_id || !p.deck_id) return [];

  const link = `/decks/${p.deck_id}/approvals/${p.request_id}`;
  const payload: NotificationPayload = {
    title: 'Approval requested',
    body: `Approval request ${p.request_id} for deck ${p.deck_id}`,
    link,
  };

  return buildDualChannel(env.workspace_id, 'collab-approval.requested', p.approver_id, payload);
}

// ── assignment.created ───────────────────────────────────────────

function mapAssignmentCreated(env: CollabEventEnvelope): Notification[] {
  const p = env.payload as unknown as AssignmentCreatedPayload;
  if (!p.assignment_id || !p.deck_id || !p.primary_id || !p.slide_range) return [];

  const link = `/decks/${p.deck_id}/assignments/${p.assignment_id}`;
  const title = `You have been assigned slides ${p.slide_range}`;
  let body = `Assignment status: ${p.status}`;
  if (p.status === 'blocked' && p.blocked_reason) {
    body += ` — ${p.blocked_reason}`;
  }

  const payload: NotificationPayload = { title, body, link };

  // Notify primary + all watchers (deduped by caller if needed).
  const recipients = new Set<string>([p.primary_id, ...p.watchers]);
  const notifications: Notification[] = [];
  for (const recipientId of recipients) {
    notifications.push(...buildDualChannel(env.workspace_id, 'collab-assignment.created', recipientId, payload));
  }
  return notifications;
}

// ── helpers ──────────────────────────────────────────────────────

/**
 * buildDualChannel creates two Notification objects per recipient:
 * one for `in_app` and one for `slack`. The caller dispatches both
 * through the Router.
 */
function buildDualChannel(
  workspaceId: string,
  ruleId: string,
  recipientId: string,
  payload: NotificationPayload,
): Notification[] {
  return [
    {
      rule_id: ruleId,
      workspace_id: workspaceId,
      viewer_id_key: recipientId,
      channel: 'in_app',
      recipient: recipientId,
      payload,
    },
    {
      rule_id: ruleId,
      workspace_id: workspaceId,
      viewer_id_key: recipientId,
      channel: 'slack',
      recipient: recipientId,
      payload,
    },
  ];
}

/**
 * sanitizeBody strips markdown to plain text and truncates to maxLen.
 * This is intentionally simple — a full markdown→text converter is
 * a later-wave concern.
 */
function sanitizeBody(md: string, maxLen: number): string {
  // Strip common markdown: links, bold, italic, images, code.
  const plain = md
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')       // images
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')    // links → anchor text
    .replace(/[*_~`>#]/g, '')                     // bold/italic/code/heading markers
    .trim();
  if (plain.length <= maxLen) return plain;
  return plain.slice(0, maxLen) + '…';
}
