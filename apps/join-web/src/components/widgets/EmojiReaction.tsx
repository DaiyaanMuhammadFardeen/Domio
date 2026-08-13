/**
 * @domio/join-web — Emoji reaction widget.
 *
 * Mobile-first: 6 large emoji buttons (min 44px). Tap fires
 * onSubmit({emoji}). When other participants react, floating
 * animations rise from the bottom of the row.
 */

'use client';

import { useEffect, useRef, useState } from 'react';
import type { WidgetComponent, WidgetProps } from './registry';
import { WidgetCard } from './WidgetCard';

const EMOJIS = ['👍', '❤️', '😂', '😮', '👏', '🎉'] as const;
type Emoji = (typeof EMOJIS)[number];

interface ReactionState {
  readonly reactions?: ReadonlyArray<{ emoji: Emoji | string; ts: number }>;
}

interface FloatingEmoji {
  readonly id: string;
  readonly emoji: Emoji | string;
  readonly left: number;
  readonly createdAt: number;
}

export function EmojiReactionInner(props: WidgetProps) {
  const [floats, setFloats] = useState<ReadonlyArray<FloatingEmoji>>([]);
  const lastTsRef = useRef<number>(0);

  const state = (props.state as ReactionState | null) ?? null;
  const reactions = state?.reactions ?? [];

  // Spawn a floating emoji for every new reaction in the stream.
  useEffect(() => {
    if (reactions.length === 0) return;
    const latest = reactions[reactions.length - 1];
    if (!latest) return;
    if (latest.ts <= lastTsRef.current) return;
    lastTsRef.current = latest.ts;
    const id = `${latest.ts}-${Math.random().toString(36).slice(2, 8)}`;
    const left = Math.floor(Math.random() * 80) + 10;
    setFloats((f) => [...f, { id, emoji: latest.emoji, left, createdAt: latest.ts }]);
    const cleanup = setTimeout(() => {
      setFloats((f) => f.filter((e) => e.id !== id));
    }, 2200);
    return () => clearTimeout(cleanup);
  }, [reactions]);

  const tap = (emoji: Emoji): void => {
    if (props.disabled) return;
    // Optimistic: spawn a local float so the user sees their own.
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setFloats((f) => [...f, { id, emoji, left: 50, createdAt: Date.now() }]);
    setTimeout(() => {
      setFloats((f) => f.filter((e) => e.id !== id));
    }, 2200);
    props.onSubmit?.({ emoji });
  };

  return (
    <WidgetCard label="React" testIdPrefix="reaction">
      <div className="relative h-32 overflow-hidden">
        <div className="absolute inset-x-0 bottom-0 flex justify-around" data-testid="reaction-row">
          {EMOJIS.map((e) => (
            <button
              key={e}
              type="button"
              className="min-w-[44px] min-h-[44px] text-3xl hover:scale-125 transition-transform disabled:opacity-50"
              disabled={props.disabled}
              onClick={() => tap(e)}
              data-testid={`reaction-${e}`}
            >
              {e}
            </button>
          ))}
        </div>
        {floats.map((f) => (
          <span
            key={f.id}
            className="absolute bottom-10 text-2xl pointer-events-none animate-[float_2s_ease-out_forwards]"
            style={{ left: `${f.left}%` }}
            data-testid={`reaction-float-${f.id}`}
          >
            {f.emoji}
          </span>
        ))}
      </div>
    </WidgetCard>
  );
}

export const EmojiReaction: WidgetComponent = {
  type: 'reaction',
  Component: EmojiReactionInner as WidgetComponent['Component'],
};
