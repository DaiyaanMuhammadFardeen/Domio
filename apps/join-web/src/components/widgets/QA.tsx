/**
 * @domio/join-web — Q&A widget.
 *
 * Mobile-first: textarea + submit; shows the user's questions (marked)
 * plus other participants' questions with upvote arrows.
 */

'use client';

import { useMemo, useState } from 'react';
import type { WidgetComponent, WidgetProps } from './registry';
import { WidgetCard } from './WidgetCard';

interface QAPayload {
  readonly max_length?: number;
  readonly prompt?: string;
}

interface QAState {
  readonly questions?: ReadonlyArray<{
    readonly id: string;
    readonly text: string;
    readonly upvotes: number;
    readonly mine?: boolean;
  }>;
}

export function QAInner(props: WidgetProps<QAPayload>) {
  const maxLen = props.payload.max_length ?? 280;
  const [text, setText] = useState<string>('');
  const [ownQuestions, setOwnQuestions] = useState<
    ReadonlyArray<{ id: string; text: string; upvotes: number; mine: true }>
  >([]);

  const state = (props.state as QAState | null) ?? null;
  const others = state?.questions ?? [];
  const merged = useMemo(() => {
    const items = [
      ...ownQuestions.map((q) => ({ ...q, mine: true as const })),
      ...others.filter((o) => !ownQuestions.some((m) => m.text === o.text)),
    ];
    return items.sort((a, b) => b.upvotes - a.upvotes);
  }, [ownQuestions, others]);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>): void => {
    e.preventDefault();
    const trimmed = text.trim();
    if (trimmed.length === 0 || trimmed.length > maxLen) return;
    const id = `own-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setOwnQuestions((q) => [...q, { id, text: trimmed, upvotes: 0, mine: true }]);
    setText('');
    props.onSubmit?.({ question: trimmed });
  };

  const upvote = (id: string): void => {
    if (props.disabled) return;
    setOwnQuestions((qs) => qs.map((q) => (q.id === id ? { ...q, upvotes: q.upvotes + 1 } : q)));
    props.onSubmit?.({ upvote: id });
  };

  return (
    <WidgetCard label="Ask a question" testIdPrefix="qa">
      <form onSubmit={handleSubmit} className="flex flex-col gap-2">
        <textarea
          name="q"
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={maxLen}
          disabled={props.disabled}
          className="min-h-[44px] border rounded p-2"
          rows={3}
          placeholder="Your question"
          data-testid="qa-input"
        />
        <button
          type="submit"
          className="min-h-[44px] bg-blue-600 text-white rounded p-2 disabled:opacity-50"
          disabled={props.disabled}
          data-testid="qa-submit"
        >
          Submit
        </button>
      </form>
      <ul className="mt-3 flex flex-col gap-2" data-testid="qa-list">
        {merged.length === 0 ? (
          <li className="text-sm text-slate-500">No questions yet.</li>
        ) : (
          merged.map((q) => (
            <li
              key={q.id}
              className="flex gap-2 items-start border rounded p-2"
              data-testid={`qa-item-${q.id}`}
            >
              <button
                type="button"
                aria-label="Upvote"
                className="min-w-[44px] min-h-[44px] text-blue-700 hover:bg-blue-50 rounded disabled:opacity-50"
                disabled={props.disabled}
                onClick={() => upvote(q.id)}
                data-testid={`qa-upvote-${q.id}`}
              >
                ▲ {q.upvotes}
              </button>
              <span className="flex-1 text-sm text-slate-800">
                {q.text}
                {q.mine ? (
                  <span className="ml-2 text-xs text-blue-600" data-testid={`qa-mine-${q.id}`}>
                    (you)
                  </span>
                ) : null}
              </span>
            </li>
          ))
        )}
      </ul>
    </WidgetCard>
  );
}

export const QA: WidgetComponent = {
  type: 'qa',
  Component: QAInner as WidgetComponent['Component'],
};
