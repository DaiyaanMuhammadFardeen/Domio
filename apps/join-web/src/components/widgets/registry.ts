/**
 * @domio/join-web — widget component registry.
 *
 * Each audience-widget kind is implemented as a leaf React component
 * (one file per kind under this directory). The registry maps the
 * descriptor `type` to that component so `WidgetRenderer` is a thin
 * shell that needs no per-kind branches.
 *
 * Solid O/C: adding a new widget kind is a single registry entry plus
 * a new file. `WidgetRenderer` itself is invariant.
 */

'use client';

import type { AudienceWidgetDescriptor } from '@domio/audience-service';
import type React from 'react';

type AnyWidgetProps = WidgetProps<Record<string, unknown>>;

/** Props every widget component receives. */
export interface WidgetProps<P = Record<string, unknown>> {
  readonly descriptor: AudienceWidgetDescriptor;
  readonly payload: P;
  readonly widgetId: string;
  /** Hook for sending submissions. The widget decides the payload shape. */
  readonly onSubmit: ((payload: Record<string, unknown>) => void) | undefined;
  readonly disabled: boolean;
  /** Last state snapshot for this widget, if any. */
  readonly state: unknown;
  /** Last error from the engine, if any. */
  readonly error: string | null;
}

/** A registry entry: a discriminator and the React component that renders it. */
export interface WidgetComponent {
  readonly type: AudienceWidgetDescriptor['type'];
  readonly Component: React.ComponentType<AnyWidgetProps>;
}

import { Poll } from './Poll';
import { WordCloud } from './WordCloud';
import { QA } from './QA';
import { Quiz } from './Quiz';
import { EmojiReaction } from './EmojiReaction';
import { NavVote } from './NavVote';
import { Sentiment } from './Sentiment';
import { RaiseHand } from './RaiseHand';

const ENTRIES: ReadonlyArray<WidgetComponent> = [
  Poll,
  WordCloud,
  QA,
  Quiz,
  EmojiReaction,
  NavVote,
  Sentiment,
  RaiseHand,
];

export const WIDGET_REGISTRY: ReadonlyMap<string, WidgetComponent> = (() => {
  const m = new Map<string, WidgetComponent>();
  for (const e of ENTRIES) {
    m.set(e.type, e);
  }
  return m;
})();

export function getWidget(type: string): WidgetComponent | undefined {
  return WIDGET_REGISTRY.get(type);
}

/** Number of widget kinds registered. Useful in tests/diagnostics. */
export const REGISTERED_WIDGET_KINDS: number = ENTRIES.length;
