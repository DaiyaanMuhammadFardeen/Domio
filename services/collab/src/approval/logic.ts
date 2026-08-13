/**
 * Approval module logic (Phase 18, #180).
 *
 * State machine for deck approval workflows with parallel lanes,
 * SLA escalation, and immutable snapshot tracking.
 */

import type {
  ApprovalDecision,
  ApprovalRequest,
  ApprovalRequestStatus,
  CreateApprovalRequestInput,
  DecisionValue,
  OverdueLane,
  RecordDecisionInput,
} from './types.js';
import {
  InvalidTransitionError,
  ApprovalNotPendingError,
  CollabValidationError,
} from '../types.js';

// ---------------------------------------------------------------------------
// Valid transitions
// ---------------------------------------------------------------------------

const VALID_TRANSITIONS: Record<ApprovalRequestStatus, readonly ApprovalRequestStatus[]> = {
  draft: ['pending'],
  pending: ['approved', 'rejected', 'changes_requested', 'draft'],
  approved: ['draft'],
  rejected: ['draft'],
  changes_requested: ['draft'],
};

export function validateTransition(from: ApprovalRequestStatus, to: ApprovalRequestStatus): void {
  const allowed = VALID_TRANSITIONS[from];
  if (!allowed || !allowed.includes(to)) {
    throw new InvalidTransitionError(
      from,
      to,
      `Approval transition ${from} → ${to} is not allowed`,
    );
  }
}

// ---------------------------------------------------------------------------
// Create approval request
// ---------------------------------------------------------------------------

export interface CreateApprovalRequestResult {
  request: ApprovalRequest;
  autoSubmitted: boolean;
}

export function createApprovalRequestBody(
  input: CreateApprovalRequestInput,
  opts: { now: () => Date; idGen: () => string },
): CreateApprovalRequestResult {
  if (!input.deckId) throw new CollabValidationError('deckId is required');
  if (!input.versionId) throw new CollabValidationError('versionId is required');
  if (!input.policy.lanes || input.policy.lanes.length === 0) {
    throw new CollabValidationError('policy.lanes must be non-empty');
  }

  const now = opts.now();
  const shouldSubmit = input.policy.submitNow ?? false;

  const request: ApprovalRequest = {
    id: opts.idGen(),
    workspaceId: input.workspaceId,
    deckId: input.deckId,
    versionId: input.versionId,
    requestedBy: input.actorId,
    requestedAt: shouldSubmit ? now : null,
    policy: input.policy,
    status: shouldSubmit ? 'pending' : 'draft',
    closedAt: null,
    createdAt: now,
    updatedAt: now,
    createdBy: input.actorId,
    updatedBy: null,
  };

  return { request, autoSubmitted: shouldSubmit };
}

// ---------------------------------------------------------------------------
// Submit (draft → pending)
// ---------------------------------------------------------------------------

export function submitApprovalRequestBody(
  request: ApprovalRequest,
  actorId: string,
  now: Date,
): ApprovalRequest {
  validateTransition(request.status, 'pending');
  return {
    ...request,
    status: 'pending',
    requestedAt: now,
    updatedAt: now,
    updatedBy: actorId,
  };
}

// ---------------------------------------------------------------------------
// Record decision
// ---------------------------------------------------------------------------

export function recordApprovalDecisionBody(
  request: ApprovalRequest,
  input: RecordDecisionInput,
  actorId: string,
  versionId: string,
  opts: { now: () => Date; idGen: () => string },
): { decision: ApprovalDecision; updatedRequest: ApprovalRequest } {
  if (request.status !== 'pending') {
    throw new ApprovalNotPendingError(request.id);
  }

  const now = opts.now();

  const decision: ApprovalDecision = {
    id: opts.idGen(),
    workspaceId: request.workspaceId,
    requestId: request.id,
    lane: input.lane,
    approverId: actorId,
    decision: input.decision,
    justification: input.justification ?? null,
    decidedAt: now,
    versionId,
  };

  // Compute new status from all decisions (passed in; caller gathers)
  const newStatus = computeStatus(input.decision);

  const updatedRequest: ApprovalRequest = {
    ...request,
    status: newStatus,
    closedAt: newStatus !== 'pending' ? now : null,
    updatedAt: now,
    updatedBy: actorId,
  };

  return { decision, updatedRequest };
}

/**
 * Compute request status after a new decision arrives.
 * - Any 'rejected' → 'rejected'
 * - Any 'changes_requested' (and no reject) → 'changes_requested'
 * - All required lanes approved → 'approved'
 * - Otherwise → 'pending'
 *
 * Note: Full parallel lane logic requires ALL decisions; this is a single-decision
 * shorthand. The service layer calls recomputeStatus with all decisions.
 */
export function computeStatus(_singleDecision: DecisionValue): ApprovalRequestStatus {
  // This is a placeholder; the service re-computes from all decisions.
  return 'pending';
}

/**
 * Recompute the approval request status from all decisions for all lanes.
 * Requires all required lanes to have approved for 'approved' status.
 */
export function recomputeStatus(
  request: ApprovalRequest,
  decisions: readonly ApprovalDecision[],
): ApprovalRequestStatus {
  // Collect decisions by lane
  const byLane = new Map<string, DecisionValue>();
  for (const d of decisions) {
    byLane.set(d.lane, d.decision);
  }

  // Check for any rejection
  for (const decision of byLane.values()) {
    if (decision === 'rejected') return 'rejected';
  }

  // Check for any changes_requested
  for (const decision of byLane.values()) {
    if (decision === 'changes_requested') return 'changes_requested';
  }

  // Check if ALL required lanes have approved
  const requiredLanes = request.policy.lanes.filter((l) => l.required);
  if (requiredLanes.length > 0) {
    const allApproved = requiredLanes.every((lane) => byLane.get(lane.lane) === 'approved');
    if (allApproved) return 'approved';
  }

  return 'pending';
}

// ---------------------------------------------------------------------------
// Back to draft (on deck edit)
// ---------------------------------------------------------------------------

export function backToDraftBody(
  request: ApprovalRequest,
  actorId: string,
  now: Date,
): ApprovalRequest {
  validateTransition(request.status, 'draft');
  return {
    ...request,
    status: 'draft',
    closedAt: null,
    updatedAt: now,
    updatedBy: actorId,
  };
}

// ---------------------------------------------------------------------------
// SLA escalation
// ---------------------------------------------------------------------------

export function overdueLanes(request: ApprovalRequest, now: Date): OverdueLane[] {
  if (request.status !== 'pending' || !request.requestedAt) return [];

  const overdue: OverdueLane[] = [];
  const requestedMs = request.requestedAt.getTime();
  const nowMs = now.getTime();

  for (let i = 0; i < request.policy.lanes.length; i++) {
    const lane = request.policy.lanes[i]!;
    const slaMs = lane.slaHours * 60 * 60 * 1000;
    const deadline = requestedMs + slaMs;

    if (nowMs > deadline) {
      const overdueByMs = nowMs - deadline;
      const overdueByHours = Math.round((overdueByMs / (60 * 60 * 1000)) * 10) / 10;
      // Fallback is next lane's role, or null if last
      const fallbackRole =
        i < request.policy.lanes.length - 1 ? request.policy.lanes[i + 1]!.role : null;

      overdue.push({
        lane: lane.lane,
        slaHours: lane.slaHours,
        overdueByHours,
        fallbackRole,
      });
    }
  }

  return overdue;
}
