'use client';

/**
 * ResumeFromPhone — phone-side prompt to claim a dropped session.
 *
 * Per Wave 4 §S4.8 of docs/frontend-roadmap/04-wave-presenter-live.md.
 *
 * Mounted on `/pair/[token]` once the phone detects (via realtime
 * heartbeat) that the presenter's laptop has dropped. Offers a single
 * big "Resume from here" button that POSTs to the failover endpoint
 * to claim ownership and continue the session from the same slide.
 */

import { useCallback, useState, type ReactElement } from 'react';
import { FailoverService } from '../../lib/failover-resume-service';

export interface ResumeFromPhoneProps {
  readonly token: string;
  readonly slideId: string;
  readonly slideIndex: number;
  readonly apiBaseUrl?: string;
  readonly onResumed?: () => void;
  readonly dataTestId?: string;
}

export function ResumeFromPhone({
  token,
  slideId,
  slideIndex,
  apiBaseUrl,
  onResumed,
  dataTestId = 'resume-from-phone',
}: ResumeFromPhoneProps): ReactElement {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const service = new FailoverService(apiBaseUrl !== undefined ? { apiBaseUrl } : {});

  const handleResume = useCallback(async () => {
    setSubmitting(true);
    setError(null);
    try {
      await service.resume(token, slideId, slideIndex);
      onResumed?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Resume failed');
    } finally {
      setSubmitting(false);
    }
  }, [service, token, slideId, slideIndex, onResumed]);

  return (
    <section
      data-testid={dataTestId}
      style={{
        border: '1px solid var(--border-subtle)',
        borderRadius: 12,
        padding: 16,
        background: 'var(--surface-base)',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        textAlign: 'center',
      }}
    >
      <div style={{ fontSize: 14, fontWeight: 600 }}>📱 Present from this phone?</div>
      <p style={{ fontSize: 12, color: 'var(--content-secondary)', margin: 0 }}>
        Your laptop disconnected. Tap below to continue the session from this phone at slide{' '}
        {slideIndex + 1}.
      </p>
      <button
        type="button"
        onClick={handleResume}
        disabled={submitting}
        data-testid={`${dataTestId}-button`}
        style={{
          padding: '14px 20px',
          border: '1px solid var(--success)',
          borderRadius: 8,
          background: 'var(--success)',
          color: 'var(--content-inverse)',
          fontSize: 15,
          fontWeight: 700,
          cursor: submitting ? 'wait' : 'pointer',
        }}
      >
        {submitting ? 'Resuming…' : 'Resume from here'}
      </button>
      {error && (
        <p
          role="alert"
          data-testid={`${dataTestId}-error`}
          style={{ fontSize: 11, color: 'var(--danger)', margin: 0 }}
        >
          {error}
        </p>
      )}
    </section>
  );
}
