/**
 * TeamMode tests — S5.7.
 */

import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { TeamMode } from './TeamMode';
import type { Team, TeamLeaderboardEntry } from '../runtime/widgets/trivia-types';

const TEAMS: ReadonlyArray<Team> = [
  { id: 't1', name: 'Red', color: 'rose' },
  { id: 't2', name: 'Blue', color: 'blue' },
  { id: 't3', name: 'Green', color: 'emerald' },
];

describe('TeamMode', () => {
  it('renders all teams and shows the current team', () => {
    render(
      <TeamMode
        teams={TEAMS}
        myTeamId="t1"
        leaderboard={[]}
        onJoinTeam={() => undefined}
        onLeaveTeam={() => undefined}
      />,
    );

    expect(screen.getByTestId('team-mode')).toBeInTheDocument();
    for (const t of TEAMS) {
      expect(screen.getByTestId(`team-join-${t.id}`)).toBeInTheDocument();
    }
    expect(screen.getByTestId('team-current-name').textContent).toBe('Red');
  });

  it('calls onJoinTeam with the clicked team id', () => {
    const onJoin = vi.fn();
    render(
      <TeamMode
        teams={TEAMS}
        myTeamId="t1"
        leaderboard={[]}
        onJoinTeam={onJoin}
        onLeaveTeam={() => undefined}
      />,
    );

    fireEvent.click(screen.getByTestId('team-join-t2'));
    expect(onJoin).toHaveBeenCalledTimes(1);
    expect(onJoin).toHaveBeenCalledWith('t2');
  });

  it('calls onLeaveTeam when leave is clicked', () => {
    const onLeave = vi.fn();
    render(
      <TeamMode
        teams={TEAMS}
        myTeamId="t1"
        leaderboard={[]}
        onJoinTeam={() => undefined}
        onLeaveTeam={onLeave}
      />,
    );
    fireEvent.click(screen.getByTestId('team-leave'));
    expect(onLeave).toHaveBeenCalledTimes(1);
  });

  it('renders the leaderboard ordered by score desc', () => {
    const leaderboard: ReadonlyArray<TeamLeaderboardEntry> = [
      { teamId: 't1', score: 10 },
      { teamId: 't2', score: 30 },
      { teamId: 't3', score: 20 },
    ];

    const { container } = render(
      <TeamMode
        teams={TEAMS}
        myTeamId={null}
        leaderboard={leaderboard}
        onJoinTeam={() => undefined}
        onLeaveTeam={() => undefined}
      />,
    );

    const rows = container.querySelectorAll(
      '[data-testid^="team-leaderboard-row-"]',
    ) as NodeListOf<HTMLElement>;
    const ids = Array.from(rows).map((r) => r.dataset['testid']);
    expect(ids).toEqual([
      'team-leaderboard-row-t2',
      'team-leaderboard-row-t3',
      'team-leaderboard-row-t1',
    ]);

    expect(screen.getByTestId('team-leaderboard-row-t2').dataset['rank']).toBe('1');
    expect(screen.getByTestId('team-leaderboard-row-t3').dataset['rank']).toBe('2');
    expect(screen.getByTestId('team-leaderboard-row-t1').dataset['rank']).toBe('3');
  });

  it('shows the empty state when there are no leaderboard entries', () => {
    render(
      <TeamMode
        teams={TEAMS}
        myTeamId={null}
        leaderboard={[]}
        onJoinTeam={() => undefined}
        onLeaveTeam={() => undefined}
      />,
    );
    expect(screen.getByTestId('team-leaderboard-empty')).toBeInTheDocument();
  });
});
