/**
 * Tournament — bracket view (S5.11).
 *
 * Renders one column per round, with each matchup as a stacked
 * pair (A over B). Decided matchups bold the winner and grey out
 * the loser; open matchups show "?" for both sides.
 */

'use client';

import type { Matchup, TournamentRound } from '../runtime/widgets/tournament-types';

export interface TournamentProps {
  readonly rounds: ReadonlyArray<TournamentRound>;
}

function MatchupCard(props: { readonly matchup: Matchup }) {
  const { a, b, winnerId } = props.matchup;
  const decided = typeof winnerId === 'string';
  const aWon = decided && winnerId === a.participantId;
  const bWon = decided && winnerId === b.participantId;

  return (
    <div
      className="rounded border border-slate-200 bg-white px-3 py-2 flex flex-col gap-1"
      data-testid="tournament-matchup"
      data-decided={decided ? 'true' : 'false'}
      data-winner-id={winnerId ?? ''}
    >
      <div
        className={
          'flex items-center justify-between text-sm ' +
          (aWon ? 'font-bold text-emerald-700' : decided ? 'text-slate-400 line-through' : 'text-slate-700')
        }
        data-testid="tournament-matchup-a"
        data-participant-id={a.participantId}
      >
        <span>{a.name}</span>
        <span aria-hidden="true">{aWon ? '✓' : decided ? '✗' : '?'}</span>
      </div>
      <div className="text-xs text-slate-400">vs</div>
      <div
        className={
          'flex items-center justify-between text-sm ' +
          (bWon ? 'font-bold text-emerald-700' : decided ? 'text-slate-400 line-through' : 'text-slate-700')
        }
        data-testid="tournament-matchup-b"
        data-participant-id={b.participantId}
      >
        <span>{b.name}</span>
        <span aria-hidden="true">{bWon ? '✓' : decided ? '✗' : '?'}</span>
      </div>
    </div>
  );
}

export function Tournament(props: TournamentProps) {
  if (props.rounds.length === 0) {
    return (
      <section className="bg-white rounded-lg shadow p-4" data-testid="tournament-empty">
        <p className="text-sm text-slate-600">No tournament rounds.</p>
      </section>
    );
  }

  return (
    <section className="bg-white rounded-lg shadow p-4 overflow-x-auto" data-testid="tournament">
      <header className="mb-3">
        <div className="text-xs uppercase tracking-wide text-slate-500">Tournament</div>
        <h2 className="text-base font-semibold text-slate-900">Bracket</h2>
      </header>

      <div className="flex gap-6 min-w-fit" data-testid="tournament-bracket">
        {props.rounds.map((round) => (
          <div
            key={round.id}
            className="flex flex-col gap-3 min-w-[10rem]"
            data-testid="tournament-round"
            data-round-id={round.id}
          >
            <h3 className="text-sm font-semibold text-slate-700">{round.name}</h3>
            <div className="flex flex-col gap-2">
              {round.matchups.map((m, idx) => (
                <MatchupCard key={`${round.id}-${idx}`} matchup={m} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}