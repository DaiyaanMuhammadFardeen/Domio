'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { MobileShell } from '@/components/layout/MobileShell';

export default function FeedbackPage() {
  const params = useParams<{ session_id: string }>();
  const [stars, setStars] = useState(0);
  const [nps, setNps] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [submitted, setSubmitted] = useState(false);

  if (submitted) {
    return (
      <MobileShell title="Thanks!" connectionStatus="closed">
        <p className="text-slate-700">Your feedback helps the presenter run better sessions.</p>
      </MobileShell>
    );
  }

  return (
    <MobileShell title="Session feedback" connectionStatus="closed">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (stars === 0 || nps === null) return;
          fetch(`/api/feedback/${encodeURIComponent(params?.session_id ?? '')}`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ stars, nps, note }),
          }).finally(() => setSubmitted(true));
        }}
        className="flex flex-col gap-4 max-w-md mx-auto"
      >
        <div>
          <h2 className="text-sm font-medium">How would you rate this session?</h2>
          <div className="flex gap-1 text-3xl mt-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                aria-label={`${n} stars`}
                onClick={() => setStars(n)}
                className={n <= stars ? 'text-yellow-500' : 'text-slate-300'}
                data-testid={`stars-${n}`}
              >
                ★
              </button>
            ))}
          </div>
        </div>
        <div>
          <h2 className="text-sm font-medium">How likely are you to recommend Domio?</h2>
          <input
            type="range"
            min={0}
            max={10}
            value={nps ?? 5}
            onChange={(e) => setNps(Number(e.target.value))}
            className="w-full mt-2"
            data-testid="nps-input"
          />
          <p className="text-xs text-slate-500">0 (not at all) → 10 (extremely likely)</p>
        </div>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Anything to add?</span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={500}
            rows={4}
            className="border rounded p-2"
            data-testid="feedback-note"
          />
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