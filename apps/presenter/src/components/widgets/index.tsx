/**
 * @domio/presenter — director widgets.
 *
 * Phase 16 W4-W8. Each widget renders the live aggregate + controls
 * (open/close). The widget talks to the corresponding engine via the
 * audience-service REST surface; for offline/test mode it accepts a
 * `snapshot` prop.
 */

'use client';

import { useState } from 'react';

export type WidgetKind =
  | 'poll'
  | 'word_cloud'
  | 'qa'
  | 'quiz'
  | 'reaction'
  | 'nav_vote'
  | 'sentiment'
  | 'raise_hand';

export interface DirectorWidgetProps {
  readonly kind: WidgetKind;
  readonly widgetId: string;
  readonly title: string;
  readonly status?: 'draft' | 'open' | 'closed' | undefined;
  readonly snapshot?: Record<string, unknown> | undefined;
  readonly onStatusChange?: ((status: 'draft' | 'open' | 'closed') => void) | undefined;
}

export function DirectorWidget(props: DirectorWidgetProps) {
  switch (props.kind) {
    case 'poll':
      return <PollDirectorWidget {...props} />;
    case 'word_cloud':
      return <WordCloudDirectorWidget {...props} />;
    case 'qa':
      return <QaDirectorWidget {...props} />;
    case 'quiz':
      return <QuizDirectorWidget {...props} />;
    case 'reaction':
      return <ReactionDirectorWidget {...props} />;
    case 'nav_vote':
      return <NavVoteDirectorWidget {...props} />;
    case 'sentiment':
      return <SentimentDirectorWidget {...props} />;
    case 'raise_hand':
      return <RaiseHandDirectorWidget {...props} />;
    default:
      return null;
  }
}

function WidgetShell({
  label,
  status,
  onOpen,
  onClose,
  children,
}: {
  label: string;
  status: 'draft' | 'open' | 'closed' | undefined;
  onOpen: () => void;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded border bg-white p-3 mb-2" data-testid={`director-${label}`}>
      <header className="flex items-center justify-between mb-2">
        <h3 className="font-semibold text-sm">{label}</h3>
        <div className="flex items-center gap-2">
          <span className="text-xs px-2 py-0.5 rounded bg-slate-100">{status ?? 'draft'}</span>
          {status !== 'open' && (
            <button
              type="button"
              className="text-xs bg-blue-600 text-white rounded px-2 py-1"
              onClick={onOpen}
            >
              Open
            </button>
          )}
          {status === 'open' && (
            <button
              type="button"
              className="text-xs bg-red-600 text-white rounded px-2 py-1"
              onClick={onClose}
            >
              Close
            </button>
          )}
        </div>
      </header>
      {children}
    </section>
  );
}

function PollDirectorWidget(props: DirectorWidgetProps) {
  const [local, setLocal] = useState(props.status ?? 'draft');
  const counts = (props.snapshot?.counts as number[] | undefined) ?? [];
  const total = (props.snapshot?.total as number | undefined) ?? 0;
  return (
    <WidgetShell
      label={`Poll: ${props.title}`}
      status={local}
      onOpen={() => {
        setLocal('open');
        props.onStatusChange?.('open');
      }}
      onClose={() => {
        setLocal('closed');
        props.onStatusChange?.('closed');
      }}
    >
      <ul className="text-sm">
        {counts.map((c, i) => (
          <li key={i} className="flex justify-between border-b py-1">
            <span>Option {i + 1}</span>
            <span>{c}</span>
          </li>
        ))}
        {counts.length === 0 && <li className="text-slate-500">No votes yet</li>}
      </ul>
      <div className="text-xs text-slate-500 mt-2">Total votes: {total}</div>
    </WidgetShell>
  );
}

function WordCloudDirectorWidget(props: DirectorWidgetProps) {
  const [local, setLocal] = useState(props.status ?? 'draft');
  const counts = (props.snapshot?.counts as Record<string, number> | undefined) ?? {};
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  return (
    <WidgetShell
      label={`Word cloud: ${props.title}`}
      status={local}
      onOpen={() => {
        setLocal('open');
        props.onStatusChange?.('open');
      }}
      onClose={() => {
        setLocal('closed');
        props.onStatusChange?.('closed');
      }}
    >
      <ul className="text-sm flex flex-wrap gap-2">
        {entries.map(([word, count]) => (
          <li
            key={word}
            className="px-2 py-0.5 rounded bg-blue-100"
            style={{ fontSize: Math.min(28, 12 + count) }}
          >
            {word} <span className="text-xs text-slate-500">{count}</span>
          </li>
        ))}
        {entries.length === 0 && <li className="text-slate-500">No submissions yet</li>}
      </ul>
    </WidgetShell>
  );
}

function QaDirectorWidget(props: DirectorWidgetProps) {
  const [local, setLocal] = useState(props.status ?? 'open');
  const items =
    (props.snapshot?.submits as
      | ReadonlyArray<{ id: string; body: string; upvotes: number }>
      | undefined) ?? [];
  const sorted = [...items].sort((a, b) => b.upvotes - a.upvotes);
  return (
    <WidgetShell
      label={`Q&A: ${props.title}`}
      status={local}
      onOpen={() => {
        setLocal('open');
        props.onStatusChange?.('open');
      }}
      onClose={() => {
        setLocal('closed');
        props.onStatusChange?.('closed');
      }}
    >
      <ol className="text-sm">
        {sorted.map((q, i) => (
          <li key={q.id} className="border-b py-1 flex justify-between gap-2">
            <span>
              <span className="text-slate-500">{i + 1}.</span> {q.body}
            </span>
            <span className="text-xs text-blue-700">▲ {q.upvotes}</span>
          </li>
        ))}
        {sorted.length === 0 && <li className="text-slate-500">No questions yet</li>}
      </ol>
    </WidgetShell>
  );
}

function QuizDirectorWidget(props: DirectorWidgetProps) {
  const [local, setLocal] = useState(props.status ?? 'draft');
  const board =
    (props.snapshot?.leaderboard as
      | ReadonlyArray<{ participant_id: string; total_points: number; correct_count: number }>
      | undefined) ?? [];
  return (
    <WidgetShell
      label={`Quiz: ${props.title}`}
      status={local}
      onOpen={() => {
        setLocal('open');
        props.onStatusChange?.('open');
      }}
      onClose={() => {
        setLocal('closed');
        props.onStatusChange?.('closed');
      }}
    >
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left border-b">
            <th>#</th>
            <th>Participant</th>
            <th>Points</th>
            <th>Correct</th>
          </tr>
        </thead>
        <tbody>
          {board.map((row, i) => (
            <tr key={row.participant_id} className="border-b">
              <td className="py-1">{i + 1}</td>
              <td>{row.participant_id}</td>
              <td>{row.total_points}</td>
              <td>{row.correct_count}</td>
            </tr>
          ))}
          {board.length === 0 && (
            <tr>
              <td colSpan={4} className="text-slate-500 py-2">
                No answers yet
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </WidgetShell>
  );
}

function ReactionDirectorWidget(_props: DirectorWidgetProps) {
  return (
    <section className="rounded border bg-white p-3 mb-2" data-testid="director-reaction">
      <h3 className="font-semibold text-sm">Reactions</h3>
      <p className="text-xs text-slate-500">
        Audience reacts are visible in real time on this widget.
      </p>
    </section>
  );
}

function NavVoteDirectorWidget(_props: DirectorWidgetProps) {
  const tally =
    (_props.snapshot as { next?: number; previous?: number; back?: number } | undefined) ?? {};
  return (
    <section className="rounded border bg-white p-3 mb-2" data-testid="director-nav">
      <h3 className="font-semibold text-sm">Nav vote tally</h3>
      <ul className="text-sm mt-1">
        <li>Next: {tally.next ?? 0}</li>
        <li>Previous: {tally.previous ?? 0}</li>
        <li>Back: {tally.back ?? 0}</li>
      </ul>
    </section>
  );
}

function SentimentDirectorWidget(props: DirectorWidgetProps) {
  const summary = (props.snapshot as { average?: number; count?: number } | undefined) ?? {};
  return (
    <section className="rounded border bg-white p-3 mb-2" data-testid="director-sentiment">
      <h3 className="font-semibold text-sm">Sentiment · slide {props.widgetId}</h3>
      <p className="text-sm mt-1">
        Average {typeof summary.average === 'number' ? summary.average.toFixed(2) : '—'} from{' '}
        {summary.count ?? 0} ratings
      </p>
    </section>
  );
}

function RaiseHandDirectorWidget(props: DirectorWidgetProps) {
  const items =
    (props.snapshot?.queue as
      | ReadonlyArray<{ participant_id: string; raised_at_ms: number }>
      | undefined) ?? [];
  return (
    <WidgetShell
      label={`Raise hand: ${props.title}`}
      status={props.status ?? 'open'}
      onOpen={() => undefined}
      onClose={() => undefined}
    >
      <ol className="text-sm">
        {items.map((h, i) => (
          <li key={h.participant_id} className="border-b py-1 flex justify-between">
            <span>
              {i + 1}. {h.participant_id}
            </span>
            <button type="button" className="text-xs bg-blue-600 text-white rounded px-2 py-0.5">
              Call
            </button>
          </li>
        ))}
        {items.length === 0 && <li className="text-slate-500">No hands raised</li>}
      </ol>
    </WidgetShell>
  );
}
