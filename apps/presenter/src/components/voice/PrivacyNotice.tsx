'use client';

/**
 * PrivacyNotice — modal that appears the first time the voice listener
 * is enabled.
 *
 * Per Wave 11 §S11.5, every privacy-implicating feature must be opt-in.
 * Voice capture runs entirely in the browser via the Web Speech API —
 * we surface this in plain language before any mic permission prompt.
 */

import { useEffect, useState, type ReactElement } from 'react';

export interface PrivacyNoticeProps {
  readonly open: boolean;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
  readonly title?: string;
  readonly body?: string;
  readonly confirmLabel?: string;
  readonly cancelLabel?: string;
  readonly dataTestId?: string;
}

export function PrivacyNotice({
  open,
  onConfirm,
  onCancel,
  title = 'Privacy notice',
  body = 'Voice capture runs entirely in your browser. No audio is sent to any server.',
  confirmLabel = 'Enable',
  cancelLabel = 'Cancel',
  dataTestId = 'voice-privacy-notice',
}: PrivacyNoticeProps): ReactElement | null {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!open || !mounted) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={`${dataTestId}-title`}
      aria-describedby={`${dataTestId}-body`}
      data-testid={dataTestId}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1500,
      }}
    >
      <div
        style={{
          background: 'var(--surface-base)',
          color: 'var(--content-primary)',
          padding: 20,
          borderRadius: 8,
          maxWidth: 420,
          width: '90%',
          boxShadow: '0 12px 32px rgba(0,0,0,0.35)',
        }}
      >
        <h2
          id={`${dataTestId}-title`}
          style={{ margin: 0, marginBottom: 8, fontSize: 16, fontWeight: 700 }}
        >
          {title}
        </h2>
        <p
          id={`${dataTestId}-body`}
          style={{ margin: 0, marginBottom: 16, fontSize: 13, lineHeight: 1.5 }}
        >
          {body}
        </p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            type="button"
            data-testid={`${dataTestId}-cancel`}
            onClick={onCancel}
            style={{
              padding: '6px 12px',
              border: '1px solid var(--border-subtle)',
              borderRadius: 4,
              background: 'transparent',
              color: 'var(--content-primary)',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            data-testid={`${dataTestId}-confirm`}
            onClick={onConfirm}
            style={{
              padding: '6px 12px',
              border: 'none',
              borderRadius: 4,
              background: 'var(--accent-primary)',
              color: 'var(--content-inverse)',
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
