/**
 * @domio/join-web — Word Cloud widget.
 *
 * Mobile-first: text input + submit; word-frequency display driven by
 * state pushed in via the WS bus.
 */

'use client';

import { useMemo, useState } from 'react';
import type { WidgetComponent, WidgetProps } from './registry';
import { WidgetCard } from './WidgetCard';

interface WordCloudPayload {
  readonly prompt?: string;
  readonly max_length?: number;
}

interface WordCloudState {
  readonly words?: ReadonlyArray<{ text: string; count: number }>;
}

export function WordCloudInner(props: WidgetProps<WordCloudPayload>) {
  const maxLen = props.payload.max_length ?? 40;
  const [text, setText] = useState<string>('');
  const [submitted, setSubmitted] = useState<ReadonlyArray<string>>([]);

  const state = (props.state as WordCloudState | null) ?? null;
  const engineWords = state?.words ?? [];
  const merged = useMemo(() => {
    const map = new Map<string, number>();
    for (const w of engineWords) map.set(w.text, w.count);
    for (const w of submitted) map.set(w, (map.get(w) ?? 0) + 1);
    return Array.from(map.entries())
      .map(([t, c]) => ({ text: t, count: c }))
      .sort((a, b) => b.count - a.count);
  }, [engineWords, submitted]);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>): void => {
    e.preventDefault();
    const trimmed = text.trim();
    if (trimmed.length === 0 || trimmed.length > maxLen) return;
    setSubmitted((s) => [...s, trimmed]);
    setText('');
    props.onSubmit?.({ text: trimmed });
  };

  return (
    <WidgetCard label="Word cloud" testIdPrefix="word-cloud">
      {props.payload.prompt ? (
        <p className="text-sm text-slate-700 mb-2" data-testid="word-cloud-prompt">
          {props.payload.prompt}
        </p>
      ) : null}
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          name="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={props.disabled}
          maxLength={maxLen}
          className="flex-1 min-h-[44px] border rounded p-2"
          placeholder="word"
          data-testid="word-cloud-input"
        />
        <button
          type="submit"
          className="min-h-[44px] bg-blue-600 text-white rounded px-4 disabled:opacity-50"
          disabled={props.disabled}
          data-testid="word-cloud-submit"
        >
          Send
        </button>
      </form>
      <div className="mt-3 flex flex-wrap gap-2" data-testid="word-cloud-list">
        {merged.length === 0 ? (
          <p className="text-sm text-slate-500">No words yet.</p>
        ) : (
          merged.map((w) => {
            const size = Math.min(28, 12 + w.count * 4);
            return (
              <span
                key={w.text}
                className="px-2 py-1 bg-blue-50 text-blue-900 rounded"
                style={{ fontSize: `${size}px` }}
                data-testid={`word-cloud-word-${w.text}`}
              >
                {w.text}
              </span>
            );
          })
        )}
      </div>
    </WidgetCard>
  );
}

export const WordCloud: WidgetComponent = {
  type: 'word_cloud',
  Component: WordCloudInner as WidgetComponent['Component'],
};
