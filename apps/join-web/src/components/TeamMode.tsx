/**
 * TeamMode — team selection + per-team leaderboard (S5.7).
 *
 * Pure presentation. The parent supplies the list of teams, the
 * participant's current team, and the live leaderboard. Joins flow
 * through `onJoinTeam`; `onLeaveTeam` is invoked when a participant
 * taps "Leave team".
 */

'use client';

import type { Team, TeamLeaderboardEntry } from '../runtime/widgets/trivia-types';

export interface TeamModeProps {
  readonly teams: ReadonlyArray<Team>;
  readonly myTeamId: string | null;
  readonly leaderboard: ReadonlyArray<TeamLeaderboardEntry>;
  readonly onJoinTeam: (teamId: string) => void;
  readonly onLeaveTeam: () => void;
}

const COLOR_BG: Record<string, string> = {
  blue: 'bg-blue-100 text-blue-900 border-blue-300',
  emerald: 'bg-emerald-100 text-emerald-900 border-emerald-300',
  rose: 'bg-rose-100 text-rose-900 border-rose-300',
  amber: 'bg-amber-100 text-amber-900 border-amber-300',
  violet: 'bg-violet-100 text-violet-900 border-violet-300',
  slate: 'bg-slate-100 text-slate-900 border-slate-300',
};

function colorClass(token: string): string {
  return COLOR_BG[token] ?? COLOR_BG['slate']!;
}

export function TeamMode(props: TeamModeProps) {
  // Order leaderboard by score desc, tie-broken by teamId asc for stable
  // ordering across renders.
  const sortedLeaderboard = [...props.leaderboard].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.teamId.localeCompare(b.teamId);
  });

  const myTeam = props.teams.find((t) => t.id === props.myTeamId) ?? null;

  return (
    <section className="bg-white rounded-lg shadow p-4 flex flex-col gap-4" data-testid="team-mode">
      <header className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-slate-900">Teams</h2>
        {myTeam ? (
          <button
            type="button"
            onClick={props.onLeaveTeam}
            className="text-xs font-semibold text-slate-600 hover:text-slate-900"
            data-testid="team-leave"
          >
            Leave team
          </button>
        ) : null}
      </header>

      <div className="text-sm text-slate-600" data-testid="team-current">
        {myTeam ? (
          <>
            You are on{' '}
            <span className="font-semibold text-slate-900" data-testid="team-current-name">
              {myTeam.name}
            </span>
            .
          </>
        ) : (
          <>Pick a team to join.</>
        )}
      </div>

      <ul
        className="grid grid-cols-2 gap-2"
        data-testid="team-list"
        aria-label="Available teams"
      >
        {props.teams.map((team) => {
          const isMine = team.id === props.myTeamId;
          return (
            <li key={team.id}>
              <button
                type="button"
                onClick={() => props.onJoinTeam(team.id)}
                className={
                  'w-full p-3 rounded border text-left ' +
                  colorClass(team.color) +
                  (isMine ? ' ring-2 ring-offset-1 ring-blue-500' : '')
                }
                aria-pressed={isMine}
                data-testid={`team-join-${team.id}`}
              >
                <div className="font-semibold">{team.name}</div>
                <div className="text-xs opacity-80">{isMine ? 'Current' : 'Tap to join'}</div>
              </button>
            </li>
          );
        })}
      </ul>

      <div>
        <h3 className="text-sm font-semibold text-slate-700 mb-2">Team leaderboard</h3>
        <ol className="flex flex-col gap-1" data-testid="team-leaderboard">
          {sortedLeaderboard.length === 0 ? (
            <li className="text-sm text-slate-500" data-testid="team-leaderboard-empty">
              No scores yet.
            </li>
          ) : (
            sortedLeaderboard.map((entry, idx) => {
              const team = props.teams.find((t) => t.id === entry.teamId);
              return (
                <li
                  key={entry.teamId}
                  className="flex items-center justify-between rounded border border-slate-200 px-3 py-2"
                  data-testid={`team-leaderboard-row-${entry.teamId}`}
                  data-rank={idx + 1}
                >
                  <span className="flex items-center gap-2">
                    <span className="text-slate-500 tabular-nums w-6 text-right">{idx + 1}.</span>
                    <span className="font-semibold text-slate-900">
                      {team?.name ?? entry.teamId}
                    </span>
                  </span>
                  <span
                    className="font-mono tabular-nums text-slate-700"
                    data-testid={`team-leaderboard-score-${entry.teamId}`}
                  >
                    {entry.score}
                  </span>
                </li>
              );
            })
          )}
        </ol>
      </div>
    </section>
  );
}