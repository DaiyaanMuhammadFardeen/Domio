/**
 * Collaboration surface types for comments, approvals, and assignments.
 *
 * Mirrors the shapes served by the control-plane HTTP handlers in apps/api
 * but kept as pure types so the editor can stub the backend in tests
 * and Storybook without pulling in the pgx stack.
 */

// ----- Comments (#179) -----

export type CommentStatus = 'open' | 'resolved';

export interface CommentAnchor {
  /** Fractional x position within the slide viewport (0..1). */
  x: number;
  /** Fractional y position within the slide viewport (0..1). */
  y: number;
}

export interface Comment {
  id: string;
  thread_id: string;
  parent_id: string | null;
  author_id: string;
  body_md: string;
  target_type: string;
  target_id: string;
  anchor: CommentAnchor;
  status: CommentStatus;
  emoji_reactions: Record<string, string[]>;
}

// ----- Approvals (#180) -----

export type ApprovalStatus =
  | 'draft'
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'changes_requested';

export interface ApprovalRequest {
  id: string;
  deck_id: string;
  slide_id: string;
  title: string;
  status: ApprovalStatus;
  requested_by: string;
  created_at: string;
}

export interface ApprovalDecision {
  decision: 'approve' | 'reject' | 'changes_requested';
  comment?: string;
}

// ----- Assignments (#181) -----

export type AssignmentStatus =
  | 'not_started'
  | 'in_progress'
  | 'blocked'
  | 'review'
  | 'done';

export interface Assignment {
  id: string;
  deck_id: string;
  slide_range: [number, number];
  primary_id: string;
  watchers: string[];
  status: AssignmentStatus;
  blocked_reason: string;
}
