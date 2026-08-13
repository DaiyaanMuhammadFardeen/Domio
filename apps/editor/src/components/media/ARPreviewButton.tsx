/**
 * ARPreviewButton — generates a QR code for the AR preview.
 *
 * Per Wave 2 §S2.10 of docs/frontend-roadmap/02-wave-editor-surface.md.
 *
 * Calls `POST /v1/ar/preview` (or a bootstrap fallback) and renders
 * the QR code with a link to `apps/viewer/ar` route.
 */

'use client';

import { useCallback, useState } from 'react';
import type { ReactElement } from 'react';
import { generateArPreview } from '../../lib/media-service';

export interface ARPreviewButtonProps {
  slideId: string;
  /** When true, the button is disabled. */
  disabled?: boolean;
}

export function ARPreviewButton({ slideId, disabled }: ARPreviewButtonProps): ReactElement {
  const [preview, setPreview] = useState<{ url: string; qrUrl: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);

  const handleClick = useCallback(async () => {
    setBusy(true);
    try {
      const out = await generateArPreview(slideId);
      setPreview(out);
      setOpen(true);
    } finally {
      setBusy(false);
    }
  }, [slideId]);

  return (
    <div className="ar-preview" data-testid="ar-preview">
      <button
        type="button"
        className="ar-preview__btn"
        onClick={() => void handleClick()}
        disabled={disabled || busy}
        data-testid="ar-preview-btn"
      >
        {busy ? 'Generating…' : 'Preview in AR'}
      </button>
      {open && preview && (
        <div className="ar-preview__modal" data-testid="ar-preview-modal">
          <div className="ar-preview__modal-body">
            <img src={preview.qrUrl} alt="AR preview QR" data-testid="ar-preview-qr" />
            <p>
              <a href={preview.url} target="_blank" rel="noreferrer" data-testid="ar-preview-link">
                Open AR viewer
              </a>
            </p>
            <button type="button" onClick={() => setOpen(false)} data-testid="ar-preview-close">
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
