'use client';

/**
 * PrivacyNotice — modal shown the first time the listener is enabled.
 *
 * Per Wave 11 §S11.10. Explains that audio stays in the browser and the
 * matcher works against on-device patterns.
 */

import { useCallback } from 'react';

export interface PrivacyNoticeProps {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function PrivacyNotice({ open, onConfirm, onCancel }: PrivacyNoticeProps) {
  const handleConfirm = useCallback(() => {
    onConfirm();
  }, [onConfirm]);

  const handleCancel = useCallback(() => {
    onCancel();
  }, [onCancel]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="ai-listener-privacy-title"
      data-testid="privacy-notice"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
    >
      <div className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl">
        <h2
          id="ai-listener-privacy-title"
          className="text-base font-semibold text-zinc-900"
        >
          Privacy notice
        </h2>
        <p
          data-testid="privacy-notice-body"
          className="mt-3 text-sm leading-relaxed text-zinc-700"
        >
          Listener captures presenter audio entirely in your browser. No audio
          is sent to any server. The matcher works against on-device question
          patterns.
        </p>
        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={handleCancel}
            data-testid="privacy-notice-cancel"
            className="rounded border border-zinc-300 px-3 py-1 text-sm text-zinc-700 hover:bg-zinc-100"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            data-testid="privacy-notice-confirm"
            className="rounded bg-emerald-600 px-3 py-1 text-sm font-medium text-white hover:bg-emerald-700"
          >
            Enable
          </button>
        </div>
      </div>
    </div>
  );
}
