/**
 * Approval module types (Phase 18, #180).
 *
 * Deck-level approval workflows with parallel lanes and SLA escalation.
 */

// ---------------------------------------------------------------------------
// Approval policy
// ---------------------------------------------------------------------------

export interface ApprovalLane {
  readonly lane: string;
  readonly role: string;
  readonly required: boolean;
  readonly slaHours: number;
}

export interface ApprovalPolicy {
  readonly lanes: readonly ApprovalLane[];
  /** Auto-submit when creating. */
  readonly submitNow?: boolean;
}

// ---------------------------------------------------------------------------
// Approval request
// ---------------------------------------------------------------------------

export type ApprovalRequestStatus =
  | 'draft'
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'changes_requested';

export interface ApprovalRequest {
  readonly id: string;
  readonly workspaceId: string;
  readonly deckId: string;
  readonly versionId: string;
  readonly requestedBy: string;
  readonly requestedAt: Date | null;
  readonly policy: ApprovalPolicy;
  readonly status: ApprovalRequestStatus;
  readonly closedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly createdBy: string;
  readonly updatedBy: string | null;
}

// ---------------------------------------------------------------------------
// Approval decision
// ---------------------------------------------------------------------------

export type DecisionValue = 'approved' | 'rejected' | 'changes_requested';

export interface ApprovalDecision {
  readonly id: string;
  readonly workspaceId: string;
  readonly requestId: string;
  readonly lane: string;
  readonly approverId: string;
  readonly decision: DecisionValue;
  readonly justification: string | null;
  readonly decidedAt: Date;
  readonly versionId: string;
}

// ---------------------------------------------------------------------------
// Create request input
// ---------------------------------------------------------------------------

export interface CreateApprovalRequestInput {
  readonly workspaceId: string;
  readonly deckId: string;
  readonly versionId: string;
  readonly actorId: string;
  readonly policy: ApprovalPolicy;
}

// ---------------------------------------------------------------------------
// Record decision input
// ---------------------------------------------------------------------------

export interface RecordDecisionInput {
  readonly lane: string;
  readonly decision: DecisionValue;
  readonly justification?: string;
}

// ---------------------------------------------------------------------------
// Overdue lane info
// ---------------------------------------------------------------------------

export interface OverdueLane {
  readonly lane: string;
  readonly slaHours: number;
  readonly overdueByHours: number;
  readonly fallbackRole: string | null;
}
