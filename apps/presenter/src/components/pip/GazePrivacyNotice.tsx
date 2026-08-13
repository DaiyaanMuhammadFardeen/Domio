'use client';

/**
 * GazePrivacyNotice — privacy dialog shown the first time the presenter
 * enables gaze tracking.
 *
 * Per Wave 11 §S11.3 of docs/frontend-roadmap/11-wave-novel-frontier.md.
 *
 * Plain language guarantee: gaze tracking runs entirely in the
 * presenter's browser. No video frames, gaze coordinates, or calibration
 * data are uploaded to any server. The presenter can toggle gaze
 * tracking off at any time.
 *
 * The notice is modal but lightweight — it does NOT request camera
 * permission (that happens when the gaze loop starts and WebGazer.js
 * calls getUserMedia internally). It simply asks for consent to *enable*
 * the feature and gives the presenter a one-click opt-out.
 */

import type { ReactElement } from 'react';

export interface GazePrivacyNoticeProps {
  /** Fired when the presenter agrees to enable gaze tracking. */
  readonly onConfirm: () => void;
  /** Fired when the presenter cancels. */
  readonly onCancel: () => void;
  readonly dataTestId?: string;
  /**
   * Localized strings. The defaults match the en.json entries required
   * for Wave 11 §S11.3.
   */
  readonly labels?: Partial<{
    title: string;
    body: string;
    confirm: string;
    cancel: string;
  }>;
}

const DEFAULT_LABELS: Required<NonNullable<GazePrivacyNoticeProps['labels']>> = {
  title: 'Privacy notice',
  body: 'Gaze tracking runs entirely in your browser. No video is sent to any server. Toggle off at any time.',
  confirm: 'Enable',
  cancel: 'Cancel',
};

export function GazePrivacyNotice({
  onConfirm,
  onCancel,
  dataTestId = 'gaze-privacy-notice',
  labels,
}: GazePrivacyNoticeProps): ReactElement {
  const t = { ...DEFAULT_LABELS, ...(labels ?? {}) };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={`${dataTestId}-title`}
      data-testid={dataTestId}
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.5)',
        zIndex: 1100,
      }}
    >
      <div
        data-testid={`${dataTestId}-card`}
        style={{
          maxWidth: 420,
          width: 'min(90vw, 420px)',
          padding: 24,
          borderRadius: 12,
          background: 'var(--surface-raised)',
          color: 'var(--text-primary)',
          boxShadow: '0 12px 32px rgba(0,0,0,0.35)',
        }}
      >
        <h2
          id={`${dataTestId}-title`}
          data-testid={`${dataTestId}-title`}
          style={{ margin: 0, fontSize: 18, fontWeight: 600 }}
        >
          {t.title}
        </h2>
        <p
          data-testid={`${dataTestId}-body`}
          style={{ marginTop: 12, marginBottom: 20, lineHeight: 1.4 }}
        >
          {t.body}
        </p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            type="button"
            data-testid={`${dataTestId}-cancel`}
            onClick={onCancel}
            style={{
              padding: '8px 14px',
              borderRadius: 6,
              border: '1px solid var(--border-subtle)',
              background: 'transparent',
              cursor: 'pointer',
              color: 'inherit',
            }}
          >
            {t.cancel}
          </button>
          <button
            type="button"
            data-testid={`${dataTestId}-confirm`}
            onClick={onConfirm}
            style={{
              padding: '8px 14px',
              borderRadius: 6,
              border: 'none',
              background: 'var(--accent)',
              color: 'var(--accent-fg)',
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            {t.confirm}
          </button>
        </div>
      </div>
    </div>
  );
}
