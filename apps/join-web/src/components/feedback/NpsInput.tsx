/**
 * NpsInput — 0-10 NPS scale with discrete buttons.
 *
 * Wave 5 §S5.6: post-session feedback. Renders 11 buttons labelled
 * 0..10. Clicking a button calls `onChange(n)`. The selected value
 * is rendered with the warning palette; the rest are slate.
 *
 * Comes bundled with a hidden range input so keyboard users can still
 * step the value via the arrow keys.
 */

'use client';

export interface NpsInputProps {
  readonly value: number | null;
  readonly onChange: (value: number) => void;
  readonly dataTestId?: string;
  readonly disabled?: boolean;
}

export function NpsInput(props: NpsInputProps) {
  const testId = props.dataTestId ?? 'nps-input';
  const values: readonly number[] = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  return (
    <div className="flex flex-col gap-2" data-testid={testId}>
      <div className="flex flex-wrap gap-1" role="radiogroup">
        {values.map((n) => {
          const selected = props.value === n;
          return (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={`${n} out of 10`}
              disabled={props.disabled === true}
              onClick={() => props.onChange(n)}
              className={
                'w-9 h-9 rounded text-sm font-medium border ' +
                (selected
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-slate-700 border-slate-300')
              }
              data-testid={`${testId}-btn-${n}`}
            >
              {n}
            </button>
          );
        })}
      </div>
      <input
        type="range"
        min={0}
        max={10}
        value={props.value ?? 0}
        onChange={(e) => props.onChange(Number(e.target.value))}
        disabled={props.disabled === true}
        className="w-full"
        aria-label="NPS slider"
        data-testid={`${testId}-range`}
      />
    </div>
  );
}
