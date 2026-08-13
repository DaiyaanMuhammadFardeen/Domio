/**
 * @domio/join-web — CaptionsToggle.
 *
 * Per Wave 5 §S5.5 of docs/frontend-roadmap/05-wave-audience-participation.md.
 * Three-position toggle for the captions mode: captions only, audio
 * only, both. Calls `onChange` whenever the participant picks a
 * different mode.
 */

'use client';

import type { ReactElement } from 'react';
import type { CaptionsMode } from '@/runtime/captions/useCaptions';

export interface CaptionsToggleProps {
  readonly value: CaptionsMode;
  readonly onChange: (mode: CaptionsMode) => void;
  readonly dataTestId?: string;
}

const OPTIONS: readonly { mode: CaptionsMode; label: string }[] = [
  { mode: 'captions', label: 'Captions only' },
  { mode: 'audio', label: 'Audio only' },
  { mode: 'both', label: 'Both' },
];

export function CaptionsToggle({
  value,
  onChange,
  dataTestId = 'captions-toggle',
}: CaptionsToggleProps): ReactElement {
  return (
    <div
      data-testid={dataTestId}
      role="radiogroup"
      aria-label="Captions mode"
      className="inline-flex rounded border border-slate-300 overflow-hidden"
    >
      {OPTIONS.map((opt) => {
        const active = opt.mode === value;
        return (
          <button
            type="button"
            key={opt.mode}
            role="radio"
            aria-checked={active}
            onClick={() => onChange(opt.mode)}
            data-testid={`${dataTestId}-${opt.mode}`}
            className={
              active
                ? 'bg-blue-600 text-white px-3 py-1 text-sm'
                : 'bg-white text-slate-700 px-3 py-1 text-sm hover:bg-slate-50'
            }
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
