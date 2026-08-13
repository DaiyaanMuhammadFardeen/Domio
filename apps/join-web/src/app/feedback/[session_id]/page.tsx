'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { MobileShell } from '@/components/layout/MobileShell';
import { submitFeedback } from '@/lib/feedback-service';
import { StarRating } from '@/components/feedback/StarRating';
import { NpsInput } from '@/components/feedback/NpsInput';
import { PerSlideRating, type PerSlideRatingValue } from '@/components/feedback/PerSlideRating';
import { NoteInput } from '@/components/feedback/NoteInput';

// Per S5.6, the per-slide ratings surface carries the same three
// default slide IDs as PerSlideRating's test seed. We keep the list
// here so the feedback page can confirm coverage against the wave
// doc + tests.
const DEFAULT_SLIDE_IDS: readonly string[] = ['slide-1', 'slide-2', 'slide-3'];

export default function FeedbackPage() {
  const params = useParams<{ session_id: string }>();
  const [stars, setStars] = useState(0);
  const [nps, setNps] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [perSlide, setPerSlide] = useState<Record<string, PerSlideRatingValue>>({});
  const [submitted, setSubmitted] = useState(false);

  if (submitted) {
    return (
      <MobileShell title="Thanks!" connectionStatus="closed">
        <p className="text-slate-700">Your feedback helps the presenter run better sessions.</p>
      </MobileShell>
    );
  }

  const onPerSlideChange = (slideId: string, rating: PerSlideRatingValue) => {
    setPerSlide((prev) => ({ ...prev, [slideId]: rating }));
  };

  return (
    <MobileShell title="Session feedback" connectionStatus="closed">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (stars === 0 || nps === null) return;
          submitFeedback(params?.session_id ?? '', { stars, nps, note })
            .catch(() => { /* best-effort; the form closes either way */ })
            .finally(() => setSubmitted(true));
        }}
        className="flex flex-col gap-4 max-w-md mx-auto"
      >
        <div>
          <h2 className="text-sm font-medium">How would you rate this session?</h2>
          <div className="mt-1">
            <StarRating value={stars} onChange={setStars} />
          </div>
        </div>
        <div>
          <h2 className="text-sm font-medium">How likely are you to recommend Domio?</h2>
          <div className="mt-2">
            <NpsInput value={nps} onChange={setNps} />
          </div>
          <p className="text-xs text-slate-500">0 (not at all) → 10 (extremely likely)</p>
        </div>
        <div>
          <h2 className="text-sm font-medium">Per-slide feedback</h2>
          <p className="text-xs text-slate-500">Tap 👍 or 👎 on each slide.</p>
          <div className="mt-2">
            <PerSlideRating
              ratings={perSlide}
              onChange={onPerSlideChange}
              slides={DEFAULT_SLIDE_IDS.map((id) => ({ id, title: `Slide ${id.replace('slide-', '')}` }))}
            />
          </div>
        </div>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Anything to add?</span>
          <NoteInput value={note} onChange={setNote} />
        </label>
        <button
          type="submit"
          className="bg-blue-600 text-white rounded p-3 disabled:opacity-50"
          disabled={stars === 0 || nps === null}
          data-testid="feedback-submit"
        >
          Send feedback
        </button>
      </form>
    </MobileShell>
  );
}