/**
 * NoteInput — textarea with a hard-length cap.
 *
 * Wave 5 §S5.6: post-session feedback. We default to 500 characters
 * because Wave 1 §S1.2 set that as the storage limit. Callers can
 * override via `maxLength`. Pasted / typed content > maxLength is
 * rejected (the `onChange` callback is not invoked with the new
 * value).
 */

'use client';

import { useState } from 'react';

export interface NoteInputProps {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly maxLength?: number;
  readonly placeholder?: string;
  readonly dataTestId?: string;
  readonly disabled?: boolean;
}

export function NoteInput(props: NoteInputProps) {
  const cap = props.maxLength ?? 500;
  const testId = props.dataTestId ?? 'note-input';
  const [rejected, setRejected] = useState(false);

  return (
    <div className="flex flex-col gap-1">
      <textarea
        value={props.value}
        rows={4}
        disabled={props.disabled === true}
        placeholder={props.placeholder}
        onChange={(e) => {
          const next = e.target.value;
          if (next.length > cap) {
            setRejected(true);
            return;
          }
          setRejected(false);
          props.onChange(next);
        }}
        className="border rounded p-2 disabled:opacity-50"
        data-testid={testId}
      />
      <div className="flex items-center justify-between text-xs text-slate-500">
        <span data-testid={`${testId}-count`}>
          {props.value.length} / {cap}
        </span>
        {rejected ? (
          <span className="text-red-700" data-testid={`${testId}-rejected`} role="alert">
            Input capped at {cap} characters.
          </span>
        ) : null}
      </div>
    </div>
  );
}