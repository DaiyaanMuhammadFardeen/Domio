/**
 * StarRating — 5-star widget.
 *
 * Wave 5 §S5.6: post-session feedback. Controlled; requires a `value`
 * (clamped 0..5) and an `onChange` callback. Filled stars render
 * in warning/300 (Tailwind's default yellow palette) and empty
 * stars in slate/300.
 */

'use client';

export interface StarRatingProps {
  readonly value: number;
  readonly onChange: (value: number) => void;
  readonly dataTestId?: string;
  readonly disabled?: boolean;
}

export function StarRating(props: StarRatingProps) {
  const testId = props.dataTestId ?? 'star-rating';
  const clamped = Math.max(0, Math.min(5, Math.round(props.value)));
  const stars: readonly number[] = [1, 2, 3, 4, 5];
  return (
    <div
      className="flex gap-1 text-3xl"
      role="radiogroup"
      data-testid={testId}
    >
      {stars.map((n) => {
        const filled = n <= clamped;
        const label = `${n} stars`;
        return (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={clamped === n}
            aria-label={label}
            disabled={props.disabled === true}
            onClick={() => props.onChange(n)}
            className={filled ? 'text-yellow-500' : 'text-slate-300'}
            data-testid={`${testId}-star-${n}`}
          >
            ★
          </button>
        );
      })}
    </div>
  );
}