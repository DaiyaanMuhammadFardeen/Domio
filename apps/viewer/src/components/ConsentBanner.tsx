'use client';

/**
 * ConsentBanner — Phase 10 M5.3.
 *
 * Three-tier consent UI surfaced on first viewer load:
 *
 *   - `opt_in`    — the user explicitly opts in. PII-bearing events
 *                   (form_submit, calculator_change) are stored verbatim
 *                   against the subjectId.
 *   - `opt_out`   — the user prefers not to be tracked. The recorder
 *                   stays silent; no telemetry leaves the viewer.
 *   - `anonymous` — the user wants aggregated UX signal without being
 *                   identified. Events are stored under an anonymous
 *                   bucket; form/calculator values are dropped.
 *
 * The chosen tier is persisted under `domio.viewer.consent` so reloads
 * don't re-prompt. The banner is dismissed via the dismiss button or by
 * picking a tier.
 */

import { useEffect, useMemo, useState } from 'react';
import type { ReactElement } from 'react';

export type ConsentTier = 'opt_in' | 'opt_out' | 'anonymous';

export interface ConsentBannerProps {
  readonly defaultTier?: ConsentTier;
  readonly subjectId?: string;
  readonly onChange: (tier: ConsentTier) => void;
  readonly onDismiss?: (tier: ConsentTier) => void;
  readonly storageKey?: string;
}

const STORAGE_KEY_DEFAULT = 'domio.viewer.consent';

const TIER_COPY: Record<ConsentTier, { heading: string; body: string }> = {
  opt_in: {
    heading: 'Share your full session',
    body: 'We will record click trails, slide visits, and form input so editors can replay your experience.',
  },
  opt_out: {
    heading: 'Skip recording',
    body: 'No telemetry is captured. You can change this from the privacy menu.',
  },
  anonymous: {
    heading: 'Anonymous analytics only',
    body: 'Click heatmaps and slide flow are captured, but form values are dropped and your identity is not stored.',
  },
};

export function ConsentBanner({
  defaultTier,
  subjectId,
  onChange,
  onDismiss,
  storageKey = STORAGE_KEY_DEFAULT,
}: ConsentBannerProps): ReactElement | null {
  const [tier, setTier] = useState<ConsentTier>(defaultTier ?? 'opt_out');
  const [acknowledged, setAcknowledged] = useState<boolean>(false);

  useEffect(() => {
    if (typeof localStorage === 'undefined') return;
    const stored = localStorage.getItem(storageKey);
    if (stored === 'opt_in' || stored === 'opt_out' || stored === 'anonymous') {
      setTier(stored);
      setAcknowledged(true);
    }
  }, [storageKey]);

  useEffect(() => {
    if (acknowledged) onChange(tier);
  }, [acknowledged, tier, onChange]);

  const copy = useMemo(() => TIER_COPY[tier], [tier]);

  const handlePick = (next: ConsentTier) => {
    setTier(next);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(storageKey, next);
    }
    setAcknowledged(true);
    onChange(next);
  };

  const handleDismiss = () => {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(storageKey, tier);
    }
    setAcknowledged(true);
    onDismiss?.(tier);
  };

  if (acknowledged) return null;

  return (
    <section className="consent-banner" data-testid="consent-banner">
      <header className="consent-banner__header">
        <h2>How would you like to participate?</h2>
        {subjectId ? <p data-testid="consent-subject">Subject: {subjectId}</p> : null}
      </header>
      <fieldset className="consent-banner__tiers" data-testid="consent-tiers">
        <legend className="sr-only">Choose a consent tier</legend>
        {(['opt_in', 'opt_out', 'anonymous'] as ConsentTier[]).map((t) => {
          const c = TIER_COPY[t];
          return (
            <label
              key={t}
              className={`consent-banner__option${tier === t ? ' is-active' : ''}`}
              data-testid={`consent-option-${t}`}
            >
              <input
                type="radio"
                name="consent"
                value={t}
                data-testid={`consent-radio-${t}`}
                checked={tier === t}
                onChange={() => setTier(t)}
              />
              <strong>{c.heading}</strong>
              <span>{c.body}</span>
            </label>
          );
        })}
      </fieldset>
      <div className="consent-banner__actions">
        <button type="button" data-testid="consent-confirm" onClick={() => handlePick(tier)}>
          {`Confirm (${tier})`}
        </button>
        <button type="button" data-testid="consent-dismiss" onClick={handleDismiss}>
          Dismiss
        </button>
      </div>
      <p className="consent-banner__summary" data-testid="consent-summary">
        Selected: <strong>{copy.heading}</strong>
      </p>
    </section>
  );
}

export default ConsentBanner;
