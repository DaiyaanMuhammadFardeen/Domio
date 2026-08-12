'use client';

/**
 * AssignmentPanel — slide-scoped panel listing assignments that overlap
 * the current slide.  Shows primary + watchers, status as a segmented
 * control (Not started / In progress / Blocked / Review / Done).
 * Changing status PATCHes the backend.  Blocked status requires a
 * mandatory reason input before it can be set.
 */

import { useCallback, useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import type { Assignment, AssignmentStatus } from './types.js';
import { listAssignments, patchAssignment } from '../lib/collaboration-service.js';

// ----- Types -----

export interface AssignmentPanelProps {
  deckId: string;
  slidePosition: number;
  currentActorId: string;
}

// ----- Helpers -----

const STATUS_OPTIONS: readonly AssignmentStatus[] = [
  'not_started',
  'in_progress',
  'blocked',
  'review',
  'done',
];

function statusLabel(status: AssignmentStatus): string {
  switch (status) {
    case 'not_started':
      return 'Not started';
    case 'in_progress':
      return 'In progress';
    case 'blocked':
      return 'Blocked';
    case 'review':
      return 'Review';
    case 'done':
      return 'Done';
  }
}

function isActiveSlide(a: Assignment, pos: number): boolean {
  const [start, end] = a.slide_range;
  return pos >= start && pos <= end;
}

// ----- Component -----

export function AssignmentPanel({
  deckId,
  slidePosition,
  currentActorId,
}: AssignmentPanelProps): ReactElement {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [blockedReasons, setBlockedReasons] = useState<
    Record<string, string>
  >({});

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const all = await listAssignments(deckId);
      setAssignments(all.filter((a) => isActiveSlide(a, slidePosition)));
      setError(null);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Unable to load assignments.',
      );
    } finally {
      setLoading(false);
    }
  }, [deckId, slidePosition]);

  useEffect(() => {
    void refresh();
    const id = setInterval(refresh, 15_000);
    return () => clearInterval(id);
  }, [refresh]);

  const handleStatusChange = useCallback(
    async (assignment: Assignment, next: AssignmentStatus) => {
      if (next === 'blocked') {
        // Show the reason input — don't PATCH yet.
        setBlockedReasons((prev) => ({
          ...prev,
          [assignment.id]: prev[assignment.id] ?? '',
        }));
        return;
      }

      setBusyId(assignment.id);
      try {
        await patchAssignment(assignment.id, { status: next });
        await refresh();
      } catch (cause) {
        setError(
          cause instanceof Error
            ? cause.message
            : 'Unable to update assignment.',
        );
      } finally {
        setBusyId(null);
      }
    },
    [refresh],
  );

  const handleBlockedConfirm = useCallback(
    async (assignmentId: string) => {
      const reason = blockedReasons[assignmentId];
      if (!reason?.trim()) return;

      setBusyId(assignmentId);
      try {
        await patchAssignment(assignmentId, {
          status: 'blocked',
          blocked_reason: reason.trim(),
        });
        setBlockedReasons((prev) => {
          const next = { ...prev };
          delete next[assignmentId];
          return next;
        });
        await refresh();
      } catch (cause) {
        setError(
          cause instanceof Error
            ? cause.message
            : 'Unable to update assignment.',
        );
      } finally {
        setBusyId(null);
      }
    },
    [blockedReasons, refresh],
  );

  return (
    <section aria-label="Assignments" className="collab-panel">
      <header className="collab-panel__header">
        <h2>Assignments</h2>
        <button
          type="button"
          className="collab-btn collab-btn--subtle"
          onClick={() => void refresh()}
        >
          Refresh
        </button>
      </header>

      {loading && <p className="collab-panel__muted">Loading…</p>}
      {error && (
        <p className="collab-panel__error" role="alert">
          {error}
        </p>
      )}

      {!loading && assignments.length === 0 && (
        <p className="collab-panel__muted">No assignments for this slide.</p>
      )}

      {assignments.map((a) => {
        const isPrimary = a.primary_id === currentActorId;
        const isWatcher = a.watchers.includes(currentActorId);
        const showBlockedReason =
          a.status === 'blocked' || blockedReasons[a.id] !== undefined;

        return (
          <div key={a.id} className="collab-assignment">
            <div className="collab-assignment__header">
              <span className="collab-assignment__role">
                {isPrimary ? 'Primary' : isWatcher ? 'Watcher' : a.primary_id}
              </span>
              {isPrimary && (
                <span className="collab-assignment__you">(you)</span>
              )}
            </div>

            <div
              className="collab-segmented"
              role="radiogroup"
              aria-label={`Status for assignment ${a.id}`}
            >
              {STATUS_OPTIONS.map((opt) => (
                <button
                  key={opt}
                  type="button"
                  role="radio"
                  aria-checked={a.status === opt}
                  className={`collab-segmented__btn${
                    a.status === opt ? ' is-active' : ''
                  }`}
                  disabled={busyId === a.id}
                  onClick={() => void handleStatusChange(a, opt)}
                >
                  {statusLabel(opt)}
                </button>
              ))}
            </div>

            {showBlockedReason && (
              <div className="collab-assignment__blocked">
                <label
                  htmlFor={`blocked-reason-${a.id}`}
                  className="collab-assignment__blocked-label"
                >
                  Blocked — add a reason
                </label>
                <input
                  id={`blocked-reason-${a.id}`}
                  type="text"
                  className="collab-assignment__blocked-input"
                  placeholder="Reason for blocking"
                  value={blockedReasons[a.id] ?? a.blocked_reason ?? ''}
                  onChange={(e) =>
                    setBlockedReasons((prev) => ({
                      ...prev,
                      [a.id]: e.target.value,
                    }))
                  }
                />
                <button
                  type="button"
                  className="collab-btn collab-btn--reject"
                  disabled={
                    busyId === a.id ||
                    !(blockedReasons[a.id]?.trim())
                  }
                  onClick={() => void handleBlockedConfirm(a.id)}
                >
                  Confirm blocked
                </button>
              </div>
            )}

            {a.watchers.length > 0 && (
              <p className="collab-assignment__watchers">
                Watchers: {a.watchers.join(', ')}
              </p>
            )}
          </div>
        );
      })}
    </section>
  );
}
