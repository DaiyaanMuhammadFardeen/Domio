/**
 * AnonymousModeToggle — switch that turns anonymous mode on/off.
 *
 * Per Wave 5 §S5.10 of docs/frontend-roadmap/05-wave-audience-participation.md.
 *
 * When enabled, the participant is identified by a randomly assigned
 * 2-word handle (`generateHandle()` from `runtime/anonymous`); the
 * engagement score is still tracked but is not tied to identity.
 *
 *   <AnonymousModeToggle
 *     enabled={anon}
 *     onChange={setAnon}
 *     handle={anon ? handle : null}
 *   />
 */

import { useCallback, type ReactElement } from 'react';
import { generateHandle } from '@/runtime/anonymous';

export interface AnonymousModeToggleProps {
  readonly enabled: boolean;
  readonly onChange: (next: boolean, handle: string | null) => void;
  readonly handle: string | null;
}

export function AnonymousModeToggle({
  enabled,
  onChange,
  handle,
}: AnonymousModeToggleProps): ReactElement {
  const toggle = useCallback(() => {
    const next = !enabled;
    onChange(next, next ? generateHandle() : null);
  }, [enabled, onChange]);

  return (
    <div
      className="flex items-center gap-3 p-3 rounded border bg-white"
      data-testid="anonymous-mode-toggle"
      data-enabled={enabled}
    >
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        onClick={toggle}
        className={`px-3 py-1 rounded text-sm font-medium ${
          enabled ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-700'
        }`}
        data-testid="anonymous-mode-switch"
      >
        {enabled ? 'Anonymous' : 'Go anonymous'}
      </button>
      <div className="flex-1 text-sm">
        <p className="font-medium">Anonymous mode</p>
        <p className="text-slate-600">
          {enabled && handle
            ? `You're joining as ${handle}.`
            : 'Show your display name to the presenter.'}
        </p>
      </div>
    </div>
  );
}
