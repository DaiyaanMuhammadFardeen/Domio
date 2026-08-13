/**
 * WordRace — first-N-submissions-win widget (S5.11).
 *
 * Submissions are ordered by `ts` ascending. The first
 * `winnerSlots` participants are winners; later submissions are
 * non-winners. The leaderboard shows winners with a checkmark and
 * (when present) a column for the runner-ups.
 */

'use client';

export interface WordRaceSubmission {
  readonly participantId: string;
  readonly word: string;
  /** Epoch milliseconds. */
  readonly ts: number;
}

export interface WordRaceProps {
  readonly prompt: string;
  readonly winnerSlots: number;
  readonly submissions: ReadonlyArray<WordRaceSubmission>;
  readonly onSubmit: (word: string) => void;
}

export function WordRace(props: WordRaceProps) {
  const sorted = [...props.submissions].sort((a, b) => a.ts - b.ts);
  const winners = sorted.slice(0, props.winnerSlots);
  const runnersUp = sorted.slice(props.winnerSlots);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const text = String(fd.get('word') || '').trim();
    if (text.length > 0 && text.length <= 32) {
      props.onSubmit(text);
      form.reset();
    }
  }

  return (
    <section
      className="bg-white rounded-lg shadow p-4 flex flex-col gap-4"
      data-testid="word-race"
      aria-label={`Word race: ${props.prompt}`}
    >
      <header>
        <div className="text-xs uppercase tracking-wide text-slate-500">Word race</div>
        <h2 className="text-base font-semibold text-slate-900" data-testid="word-race-prompt">
          {props.prompt}
        </h2>
        <p className="text-xs text-slate-500 mt-1">First {props.winnerSlots} submissions win.</p>
      </header>

      <form onSubmit={handleSubmit} className="flex gap-2" data-testid="word-race-form">
        <input
          name="word"
          maxLength={32}
          placeholder="Your word"
          className="flex-1 border rounded p-2"
          data-testid="word-race-input"
        />
        <button
          type="submit"
          className="bg-blue-600 text-white rounded px-4"
          data-testid="word-race-submit"
        >
          Send
        </button>
      </form>

      <div>
        <h3 className="text-sm font-semibold text-slate-700 mb-2">Leaderboard</h3>
        <ol className="flex flex-col gap-1" data-testid="word-race-leaderboard">
          {winners.map((entry, idx) => (
            <li
              key={`${entry.participantId}-${entry.ts}`}
              className="flex items-center justify-between rounded border border-emerald-300 bg-emerald-50 px-3 py-2"
              data-testid="word-race-winner-row"
              data-rank={idx + 1}
            >
              <span className="flex items-center gap-2">
                <span
                  className="text-emerald-700"
                  aria-label="Winner"
                  data-testid="word-race-winner-check"
                >
                  ✓
                </span>
                <span className="tabular-nums text-slate-500 w-6 text-right">{idx + 1}.</span>
                <span className="font-semibold text-slate-900">{entry.word}</span>
              </span>
              <span className="text-xs text-slate-500">{entry.participantId}</span>
            </li>
          ))}
          {runnersUp.map((entry, idx) => (
            <li
              key={`${entry.participantId}-${entry.ts}`}
              className="flex items-center justify-between rounded border border-slate-200 px-3 py-2"
              data-testid="word-race-runner-row"
              data-rank={winners.length + idx + 1}
            >
              <span className="flex items-center gap-2">
                <span className="tabular-nums text-slate-500 w-6 text-right">
                  {winners.length + idx + 1}.
                </span>
                <span className="text-slate-700">{entry.word}</span>
              </span>
              <span className="text-xs text-slate-500">{entry.participantId}</span>
            </li>
          ))}
          {sorted.length === 0 ? (
            <li className="text-sm text-slate-500" data-testid="word-race-empty">
              No submissions yet.
            </li>
          ) : null}
        </ol>
      </div>
    </section>
  );
}
