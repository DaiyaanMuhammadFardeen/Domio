/**
 * Assignment module types (Phase 18, #181).
 *
 * Slide-level assignments with primary owners, watchers, and status tracking.
 */

// ---------------------------------------------------------------------------
// Assignment
// ---------------------------------------------------------------------------

export type AssignmentStatus = 'not_started' | 'in_progress' | 'blocked' | 'review' | 'done';

export interface Assignment {
  readonly id: string;
  readonly workspaceId: string;
  readonly deckId: string;
  /** Inclusive slide range [start, end], both >= 1. */
  readonly slideRange: { start: number; end: number };
  readonly primaryId: string;
  readonly watchers: readonly string[];
  readonly status: AssignmentStatus;
  readonly blockedReason: string | null;
  readonly dueAt: Date | null;
  readonly createdBy: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly completedAt: Date | null;
  readonly taskLinkId: string | null;
}

// ---------------------------------------------------------------------------
// Reassignment record (in-memory/audit only; DB migration follows in later wave)
// ---------------------------------------------------------------------------

export interface ReassignmentRecord {
  readonly from: string;
  readonly to: string;
  readonly at: Date;
  readonly by: string;
}

// ---------------------------------------------------------------------------
// Create assignment input
// ---------------------------------------------------------------------------

export interface CreateAssignmentInput {
  readonly workspaceId: string;
  readonly deckId: string;
  readonly slideRange: { start: number; end: number };
  readonly primaryId: string;
  readonly watchers: readonly string[];
  readonly dueAt?: Date;
  readonly taskLinkId?: string;
}

// ---------------------------------------------------------------------------
// Update assignment input
// ---------------------------------------------------------------------------

export interface UpdateAssignmentInput {
  readonly status?: AssignmentStatus;
  readonly blockedReason?: string;
  readonly dueAt?: Date | null;
  readonly watchers?: readonly string[];
  readonly primaryId?: string;
}
