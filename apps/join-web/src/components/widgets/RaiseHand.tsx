/**
 * @domio/join-web — Raise Hand widget.
 *
 * Mobile-first: single toggle button that flips between raised and
 * lowered. Shows the participant's queue position (1-based) when
 * the engine reports it.
 */

'use client';

import { useState } from 'react';
import type { WidgetComponent, WidgetProps } from './registry';
import { WidgetCard } from './WidgetCard';

interface RaiseHandState {
  readonly position?: number;
  readonly queue_length?: number;
}

export function RaiseHandInner(props: WidgetProps) {
  const [raised, setRaised] = useState<boolean>(false);
  const state = (props.state as RaiseHandState | null) ?? null;

  const toggle = (): void => {
    if (props.disabled) return;
    const next = !raised;
    setRaised(next);
    props.onSubmit?.({ raised: next });
  };

  return (
    <WidgetCard label="Raise hand" testIdPrefix="raise-hand">
      <button
        type="button"
        className={
          'w-full min-h-[44px] p-4 rounded border disabled:opacity-50 ' +
          (raised ? 'bg-yellow-200 hover:bg-yellow-300' : 'bg-yellow-50 hover:bg-yellow-100')
        }
        disabled={props.disabled}
        onClick={toggle}
        data-testid="raise-hand-toggle"
      >
        ✋ {raised ? 'Lower hand' : 'I have something to say'}
      </button>
      <div className="mt-2 text-sm text-slate-700" data-testid="raise-hand-status">
        {raised
          ? state?.position !== undefined
            ? `You are #${state.position} in the queue` +
              (state.queue_length !== undefined ? ` of ${state.queue_length}` : '')
            : 'Hand raised'
          : 'Hand lowered'}
      </div>
    </WidgetCard>
  );
}

export const RaiseHand: WidgetComponent = {
  type: 'raise_hand',
  Component: RaiseHandInner as WidgetComponent['Component'],
};