/**
 * @domio/join-web — join form.
 *
 * Phase 16 W1. Mobile-first form to capture a session code (or take
 * from URL) and a display name. Routes to /j/[code] on submit.
 */

'use client';

import { useState } from 'react';

export interface JoinFormProps {
  readonly initialCode?: string;
  readonly onSubmit: (code: string, displayName: string) => void;
  readonly busy?: boolean;
  readonly error?: string | null;
}

export function JoinForm(props: JoinFormProps) {
  const [code, setCode] = useState(props.initialCode ?? '');
  const [displayName, setDisplayName] = useState('');
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (code.trim().length >= 5 && displayName.trim().length > 0) {
          props.onSubmit(code.trim().toUpperCase(), displayName.trim());
        }
      }}
      className="flex flex-col gap-4 p-4 max-w-md w-full mx-auto"
    >
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">Session code</span>
        <input
          name="code"
          inputMode="text"
          autoComplete="off"
          autoCapitalize="characters"
          className="border rounded p-3 text-2xl tracking-widest text-center font-mono"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="ABCD-1234"
          data-testid="join-code"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">Display name</span>
        <input
          name="display_name"
          inputMode="text"
          autoComplete="nickname"
          className="border rounded p-3"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="How others see you"
          data-testid="join-display-name"
        />
      </label>
      {props.error ? (
        <p className="text-red-700 text-sm" role="alert">{props.error}</p>
      ) : null}
      <button
        type="submit"
        className="bg-blue-600 text-white rounded p-4 text-lg font-medium disabled:opacity-50"
        disabled={props.busy || code.trim().length < 5 || displayName.trim().length === 0}
        data-testid="join-submit"
      >
        {props.busy ? 'Joining…' : 'Join'}
      </button>
    </form>
  );
}