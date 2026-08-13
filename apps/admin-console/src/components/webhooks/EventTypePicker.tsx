/**
 * EventTypePicker — small dropdown for selecting a webhook event.
 *
 * Per Wave 10 §S10.2. Shows a curated set of common Domio events plus a
 * freeform option that reveals a text input. Used by the subscribe
 * form and the webhook tester.
 */

'use client';

import { useId } from 'react';

export const COMMON_EVENT_TYPES: ReadonlyArray<string> = [
  'deck.viewed',
  'deck.shared',
  'comment.added',
  'approval.granted',
  'data.updated',
  'share.created',
  'share.expired',
];

const FREEFORM = '__freeform__';

interface EventTypePickerProps {
  readonly value: string;
  readonly onChange: (event: string) => void;
  readonly id?: string;
  readonly label?: string;
  readonly testid?: string;
}

export function EventTypePicker({ value, onChange, id, label, testid }: EventTypePickerProps) {
  const auto = useId();
  const selectId = id ?? `event-type-${auto}`;
  const freeformId = `event-type-freeform-${auto}`;

  const isKnown = COMMON_EVENT_TYPES.includes(value);
  const selectValue = isKnown ? value : FREEFORM;

  return (
    <div className="space-y-1">
      {label !== undefined && (
        <span className="block text-xs font-medium uppercase tracking-wide text-slate-500">
          {label}
        </span>
      )}
      <select
        id={selectId}
        value={selectValue}
        onChange={(e) => {
          const next = e.target.value;
          if (next === FREEFORM) {
            onChange(value && !isKnown ? value : '');
          } else {
            onChange(next);
          }
        }}
        data-testid={testid ?? 'webhooks-event-picker'}
        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm transition focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
      >
        {COMMON_EVENT_TYPES.map((evt) => (
          <option key={evt} value={evt}>
            {evt}
          </option>
        ))}
        <option value={FREEFORM}>Custom event…</option>
      </select>
      {selectValue === FREEFORM && (
        <input
          id={freeformId}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="custom.event.name"
          data-testid="webhooks-event-freeform"
          className="w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-xs transition focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
        />
      )}
    </div>
  );
}
