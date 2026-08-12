'use client';

/**
 * ApprovalBanner — renders a horizontal bar at the top of the canvas area
 * showing the current approval status of the active slide.  If the actor
 * can act, it displays Approve / Request changes buttons that POST to the
 * decisions endpoint.  Otherwise the banner is informational only.
 */

import { useCallback, useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import type { ApprovalRequest, ApprovalStatus } from './types.js';
import { listApprovalRequests, postDecision } from '../lib/collaboration-service.js';

// ----- Types -----

export interface ApprovalBannerProps {
  deckId: string;
  slideId: string;
  currentActorId: string;
}

// ----- Helpers -----

function statusLabel(status: ApprovalStatus): string {
  switch (status) {
    case 'draft':
      return 'Draft';
    case 'pending':
      return 'Awaiting approval';
    case 'approved':
      return 'Approved';
    case 'rejected':
      return 'Rejected';
    case 'changes_requested':
      return 'Changes requested';
  }
}

function statusClass(status: ApprovalStatus): string {
  switch (status) {
    case 'approved':
      return 'collab-banner--approved';
    case 'pending':
      return 'collab-banner--pending';
    case 'rejected':
    case 'changes_requested':
      return 'collab-banner--rejected';
    default:
      return 'collab-banner--draft';
  }
}

// ----- Component -----

export function ApprovalBanner({
  deckId,
  slideId,
  currentActorId,
}: ApprovalBannerProps): ReactElement | null {
  const [requests, setRequests] = useState<ApprovalRequest[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const all = await listApprovalRequests(deckId);
      setRequests(all.filter((r) => r.slide_id === slideId));
    } catch {
      // Silently swallow — banner is decorative.
    }
  }, [deckId, slideId]);

  useEffect(() => {
    void refresh();
    const id = setInterval(refresh, 10_000);
    return () => clearInterval(id);
  }, [refresh]);

  const handleDecision = useCallback(
    async (
      requestId: string,
      decision: 'approve' | 'reject' | 'changes_requested',
    ) => {
      setBusy(true);
      setError(null);
      try {
        await postDecision(requestId, { decision });
        await refresh();
      } catch (cause) {
        setError(
          cause instanceof Error ? cause.message : 'Unable to submit decision.',
        );
      } finally {
        setBusy(false);
      }
    },
    [refresh],
  );

  if (requests.length === 0) return null;

  // Pick the most relevant request: pending first, then latest.
  const active =
    requests.find((r) => r.status === 'pending') ??
    requests.reduce((a, b) =>
      new Date(a.created_at) > new Date(b.created_at) ? a : b,
    );

  const canAct =
    active.status === 'pending' &&
    active.requested_by !== currentActorId;

  return (
    <div className={`collab-banner ${statusClass(active.status)}`}>
      <span className="collab-banner__label">
        {active.title || 'Approval'}: {statusLabel(active.status)}
      </span>

      {canAct && (
        <div className="collab-banner__actions">
          <button
            type="button"
            className="collab-btn collab-btn--approve"
            disabled={busy}
            onClick={() => void handleDecision(active.id, 'approve')}
          >
            Approve
          </button>
          <button
            type="button"
            className="collab-btn collab-btn--reject"
            disabled={busy}
            onClick={() => void handleDecision(active.id, 'changes_requested')}
          >
            Request changes
          </button>
        </div>
      )}

      {error && (
        <span className="collab-banner__error" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
