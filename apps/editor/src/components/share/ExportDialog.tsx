/**
 * ExportDialog — editor top-bar export dialog (MP4/PDF/PPTX/HTML).
 *
 * Per Wave 3 §S3.8 of docs/frontend-roadmap/03-wave-viewer-publishing.md.
 *
 * Editors pick a format, quality, and slide range, then queue the job
 * via `POST /v1/export`. While the job runs, `ExportProgressTracker`
 * subscribes to job status updates (we use a polling stub for the
 * bootstrap; a real implementation would swap to SSE/WebSocket).
 *
 * State is owned by the parent; this dialog is purely presentational.
 */

'use client';

import { useCallback, useEffect, useMemo, useState, type ReactElement } from 'react';
import { FormattedMessage } from '@domio/ui';
import {
  ExportProgressTracker,
  type ExportJob,
  type ExportProgressEvent,
} from './ExportProgressTracker';

export type ExportFormat = 'mp4' | 'pdf' | 'pptx' | 'html';
export type ExportQuality = 'draft' | 'standard' | 'high' | 'lossless';

export interface ExportRange {
  /** 0-based, inclusive. */
  readonly fromIdx: number;
  /** 0-based, inclusive. */
  readonly toIdx: number;
}

export interface ExportDialogProps {
  readonly deckId: string;
  readonly deckTitle: string;
  readonly slideCount: number;
  readonly open: boolean;
  readonly onClose: () => void;
  /** Called when the user confirms an export — the parent owns the queue call. */
  readonly onQueue?: (req: {
    deckId: string;
    format: ExportFormat;
    quality: ExportQuality;
    range: ExportRange;
  }) => Promise<ExportJob> | ExportJob;
  /** Called when the dialog polls for updates after a job is queued. */
  readonly onPoll?: (jobId: string) => Promise<ExportProgressEvent>;
  readonly dataTestId?: string;
}

const FORMAT_LABEL_IDS: Readonly<Record<ExportFormat, string>> = {
  mp4: 'editor.share.export.format.mp4',
  pdf: 'editor.share.export.format.pdf',
  pptx: 'editor.share.export.format.pptx',
  html: 'editor.share.export.format.html',
};

const QUALITY_LABEL_IDS: Readonly<Record<ExportQuality, string>> = {
  draft: 'editor.share.export.quality.draft',
  standard: 'editor.share.export.quality.standard',
  high: 'editor.share.export.quality.high',
  lossless: 'editor.share.export.quality.lossless',
};

const FORMAT_DEFAULTS: Readonly<Record<ExportFormat, ExportQuality>> = {
  mp4: 'standard',
  pdf: 'high',
  pptx: 'standard',
  html: 'lossless',
};

export function ExportDialog({
  deckId,
  deckTitle,
  slideCount,
  open,
  onClose,
  onQueue,
  onPoll,
  dataTestId = 'export-dialog',
}: ExportDialogProps): ReactElement | null {
  const [format, setFormat] = useState<ExportFormat>('pdf');
  const [quality, setQuality] = useState<ExportQuality>(FORMAT_DEFAULTS.pdf);
  const [range, setRange] = useState<ExportRange>({ fromIdx: 0, toIdx: Math.max(0, slideCount - 1) });
  const [job, setJob] = useState<ExportJob | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Clamp the range when slideCount changes (deck edits).
  useEffect(() => {
    setRange((prev) => ({
      fromIdx: Math.min(prev.fromIdx, Math.max(0, slideCount - 1)),
      toIdx: Math.min(prev.toIdx, Math.max(0, slideCount - 1)),
    }));
  }, [slideCount]);

  // Default quality follows format selection.
  useEffect(() => {
    setQuality(FORMAT_DEFAULTS[format]);
  }, [format]);

  const onChangeFrom = useCallback((value: number) => {
    setRange((prev) => ({ ...prev, fromIdx: Math.max(0, Math.min(value, prev.toIdx)) }));
  }, []);
  const onChangeTo = useCallback((value: number) => {
    setRange((prev) => ({ ...prev, toIdx: Math.min(slideCount - 1, Math.max(value, prev.fromIdx)) }));
  }, [slideCount]);

  const onSubmit = useCallback(async () => {
    if (!onQueue) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await onQueue({ deckId, format, quality, range });
      setJob(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to queue export');
    } finally {
      setSubmitting(false);
    }
  }, [deckId, format, quality, range, onQueue]);

  const onProgress = useCallback((event: ExportProgressEvent) => {
    setJob((prev) => (prev ? { ...prev, ...event.job } : prev));
  }, []);

  const formatOptions = useMemo<readonly ExportFormat[]>(
    () => ['pdf', 'pptx', 'mp4', 'html'],
    [],
  );
  const qualityOptions = useMemo<readonly ExportQuality[]>(
    () => ['draft', 'standard', 'high', 'lossless'],
    [],
  );

  if (!open) return null;

  return (
    <div
      data-testid={dataTestId}
      role="dialog"
      aria-label="Export dialog"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.4)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 200,
      }}
    >
      <div
        data-testid={`${dataTestId}-panel`}
        style={{
          width: 'min(560px, 96vw)',
          maxHeight: '90vh',
          overflow: 'auto',
          background: '#fff',
          color: '#111',
          borderRadius: 8,
          padding: 24,
          boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
        }}
      >
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0 }}>
            <FormattedMessage id="editor.share.export.title" /> · <span style={{ fontWeight: 400 }}>{deckTitle}</span>
          </h2>
          <button
            type="button"
            onClick={onClose}
            data-testid={`${dataTestId}-close`}
            aria-label="Close"
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 18 }}
          >
            ×
          </button>
        </header>

        {!job ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void onSubmit();
            }}
            style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 16 }}
          >
            <fieldset style={{ border: 'none', padding: 0, margin: 0 }}>
              <legend style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
                <FormattedMessage id="editor.share.export.format" />
              </legend>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {formatOptions.map((f) => {
                  const active = format === f;
                  return (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setFormat(f)}
                      data-testid={`${dataTestId}-format-${f}`}
                      style={{
                        padding: '6px 12px',
                        border: `1px solid ${active ? '#3b82f6' : 'rgba(0,0,0,0.2)'}`,
                        borderRadius: 4,
                        background: active ? '#eff6ff' : 'transparent',
                        color: active ? '#1d4ed8' : '#111',
                        cursor: 'pointer',
                      }}
                    >
                      <FormattedMessage id={FORMAT_LABEL_IDS[f]} />
                    </button>
                  );
                })}
              </div>
            </fieldset>

            <fieldset style={{ border: 'none', padding: 0, margin: 0 }}>
              <legend style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
                <FormattedMessage id="editor.share.export.quality" />
              </legend>
              <select
                value={quality}
                onChange={(e) => setQuality(e.target.value as ExportQuality)}
                data-testid={`${dataTestId}-quality`}
                style={{ padding: 6, borderRadius: 4, border: '1px solid rgba(0,0,0,0.2)' }}
              >
                {qualityOptions.map((q) => (
                  <option key={q} value={q}>
                    {q}
                  </option>
                ))}
              </select>
              <span style={{ marginLeft: 8, fontSize: 11, color: 'rgba(0,0,0,0.5)' }}>
                <FormattedMessage id={QUALITY_LABEL_IDS[quality]} />
              </span>
            </fieldset>

            <fieldset style={{ border: 'none', padding: 0, margin: 0 }}>
              <legend style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
                <FormattedMessage id="editor.share.export.range" />
              </legend>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <input
                  type="number"
                  min={1}
                  max={slideCount}
                  value={range.fromIdx + 1}
                  onChange={(e) => onChangeFrom(Number(e.target.value) - 1)}
                  data-testid={`${dataTestId}-from`}
                  style={{ width: 70, padding: 6 }}
                />
                <span>–</span>
                <input
                  type="number"
                  min={1}
                  max={slideCount}
                  value={range.toIdx + 1}
                  onChange={(e) => onChangeTo(Number(e.target.value) - 1)}
                  data-testid={`${dataTestId}-to`}
                  style={{ width: 70, padding: 6 }}
                />
                <span style={{ fontSize: 11, color: 'rgba(0,0,0,0.5)' }}>
                  <FormattedMessage
                    id="editor.share.export.rangeTotal"
                    values={{ total: slideCount }}
                  />
                </span>
              </div>
            </fieldset>

            {error ? (
              <div
                role="alert"
                data-testid={`${dataTestId}-error`}
                style={{ color: '#dc2626', fontSize: 12 }}
              >
                {error}
              </div>
            ) : null}

            <footer style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
              <button
                type="button"
                onClick={onClose}
                data-testid={`${dataTestId}-cancel`}
                style={{ padding: '6px 12px', border: '1px solid rgba(0,0,0,0.2)', borderRadius: 4, background: 'transparent', cursor: 'pointer' }}
              >
                <FormattedMessage id="editor.share.cancel" />
              </button>
              <button
                type="submit"
                disabled={submitting}
                data-testid={`${dataTestId}-queue`}
                style={{
                  padding: '6px 12px',
                  border: 'none',
                  borderRadius: 4,
                  background: '#3b82f6',
                  color: '#fff',
                  cursor: submitting ? 'wait' : 'pointer',
                  opacity: submitting ? 0.6 : 1,
                }}
              >
                <FormattedMessage id="editor.share.export.queue" />
              </button>
            </footer>
          </form>
        ) : (
          <div style={{ marginTop: 16 }}>
            <ExportProgressTracker
              job={job}
              onPoll={onPoll}
              onComplete={(finalJob) => setJob(finalJob)}
              onProgress={onProgress}
              dataTestId={`${dataTestId}-progress`}
            />
            <footer style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
              <button
                type="button"
                onClick={onClose}
                data-testid={`${dataTestId}-close-after`}
                style={{ padding: '6px 12px', border: '1px solid rgba(0,0,0,0.2)', borderRadius: 4, background: 'transparent', cursor: 'pointer' }}
              >
                <FormattedMessage id="editor.share.cancel" />
              </button>
            </footer>
          </div>
        )}
      </div>
    </div>
  );
}
