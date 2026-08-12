/**
 * ExportProgressTracker — live progress + download link for an export job.
 *
 * Per Wave 3 §S3.8 of docs/frontend-roadmap/03-wave-viewer-publishing.md.
 *
 * Subscribes to job status (poll-based bootstrap; swap to SSE/WebSocket
 * in the production wiring). Shows a percent bar, the remaining slide
 * count, and a download link when the job completes.
 */

'use client';

import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react';
import { FormattedMessage } from '@domio/ui';

export interface ExportJob {
  readonly id: string;
  readonly deckId: string;
  readonly format: 'mp4' | 'pdf' | 'pptx' | 'html';
  readonly status: 'queued' | 'running' | 'done' | 'failed';
  /** 0..100 — undefined when unknown. */
  readonly percent?: number;
  /** Slides still to render. */
  readonly remainingSlides?: number;
  readonly downloadUrl?: string;
  readonly createdAtMs: number;
  readonly error?: string;
}

export interface ExportProgressEvent {
  readonly job: ExportJob;
}

export interface ExportProgressTrackerProps {
  readonly job: ExportJob;
  /** Called repeatedly to fetch the next status. Returning the same shape as `job`. */
  readonly onPoll?: ((jobId: string) => Promise<ExportProgressEvent>) | undefined;
  /** Notified when the job reaches a terminal state. */
  readonly onComplete?: ((job: ExportJob) => void) | undefined;
  /** Notified on every progress update (including completion). */
  readonly onProgress?: ((event: ExportProgressEvent) => void) | undefined;
  readonly dataTestId?: string;
}

const POLL_MS = 1500;

export function ExportProgressTracker({
  job,
  onPoll,
  onComplete,
  onProgress,
  dataTestId = 'export-progress-tracker',
}: ExportProgressTrackerProps): ReactElement {
  const [latest, setLatest] = useState<ExportJob>(job);
  const stoppedRef = useRef(false);

  useEffect(() => {
    stoppedRef.current = false;
    setLatest(job);
    return () => {
      stoppedRef.current = true;
    };
  }, [job]);

  const tick = useCallback(async () => {
    if (stoppedRef.current || !onPoll) return;
    if (latest.status === 'done' || latest.status === 'failed') return;
    try {
      const event = await onPoll(latest.id);
      if (stoppedRef.current) return;
      setLatest(event.job);
      onProgress?.(event);
      if (event.job.status === 'done' || event.job.status === 'failed') {
        onComplete?.(event.job);
      }
    } catch {
      // swallow — keep polling
    }
  }, [latest, onPoll, onProgress, onComplete]);

  useEffect(() => {
    if (latest.status === 'done' || latest.status === 'failed') return;
    if (!onPoll) return;
    const handle = setInterval(() => void tick(), POLL_MS);
    return () => clearInterval(handle);
  }, [latest.status, onPoll, tick]);

  const pct = latest.percent ?? (latest.status === 'done' ? 100 : 0);

  return (
    <section data-testid={dataTestId} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <strong>
          <FormattedMessage id="editor.share.export.progress" />
        </strong>
        <span
          data-testid={`${dataTestId}-status`}
          style={{
            fontSize: 11,
            color:
              latest.status === 'failed'
                ? '#dc2626'
                : latest.status === 'done'
                  ? '#059669'
                  : 'rgba(0,0,0,0.6)',
            textTransform: 'uppercase',
          }}
        >
          {latest.status}
        </span>
      </header>
      <div
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        data-testid={`${dataTestId}-bar`}
        style={{
          width: '100%',
          height: 8,
          borderRadius: 4,
          background: 'rgba(0,0,0,0.08)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: '100%',
            background: latest.status === 'failed' ? '#dc2626' : '#3b82f6',
            transition: 'width 200ms ease',
          }}
        />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'rgba(0,0,0,0.6)' }}>
        <span data-testid={`${dataTestId}-percent`}>{pct}%</span>
        {typeof latest.remainingSlides === 'number' ? (
          <span data-testid={`${dataTestId}-remaining`}>
            <FormattedMessage
              id="editor.share.export.remaining"
              values={{ remaining: latest.remainingSlides }}
            />
          </span>
        ) : null}
      </div>
      {latest.status === 'failed' && latest.error ? (
        <div role="alert" style={{ fontSize: 12, color: '#dc2626' }}>
          {latest.error}
        </div>
      ) : null}
      {latest.status === 'done' && latest.downloadUrl ? (
        <a
          href={latest.downloadUrl}
          download
          data-testid={`${dataTestId}-download`}
          style={{
            padding: '6px 12px',
            border: 'none',
            borderRadius: 4,
            background: '#059669',
            color: '#fff',
            textDecoration: 'none',
            textAlign: 'center',
            fontSize: 13,
          }}
        >
          <FormattedMessage id="editor.share.export.download" />
        </a>
      ) : null}
    </section>
  );
}
