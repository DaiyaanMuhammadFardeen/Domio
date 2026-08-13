/**
 * @domio/join-web — Poll widget.
 *
 * Mobile-first: large touch targets (min 44px). After the first
 * submission, renders a running tally of votes per option driven
 * by `state` (an AudienceEnvelope stream from the engine).
 */

'use client';

import { useEffect, useMemo, useState } from 'react';
import type { WidgetComponent, WidgetProps } from './registry';
import { WidgetCard } from './WidgetCard';

interface PollPayload {
  readonly options?: ReadonlyArray<string>;
  readonly question?: string;
}

interface PollTallyFrame {
  readonly kind: 'poll_vote';
  readonly tally?: Record<string, number>;
}

export function PollInner(props: WidgetProps<PollPayload>) {
  const opts = useMemo<ReadonlyArray<string>>(
    () =>
      Array.isArray(props.payload.options) && props.payload.options.length > 0
        ? props.payload.options
        : ['Yes', 'No'],
    [props.payload.options],
  );
  const [myPick, setMyPick] = useState<string | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});

  // Reconcile counts from engine state. The engine pushes poll frames
  // into the bus; merge them in whenever a new tally arrives.
  const tally = (props.state as PollTallyFrame | null)?.tally;
  useEffect(() => {
    if (!tally) return;
    setCounts((prev) => {
      const next = { ...prev, ...tally };
      for (const k of Object.keys(next)) {
        if (next[k] === prev[k]) continue;
        return next;
      }
      return prev;
    });
  }, [tally]);

  const handleClick = (opt: string): void => {
    if (props.disabled || myPick !== null) return;
    setMyPick(opt);
    setCounts((c) => ({ ...c, [opt]: (c[opt] ?? 0) + 1 }));
    props.onSubmit?.({ option: opt });
  };

  const totalVotes = Object.values(counts).reduce((a, b) => a + b, 0);
  const showTally = myPick !== null;

  return (
    <WidgetCard label="Poll" testIdPrefix="poll">
      {props.payload.question ? (
        <p className="text-sm text-slate-700 mb-3" data-testid="poll-question">
          {props.payload.question}
        </p>
      ) : null}
      <ul className="flex flex-col gap-2">
        {opts.map((opt) => {
          const count = counts[opt] ?? 0;
          const pct = showTally && totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;
          return (
            <li key={opt}>
              <button
                type="button"
                className="relative w-full min-h-[44px] text-left p-3 rounded border bg-white hover:bg-blue-50 disabled:opacity-50 disabled:cursor-not-allowed overflow-hidden"
                disabled={props.disabled || myPick !== null}
                onClick={() => handleClick(opt)}
                data-testid={`poll-option-${opt}`}
              >
                {showTally ? (
                  <span
                    className="absolute inset-0 bg-blue-100"
                    style={{ width: `${pct}%` }}
                    aria-hidden
                  />
                ) : null}
                <span className="relative flex justify-between items-center">
                  <span>{opt}</span>
                  {showTally ? (
                    <span className="text-xs text-slate-600" data-testid={`poll-count-${opt}`}>
                      {count}
                    </span>
                  ) : null}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </WidgetCard>
  );
}

export const Poll: WidgetComponent = {
  type: 'poll',
  Component: PollInner as WidgetComponent['Component'],
};
