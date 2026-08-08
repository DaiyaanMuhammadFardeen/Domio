/**
 * Notification dispatcher — collaboration event types.
 *
 * These types model the NATS messages published on `collab.events.*`
 * subjects. Each event type carries a typed payload that the mapper
 * converts into Notification objects for the channel router.
 */

/** Envelope wraps every collaboration event on the NATS subject. */
export interface CollabEventEnvelope {
  event_type: string;
  workspace_id: string;
  /** Epoch milliseconds when the event occurred. */
  timestamp: number;
  /** Event-specific payload — shape depends on event_type. */
  payload: Record<string, unknown>;
}

/** comment.mentioned — a user was @mentioned in a deck comment. */
export interface CommentMentionedPayload {
  comment_id: string;
  deck_id: string;
  body_md: string;
  mentioned_type: 'user' | 'group' | 'role';
  mentioned_id: string;
}

/** approval.requested — a deck approval was requested. */
export interface ApprovalRequestedPayload {
  request_id: string;
  deck_id: string;
  approver_id: string;
}

/** assignment.created — slides were assigned to a user. */
export interface AssignmentCreatedPayload {
  assignment_id: string;
  deck_id: string;
  /** e.g. "3–7" — the slide range label. */
  slide_range: string;
  primary_id: string;
  watchers: string[];
  status: 'pending' | 'approved' | 'rejected' | 'blocked';
  blocked_reason?: string;
}
