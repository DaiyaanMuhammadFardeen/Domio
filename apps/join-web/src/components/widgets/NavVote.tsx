/**
 * @domio/join-web — Navigation vote widget.
 *
 * Mobile-first: prev / next / skip buttons with descriptive labels.
 * Defaults to { prev, next, skip } when no targets are specified.
 */

'use client';

import { useState } from 'react';
import type { WidgetComponent, WidgetProps } from './registry';
import { WidgetCard } from './WidgetCard';

interface NavVotePayload {
  readonly targets?: ReadonlyArray<string>;
  readonly prompt?: string;
}

const LABELS: Record<string, string> = {
  prev: 'Previous',
  back: 'Previous',
  next: 'Next',
  forward: 'Forward',
  skip: 'Skip',
  pause: 'Pause',
  resume: 'Resume',
};

const DEFAULT_TARGETS = ['prev', 'next', 'skip'] as const;

function labelFor(target: string): string {
  return LABELS[target.toLowerCase()] ?? target;
}

export function NavVoteInner(props: WidgetProps<NavVotePayload>) {
  const targets = Array.isArray(props.payload.targets) && props.payload.targets.length > 0
    ? props.payload.targets
    : DEFAULT_TARGETS;
  const [pick, setPick] = useState<string | null>(null);

  const handle = (target: string): void => {
    if (props.disabled || pick !== null) return;
    setPick(target);
    props.onSubmit?.({ target });
  };

  return (
    <WidgetCard label="Where to next?" testIdPrefix="nav">
      {props.payload.prompt ? (
        <p className="text-sm text-slate-700 mb-2" data-testid="nav-prompt">
          {props.payload.prompt}
        </p>
      ) : null}
      <div className="flex gap-2">
        {targets.map((t) => (
          <button
            key={t}
            type="button"
            className="flex-1 min-h-[44px] p-3 rounded border bg-white hover:bg-blue-50 disabled:opacity-50"
            disabled={props.disabled || pick !== null}
            onClick={() => handle(t)}
            data-testid={`nav-${t}`}
          >
            {labelFor(t)}
          </button>
        ))}
      </div>
    </WidgetCard>
  );
}

export const NavVote: WidgetComponent = {
  type: 'nav_vote',
  Component: NavVoteInner as WidgetComponent['Component'],
};