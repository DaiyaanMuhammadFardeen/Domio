'use client';

/**
 * RecordingExportButton — post-recap recording export trigger.
 *
 * Per Wave 4 §S4.12 of docs/frontend-roadmap/04-wave-presenter-live.md.
 *
 * Mounted inside the RecapPage footer. Three states:
 *   - idle      → button to start the export
 *   - running   → progress bar
 *   - ready     → download link (and a "Start over" button)
 *   - failed    → error message + retry button
 *
 * Polls the recording-orchestrator while the job is queued/processing.
 * Errors are surfaced inline; never throw into the parent.
 */

import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react';
import { RecordingService, type ExportJob } from '../../lib/recording-service';

export type RecordingExportFormat = 'mp4' | 'webm';

export interface RecordingExportButtonProps {
  readonly sessionId: string;
  readonly apiBaseUrl?: string;
  readonly defaultFormat?: RecordingExportFormat;
  readonly defaultWatermark?: boolean;
  readonly onReady?: (job: ExportJob) => void;
  readonly dataTestId?: string;
}

type ExportState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'running'; readonly job: ExportJob }
  | { readonly kind: 'ready'; readonly job: ExportJob }
  | { readonly kind: 'failed'; readonly job: ExportJob; readonly message: string };

export function RecordingExportButton({
  sessionId,
  apiBaseUrl,
  defaultFormat = 'mp4',
  defaultWatermark = true,
  onReady,
  dataTestId = 'recording-export-button',
}: RecordingExportButtonProps): ReactElement {
  const [state, setState] = useState<ExportState>({ kind: 'idle' });
  const [format, setFormat] = useState<RecordingExportFormat>(defaultFormat);
  const [watermark, setWatermark] = useState<boolean>(defaultWatermark);
  const serviceRef = useRef<RecordingService | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  if (serviceRef.current === null) {
    serviceRef.current = new RecordingService({ apiBaseUrl });
  }

  // Cancel any in-flight polling when the component unmounts.
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const start = useCallback(async () => {
    if (!serviceRef.current) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const queued = await serviceRef.current.requestExport(sessionId, format, watermark);
      setState({ kind: 'running', job: queued });
      const finalJob = await serviceRef.current.waitForReady(queued.id, {
        signal: controller.signal,
      });
      if (finalJob.status === 'failed') {
        setState({
          kind: 'failed',
          job: finalJob,
          message: finalJob.errorMessage ?? 'The export job failed.',
        });
      } else {
        setState({ kind: 'ready', job: finalJob });
        onReady?.(finalJob);
      }
    } catch (e) {
      if (controller.signal.aborted) return;
      const err = e as { status?: number; message?: string };
      setState({
        kind: 'failed',
        // Synthesize a minimal job so the UI has a stable shape.
        job: {
          id: '',
          sessionId,
          format,
          watermark,
          status: 'failed',
          progressPct: 0,
          errorMessage: err.message ?? 'Unknown error',
        },
        message:
          err.status === 404
            ? 'Recording export service is not available.'
            : (err.message ?? 'Export failed'),
      });
    }
  }, [sessionId, format, watermark, onReady]);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setState({ kind: 'idle' });
  }, []);

  return (
    <div
      data-testid={dataTestId}
      data-state={state.kind}
      style={{
        border: '1px solid var(--border-subtle)',
        borderRadius: 8,
        padding: 12,
        background: 'var(--surface-base)',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <strong style={{ fontSize: 13 }}>Recording export</strong>
        <span style={{ fontSize: 10, color: 'var(--content-secondary)' }}>
          {state.kind === 'idle' && 'Ready to export'}
          {state.kind === 'running' && `Processing ${state.job.progressPct}%`}
          {state.kind === 'ready' && 'Ready'}
          {state.kind === 'failed' && 'Failed'}
        </span>
      </header>

      {state.kind === 'idle' && (
        <>
          <div
            style={{
              display: 'flex',
              gap: 8,
              alignItems: 'center',
              fontSize: 11,
              color: 'var(--content-secondary)',
            }}
          >
            <label>
              Format
              <select
                value={format}
                onChange={(e) => setFormat(e.target.value as RecordingExportFormat)}
                data-testid={`${dataTestId}-format`}
                style={{
                  marginLeft: 4,
                  padding: '2px 4px',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 3,
                  background: 'var(--surface-raised)',
                  color: 'var(--content-primary)',
                  fontSize: 11,
                }}
              >
                <option value="mp4">mp4</option>
                <option value="webm">webm</option>
              </select>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <input
                type="checkbox"
                checked={watermark}
                onChange={(e) => setWatermark(e.target.checked)}
                data-testid={`${dataTestId}-watermark`}
              />
              Watermark
            </label>
          </div>
          <button
            type="button"
            onClick={start}
            data-testid={`${dataTestId}-start`}
            style={{
              padding: '8px 12px',
              border: 'none',
              borderRadius: 6,
              background: 'var(--info)',
              color: 'var(--content-inverse)',
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            Export recording
          </button>
        </>
      )}

      {state.kind === 'running' && (
        <div
          aria-hidden
          data-testid={`${dataTestId}-progress`}
          style={{
            height: 6,
            background: 'var(--surface-raised)',
            borderRadius: 3,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              width: `${state.job.progressPct}%`,
              height: '100%',
              background: 'var(--info)',
              transition: 'width 200ms linear',
            }}
          />
        </div>
      )}

      {state.kind === 'ready' && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {state.job.downloadUrl && (
            <a
              href={state.job.downloadUrl}
              download
              data-testid={`${dataTestId}-download`}
              style={{
                padding: '8px 12px',
                border: '1px solid var(--success)',
                borderRadius: 6,
                background: 'var(--success)',
                color: 'var(--content-inverse)',
                textDecoration: 'none',
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              Download {state.job.format.toUpperCase()}
            </a>
          )}
          <button type="button" onClick={reset} data-testid={`${dataTestId}-reset`} style={pillBtn}>
            Export another
          </button>
        </div>
      )}

      {state.kind === 'failed' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <p
            role="alert"
            data-testid={`${dataTestId}-error`}
            style={{ fontSize: 11, color: 'var(--danger)', margin: 0 }}
          >
            {state.message}
          </p>
          <button type="button" onClick={reset} data-testid={`${dataTestId}-retry`} style={pillBtn}>
            Try again
          </button>
        </div>
      )}
    </div>
  );
}

const pillBtn: React.CSSProperties = {
  padding: '6px 10px',
  border: '1px solid var(--border-subtle)',
  borderRadius: 4,
  background: 'var(--surface-raised)',
  color: 'var(--content-primary)',
  cursor: 'pointer',
  fontSize: 11,
  fontWeight: 600,
};
