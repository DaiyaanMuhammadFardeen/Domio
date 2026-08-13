/**
 * @domio/join-web — Quiz widget.
 *
 * Mobile-first: 2x2 grid of options, each min 44px tall. Timer
 * countdown if payload.timer_ms is set. After submission, the
 * correct option (from payload.correct) is highlighted.
 */

'use client';

import { useEffect, useState } from 'react';
import type { WidgetComponent, WidgetProps } from './registry';
import { WidgetCard } from './WidgetCard';

interface QuizPayload {
  readonly options?: ReadonlyArray<string>;
  readonly correct?: number;
  readonly timer_ms?: number;
  readonly prompt?: string;
}

export function QuizInner(props: WidgetProps<QuizPayload>) {
  const options = Array.isArray(props.payload.options) && props.payload.options.length > 0
    ? props.payload.options
    : ['A', 'B', 'C', 'D'];
  const correct = props.payload.correct;
  const timerMs = props.payload.timer_ms;
  const [pick, setPick] = useState<number | null>(null);
  const [remaining, setRemaining] = useState<number | null>(timerMs ?? null);

  useEffect(() => {
    if (remaining === null || pick !== null) return;
    if (remaining <= 0) return;
    const t = setTimeout(() => {
      setRemaining((r) => (r === null ? null : Math.max(0, r - 250)));
    }, 250);
    return () => clearTimeout(t);
  }, [remaining, pick]);

  const handlePick = (idx: number, opt: string): void => {
    if (props.disabled || pick !== null) return;
    setPick(idx);
    props.onSubmit?.({ choice: opt, index: idx });
  };

  return (
    <WidgetCard label="Quiz" testIdPrefix="quiz">
      {props.payload.prompt ? (
        <p className="text-sm text-slate-700 mb-2" data-testid="quiz-prompt">
          {props.payload.prompt}
        </p>
      ) : null}
      {remaining !== null ? (
        <div className="mb-2 text-sm text-slate-600" data-testid="quiz-timer">
          Time left: {Math.ceil(remaining / 1000)}s
        </div>
      ) : null}
      <ul className="grid grid-cols-2 gap-2">
        {options.map((c, idx) => {
          const isCorrect = pick !== null && correct === idx;
          const isMine = pick === idx;
          const wrong = pick !== null && pick === idx && correct !== idx;
          return (
            <li key={c}>
              <button
                type="button"
                className={
                  'w-full min-h-[44px] p-3 rounded border bg-white hover:bg-blue-50 disabled:opacity-50 ' +
                  (isCorrect
                    ? 'bg-green-100 border-green-500'
                    : wrong
                      ? 'bg-red-100 border-red-500'
                      : '')
                }
                disabled={props.disabled || pick !== null}
                onClick={() => handlePick(idx, c)}
                data-testid={`quiz-choice-${c}`}
              >
                {c}
                {isMine ? <span className="ml-2 text-xs">(you)</span> : null}
              </button>
            </li>
          );
        })}
      </ul>
    </WidgetCard>
  );
}

export const Quiz: WidgetComponent = {
  type: 'quiz',
  Component: QuizInner as WidgetComponent['Component'],
};