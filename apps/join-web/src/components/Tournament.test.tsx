/**
 * Tournament tests — S5.11.
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Tournament } from './Tournament';
import type { TournamentRound } from '../runtime/widgets/tournament-types';

const ROUNDS: ReadonlyArray<TournamentRound> = [
  {
    id: 'r1',
    name: 'Quarterfinals',
    matchups: [
      {
        a: { participantId: 'p1', name: 'Alice' },
        b: { participantId: 'p2', name: 'Bob' },
        winnerId: 'p1',
      },
      {
        a: { participantId: 'p3', name: 'Cara' },
        b: { participantId: 'p4', name: 'Dan' },
      },
    ],
  },
];

describe('Tournament', () => {
  it('renders the bracket and shows a winner for decided matchups', () => {
    const { container } = render(<Tournament rounds={ROUNDS} />);

    expect(screen.getByTestId('tournament')).toBeInTheDocument();
    expect(screen.getByTestId('tournament-round')).toBeInTheDocument();

    const matchups = container.querySelectorAll(
      '[data-testid="tournament-matchup"]',
    ) as NodeListOf<HTMLElement>;
    expect(matchups).toHaveLength(2);

    const decided = matchups[0]!;
    expect(decided).toHaveAttribute('data-decided', 'true');
    expect(decided).toHaveAttribute('data-winner-id', 'p1');

    const open = matchups[1]!;
    expect(open).toHaveAttribute('data-decided', 'false');
    expect(open).toHaveAttribute('data-winner-id', '');

    // Decided matchup: A is bold, B is struck-through.
    const allA = container.querySelectorAll(
      '[data-testid="tournament-matchup-a"]',
    ) as NodeListOf<HTMLElement>;
    const allB = container.querySelectorAll(
      '[data-testid="tournament-matchup-b"]',
    ) as NodeListOf<HTMLElement>;

    const decidedA = Array.from(allA).find((el) => el.dataset['participantId'] === 'p1')!;
    const decidedB = Array.from(allB).find((el) => el.dataset['participantId'] === 'p2')!;

    expect(decidedA.textContent).toContain('Alice');
    expect(decidedA.textContent).toContain('✓');
    expect(decidedB.textContent).toContain('Bob');
    expect(decidedB.textContent).toContain('✗');

    // Open matchup: both sides show "?".
    const openA = Array.from(allA).find((el) => el.dataset['participantId'] === 'p3')!;
    const openB = Array.from(allB).find((el) => el.dataset['participantId'] === 'p4')!;
    expect(openA.textContent).toContain('?');
    expect(openB.textContent).toContain('?');
  });

  it('renders an empty state when there are no rounds', () => {
    render(<Tournament rounds={[]} />);
    expect(screen.getByTestId('tournament-empty')).toBeInTheDocument();
  });

  it('renders multiple rounds as side-by-side columns', () => {
    const multi: ReadonlyArray<TournamentRound> = [
      { id: 'r1', name: 'Round of 16', matchups: [] },
      { id: 'r2', name: 'Quarterfinals', matchups: [] },
      { id: 'r3', name: 'Semifinals', matchups: [] },
      { id: 'r4', name: 'Final', matchups: [] },
    ];
    render(<Tournament rounds={multi} />);
    const cols = screen.getAllByTestId('tournament-round');
    expect(cols).toHaveLength(4);
  });
});
