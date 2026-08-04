/**
 * LeaderboardPanel tests (Phase 10 M6.1).
 */

import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LeaderboardPanel, type LeaderboardEntry } from './leaderboard-panel';

const NOW = 1_700_000_000_000;

function makeEntries(): LeaderboardEntry[] {
  return [
    {
      id: 'lr1',
      quizId: 'q1',
      deckId: 'd1',
      attemptId: 'a1',
      questionId: 'q1',
      submittedAnswer: 'Plants eat sunlight.',
      llmConfidence: 0.4,
      llmReason: 'unsure',
      status: 'pending',
      reviewerId: null,
      overrideScore: null,
      createdAt: NOW,
    },
    {
      id: 'lr2',
      quizId: 'q1',
      deckId: 'd1',
      attemptId: 'a2',
      questionId: 'q2',
      submittedAnswer: 'The mitochondrion is the powerhouse.',
      llmConfidence: 0.95,
      llmReason: 'verbatim',
      status: 'approved',
      reviewerId: 'rev-1',
      overrideScore: null,
      createdAt: NOW,
    },
  ];
}

describe('LeaderboardPanel', () => {
  it('renders the panel and shows pending count', () => {
    render(<LeaderboardPanel items={makeEntries()} onUpdate={vi.fn()} />);
    expect(screen.getByTestId('m6-leaderboard-panel')).toBeTruthy();
    expect(screen.getByText(/1 pending review/)).toBeTruthy();
  });

  it('shows each row with confidence and answer', () => {
    render(<LeaderboardPanel items={makeEntries()} onUpdate={vi.fn()} />);
    expect(screen.getByTestId('m6-leaderboard-row-lr1')).toBeTruthy();
    expect(screen.getByTestId('m6-leaderboard-conf-lr1').textContent).toMatch(/0\.40/);
    expect(screen.getByTestId('m6-leaderboard-answer-lr1').textContent).toBe('Plants eat sunlight.');
  });

  it('approve calls onUpdate with status=approved', () => {
    const onUpdate = vi.fn();
    render(<LeaderboardPanel items={makeEntries()} onUpdate={onUpdate} />);
    fireEvent.click(screen.getByTestId('m6-leaderboard-approve-lr1'));
    expect(onUpdate).toHaveBeenCalledWith('lr1', { status: 'approved' });
  });

  it('reject calls onUpdate with status=rejected', () => {
    const onUpdate = vi.fn();
    render(<LeaderboardPanel items={makeEntries()} onUpdate={onUpdate} />);
    fireEvent.click(screen.getByTestId('m6-leaderboard-reject-lr1'));
    expect(onUpdate).toHaveBeenCalledWith('lr1', { status: 'rejected' });
  });

  it('override 1.0 sets overridden + overrideScore=1', () => {
    const onUpdate = vi.fn();
    render(<LeaderboardPanel items={makeEntries()} onUpdate={onUpdate} />);
    fireEvent.click(screen.getByTestId('m6-leaderboard-override-full-lr1'));
    expect(onUpdate).toHaveBeenCalledWith('lr1', { status: 'overridden', overrideScore: 1 });
  });

  it('hides action buttons for resolved items', () => {
    render(<LeaderboardPanel items={makeEntries()} onUpdate={vi.fn()} />);
    expect(screen.queryByTestId('m6-leaderboard-approve-lr2')).toBeNull();
    expect(screen.queryByTestId('m6-leaderboard-reject-lr2')).toBeNull();
  });

  it('shows empty-state when no items', () => {
    render(<LeaderboardPanel items={[]} onUpdate={vi.fn()} />);
    expect(screen.getByTestId('m6-leaderboard-empty')).toBeTruthy();
  });

  it('renders aggregate stats when provided', () => {
    const items = makeEntries();
    render(
      <LeaderboardPanel
        items={items}
        aggregates={[
          {
            quizId: 'q1',
            quizName: 'Onboarding',
            totalAttempts: 10,
            totalPassed: 7,
            averageScore: 0.74,
            highestScore: 1.0,
            lowestScore: 0.2,
          },
        ]}
        onUpdate={vi.fn()}
      />,
    );
    expect(screen.getByTestId('m6-leaderboard-aggregates')).toBeTruthy();
    expect(screen.getByTestId('m6-leaderboard-agg-q1').textContent).toContain('Onboarding');
  });
});
