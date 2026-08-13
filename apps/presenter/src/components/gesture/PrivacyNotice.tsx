'use client';

/**
 * PrivacyNotice — shown the first time the presenter enables gesture
 * control.
 *
 * Per Wave 11 §S11.4 of docs/frontend-roadmap/11-wave-novel-frontier.md.
 *
 * Gesture detection runs entirely in the browser via MediaPipe — frames
 * never leave the device. This notice makes that promise explicit and
 * collects explicit consent before the webcam is acquired.
 */

import { useCallback, type ReactElement } from 'react';
import { FormattedMessage } from '@domio/ui';

export interface PrivacyNoticeProps {
  /** Called when the presenter accepts and wants to proceed. */
  readonly onConfirm: () => void;
  /** Called when the presenter dismisses the dialog. */
  readonly onCancel: () => void;
  readonly dataTestId?: string;
}

export function PrivacyNotice({
  onConfirm,
  onCancel,
  dataTestId = 'gesture-privacy-notice',
}: PrivacyNoticeProps): ReactElement {
  const handleConfirm = useCallback(() => onConfirm(), [onConfirm]);
  const handleCancel = useCallback(() => onCancel(), [onCancel]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="gesture-privacy-title"
      data-testid={dataTestId}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'var(--overlay-scrim)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 50,
      }}
    >
      <div
        style={{
          background: 'var(--surface-base)',
          color: 'var(--content-primary)',
          borderRadius: 8,
          padding: 20,
          width: 'min(420px, 92vw)',
          boxShadow: 'var(--shadow-modal)',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        <h2
          id="gesture-privacy-title"
          style={{ margin: 0, fontSize: 16, fontWeight: 600 }}
        >
          <FormattedMessage id="presenter.gesture.privacy.title" />
        </h2>
        <p
          style={{
            margin: 0,
            fontSize: 13,
            lineHeight: 1.5,
            color: 'var(--content-secondary)',
          }}
        >
          <FormattedMessage id="presenter.gesture.privacy.body" />
        </p>
        <div
          style={{
            display: 'flex',
            gap: 8,
            justifyContent: 'flex-end',
            marginTop: 4,
          }}
        >
          <button
            type="button"
            data-testid={`${dataTestId}-cancel`}
            onClick={handleCancel}
            style={{
              padding: '6px 12px',
              borderRadius: 4,
              border: '1px solid var(--border-subtle)',
              background: 'var(--surface-raised)',
              cursor: 'pointer',
              fontSize: 13,
            }}
          >
            <FormattedMessage id="presenter.gesture.privacy.cancel" />
          </button>
          <button
            type="button"
            data-testid={`${dataTestId}-confirm`}
            onClick={handleConfirm}
            style={{
              padding: '6px 12px',
              borderRadius: 4,
              border: '1px solid var(--accent-primary)',
              background: 'var(--accent-primary)',
              color: 'var(--content-inverse)',
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            <FormattedMessage id="presenter.gesture.privacy.confirm" />
          </button>
        </div>
      </div>
    </div>
  );
}