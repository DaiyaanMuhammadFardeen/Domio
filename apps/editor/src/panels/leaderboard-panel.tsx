/**
 * LeaderboardPanel — review pending LLM-grade short-answer submissions
 * and surface aggregate quiz performance.
 *
 * Phase 10 (M6.1).
 *
 * The reviewer can:
 * - Inspect every pending item: question, submitted answer, LLM
 *   confidence, reason
 * - Approve (accept the LLM score), reject (zero the score), or
 *   override with an explicit value
 *
 * Mutations call the LLM-review queue PATCH endpoint
 * (`/v1/llm-review-queue/:id`).
 */

'use client';

import { useCallback } from 'react';
import type { ReactElement } from 'react';

export interface LeaderboardEntry {
  id: string;
  quizId: string;
  deckId: string;
  attemptId: string;
  questionId: string;
  submittedAnswer: string;
  llmConfidence: number;
  llmReason: string;
  status: 'pending' | 'approved' | 'rejected' | 'overridden';
  reviewerId: string | null;
  overrideScore: number | null;
  createdAt: number;
}

export interface LeaderboardAggregate {
  quizId: string;
  quizName?: string;
  totalAttempts: number;
  totalPassed: number;
  averageScore: number;
  highestScore: number;
  lowestScore: number;
}

interface LeaderboardPanelProps {
  items: LeaderboardEntry[];
  aggregates?: readonly LeaderboardAggregate[];
  onUpdate: (
    id: string,
    patch: {
      status?: LeaderboardEntry['status'];
      reviewerId?: string | null;
      overrideScore?: number | null;
    },
  ) => void;
}

function badgeFor(status: LeaderboardEntry['status']): string {
  switch (status) {
    case 'pending':
      return '⏳';
    case 'approved':
      return '✓';
    case 'rejected':
      return '✗';
    case 'overridden':
      return '⚙';
    default:
      return '?';
  }
}

export function LeaderboardPanel({
  items,
  aggregates = [],
  onUpdate,
}: LeaderboardPanelProps): ReactElement {
  const approve = useCallback((id: string) => onUpdate(id, { status: 'approved' }), [onUpdate]);
  const reject = useCallback((id: string) => onUpdate(id, { status: 'rejected' }), [onUpdate]);
  const override = useCallback(
    (id: string, score: number) => onUpdate(id, { status: 'overridden', overrideScore: score }),
    [onUpdate],
  );

  const pendingCount = items.filter((i) => i.status === 'pending').length;

  return (
    <div className="leaderboard-panel" data-testid="m6-leaderboard-panel">
      <div className="props-panel__section-title">
        Quiz Leaderboard
        <span className="prop-field__hint" style={{ marginLeft: 8 }}>
          {pendingCount} pending review
        </span>
      </div>

      {aggregates.length > 0 && (
        <div className="leaderboard-aggregates" data-testid="m6-leaderboard-aggregates">
          {aggregates.map((agg) => (
            <div
              key={agg.quizId}
              className="leaderboard-aggregate"
              data-testid={`m6-leaderboard-agg-${agg.quizId}`}
            >
              <div className="leaderboard-aggregate__name">{agg.quizName ?? agg.quizId}</div>
              <div className="leaderboard-aggregate__stats">
                <span>
                  Attempts: <strong>{agg.totalAttempts}</strong>
                </span>
                <span>
                  Passed: <strong>{agg.totalPassed}</strong>
                </span>
                <span>
                  Avg: <strong>{agg.averageScore.toFixed(2)}</strong>
                </span>
                <span>
                  Min/Max:{' '}
                  <strong>
                    {agg.lowestScore.toFixed(2)}/{agg.highestScore.toFixed(2)}
                  </strong>
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {items.length === 0 && (
        <div className="prop-field__hint" data-testid="m6-leaderboard-empty">
          No review queue items.
        </div>
      )}

      {items.map((item) => (
        <div
          key={item.id}
          className="leaderboard-row"
          data-testid={`m6-leaderboard-row-${item.id}`}
        >
          <div className="leaderboard-row__head">
            <span aria-label={item.status} title={item.status}>
              {badgeFor(item.status)}
            </span>
            <span className="leaderboard-row__qid">Q: {item.questionId}</span>
            <span className="leaderboard-row__conf" data-testid={`m6-leaderboard-conf-${item.id}`}>
              conf: {item.llmConfidence.toFixed(2)}
            </span>
          </div>
          <div className="leaderboard-row__answer" data-testid={`m6-leaderboard-answer-${item.id}`}>
            {item.submittedAnswer}
          </div>
          {item.llmReason && (
            <div
              className="leaderboard-row__reason"
              data-testid={`m6-leaderboard-reason-${item.id}`}
            >
              {item.llmReason}
            </div>
          )}
          {item.status === 'pending' && (
            <div className="leaderboard-row__actions">
              <button
                type="button"
                onClick={() => approve(item.id)}
                data-testid={`m6-leaderboard-approve-${item.id}`}
              >
                Approve
              </button>
              <button
                type="button"
                onClick={() => reject(item.id)}
                data-testid={`m6-leaderboard-reject-${item.id}`}
              >
                Reject
              </button>
              <button
                type="button"
                onClick={() => override(item.id, 1)}
                data-testid={`m6-leaderboard-override-full-${item.id}`}
              >
                Override 1.0
              </button>
              <button
                type="button"
                onClick={() => override(item.id, 0)}
                data-testid={`m6-leaderboard-override-zero-${item.id}`}
              >
                Override 0
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export type { LeaderboardPanelProps };
