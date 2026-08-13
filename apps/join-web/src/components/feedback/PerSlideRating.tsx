/**
 * PerSlideRating — thumbs up/down for each slide.
 *
 * Wave 5 §S5.6: post-session feedback. Render a list of slides and
 * let the audience record a per-slide rating: 1 (thumbs up), -1
 * (thumbs down), or 0 (no rating). Clicking the same thumb again
 * clears the rating.
 */

'use client';

export type PerSlideRatingValue = 1 | -1 | 0;

export interface PerSlideRatingProps {
  readonly ratings: Readonly<Record<string, PerSlideRatingValue>>;
  readonly onChange: (slideId: string, rating: PerSlideRatingValue) => void;
  readonly slides?: readonly { id: string; title: string }[];
  readonly dataTestId?: string;
  readonly disabled?: boolean;
}

const DEFAULT_SLIDES: readonly { id: string; title: string }[] = [
  { id: 'slide-1', title: 'Slide 1' },
  { id: 'slide-2', title: 'Slide 2' },
  { id: 'slide-3', title: 'Slide 3' },
];

export function PerSlideRating(props: PerSlideRatingProps) {
  const testId = props.dataTestId ?? 'per-slide-rating';
  const slides = props.slides ?? DEFAULT_SLIDES;
  return (
    <ul className="flex flex-col gap-2" data-testid={testId}>
      {slides.map((slide) => {
        const current = props.ratings[slide.id] ?? 0;
        return (
          <li
            key={slide.id}
            className="flex items-center justify-between gap-2 bg-white rounded border p-2"
            data-testid={`${testId}-row-${slide.id}`}
          >
            <span className="text-sm text-slate-700 truncate">{slide.title}</span>
            <div className="flex gap-1" role="radiogroup" aria-label={`Rating for ${slide.title}`}>
              <button
                type="button"
                role="radio"
                aria-checked={current === 1}
                disabled={props.disabled === true}
                onClick={() => props.onChange(slide.id, current === 1 ? 0 : 1)}
                className={
                  'px-2 py-1 rounded text-sm border ' +
                  (current === 1
                    ? 'bg-green-600 text-white border-green-600'
                    : 'bg-white text-slate-700 border-slate-300')
                }
                data-testid={`${testId}-up-${slide.id}`}
                aria-label="Thumbs up"
              >
                👍
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={current === -1}
                disabled={props.disabled === true}
                onClick={() => props.onChange(slide.id, current === -1 ? 0 : -1)}
                className={
                  'px-2 py-1 rounded text-sm border ' +
                  (current === -1
                    ? 'bg-red-600 text-white border-red-600'
                    : 'bg-white text-slate-700 border-slate-300')
                }
                data-testid={`${testId}-down-${slide.id}`}
                aria-label="Thumbs down"
              >
                👎
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
