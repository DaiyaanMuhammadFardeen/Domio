'use client';

/**
 * BrandExtractDialog — paste a URL, kick `POST /v1/brand/extract`,
 * preview the suggested kit, then accept or cancel.
 *
 * Per Wave 2 §S2.5 of docs/frontend-roadmap/02-wave-editor-surface.md.
 */

import { useCallback, useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import type { BrandKitDetail } from '../../lib/brand-service';
import { extractBrandFromUrl, type ExtractedBrandKit } from '../../lib/brand-service';
import { contrastFor } from '../../lib/design-tokens';

export interface BrandExtractDialogProps {
  open: boolean;
  onClose: () => void;
  /** Called with the new kit when the designer hits "Add to library". */
  onAccept: (kit: BrandKitDetail) => void;
  /** Optional id for the dialog root. */
  id?: string | undefined;
}

export function BrandExtractDialog(props: BrandExtractDialogProps): ReactElement | null {
  const { open, onClose, onAccept, id } = props;
  const [url, setUrl] = useState('');
  const [status, setStatus] = useState<'idle' | 'extracting' | 'success' | 'error'>('idle');
  const [result, setResult] = useState<ExtractedBrandKit | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [kitName, setKitName] = useState('');

  // Reset on open.
  useEffect(() => {
    if (!open) return;
    setStatus('idle');
    setResult(null);
    setError(null);
    setKitName('');
    setUrl('');
  }, [open]);

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const handleExtract = useCallback(async () => {
    setStatus('extracting');
    setError(null);
    try {
      const out = await extractBrandFromUrl(url);
      setResult(out);
      setKitName(out.suggestedKitName);
      setStatus('success');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus('error');
    }
  }, [url]);

  const handleAccept = useCallback(() => {
    if (!result) return;
    const id2 = `brand-extracted-${result.sourceUrl.replace(/[^a-z0-9]/gi, '-').slice(0, 32)}`;
    const kit: BrandKitDetail = {
      id: id2,
      name: kitName || result.suggestedKitName,
      primaryHex: result.primaryHex,
      accentHex: result.accentHex,
      colors: [
        {
          id: 'color.brand.primary',
          label: 'Primary',
          stops: [{ id: '500', label: '500', value: result.primaryHex }],
        },
        {
          id: 'color.brand.accent',
          label: 'Accent',
          stops: [{ id: '500', label: '500', value: result.accentHex }],
        },
      ],
      typography: result.fontFamilies.slice(0, 3).map((family, i) => ({
        id: `type.${i === 0 ? 'heading' : i === 1 ? 'body' : 'caption'}`,
        label: i === 0 ? 'Heading' : i === 1 ? 'Body' : 'Caption',
        fontFamily: family,
        fontSizePx: i === 0 ? 32 : i === 1 ? 16 : 12,
        lineHeight: i === 0 ? 1.2 : 1.5,
        fontWeight: i === 0 ? 700 : i === 1 ? 400 : 500,
        letterSpacingEm: i === 2 ? 0.02 : 0,
      })),
      spacing: [
        {
          id: 'space',
          label: 'Spacing',
          stops: [
            { id: '1', label: '1×', value: '4px' },
            { id: '2', label: '2×', value: '8px' },
            { id: '4', label: '4×', value: '16px' },
            { id: '8', label: '8×', value: '32px' },
          ],
        },
      ],
      radius: [
        {
          id: 'radius',
          label: 'Radius',
          stops: [
            { id: 'sm', label: 'SM', value: '4px' },
            { id: 'md', label: 'MD', value: '8px' },
          ],
        },
      ],
      shadows: [
        {
          id: 'shadow',
          label: 'Shadow',
          stops: [{ id: 'md', label: 'MD', value: '0 4px 8px rgba(0,0,0,0.15)' }],
        },
      ],
    };
    onAccept(kit);
  }, [result, kitName, onAccept]);

  if (!open) return null;

  return (
    <div
      className="brand-extract-dialog"
      role="dialog"
      aria-modal="true"
      data-testid={id ?? 'brand-extract-dialog'}
    >
      <div className="brand-extract-dialog__backdrop" onClick={onClose} />
      <div className="brand-extract-dialog__panel">
        <header className="brand-extract-dialog__head">
          <h2 className="brand-extract-dialog__title">Extract brand from URL</h2>
          <button
            type="button"
            className="brand-extract-dialog__close"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </header>

        <p className="brand-extract-dialog__hint">
          Paste a homepage URL and we'll scrape primary + accent colors, font choices, and propose a
          kit name.
        </p>

        <div className="brand-extract-dialog__input-row">
          <input
            type="url"
            className="brand-extract-dialog__input"
            placeholder="https://acmecoffee.com"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            disabled={status === 'extracting'}
            data-testid="brand-extract-url"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && status !== 'extracting' && url.length > 0) {
                void handleExtract();
              }
            }}
          />
          <button
            type="button"
            className="brand-extract-dialog__extract"
            onClick={() => void handleExtract()}
            disabled={status === 'extracting' || url.length === 0}
            data-testid="brand-extract-go"
          >
            {status === 'extracting' ? 'Extracting…' : 'Extract'}
          </button>
        </div>

        {status === 'error' && (
          <div className="brand-extract-dialog__error" data-testid="brand-extract-error">
            {error ?? 'Extraction failed'}
          </div>
        )}

        {result && (
          <div className="brand-extract-dialog__result" data-testid="brand-extract-result">
            <div className="brand-extract-dialog__swatches">
              <Swatch label="Primary" value={result.primaryHex} />
              <Swatch label="Accent" value={result.accentHex} />
              {result.secondaryHexes.slice(0, 3).map((hex, i) => (
                <Swatch key={i} label={`Secondary ${i + 1}`} value={hex} />
              ))}
            </div>
            <div className="brand-extract-dialog__fonts">
              <span className="brand-extract-dialog__label">Fonts</span>
              {result.fontFamilies.slice(0, 3).map((f) => (
                <span key={f} className="brand-extract-dialog__font">
                  <span style={{ fontFamily: f }}>{f}</span>
                  <code>{f}</code>
                </span>
              ))}
            </div>
            <label className="brand-extract-dialog__name">
              <span>Kit name</span>
              <input
                type="text"
                value={kitName}
                onChange={(e) => setKitName(e.target.value)}
                data-testid="brand-extract-name"
              />
            </label>
            <div className="brand-extract-dialog__actions">
              <button
                type="button"
                className="brand-extract-dialog__cancel"
                onClick={onClose}
                data-testid="brand-extract-cancel"
              >
                Cancel
              </button>
              <button
                type="button"
                className="brand-extract-dialog__accept"
                onClick={handleAccept}
                data-testid="brand-extract-accept"
              >
                Add to library
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Swatch({ label, value }: { label: string; value: string }): ReactElement {
  return (
    <span className="brand-extract-dialog__swatch">
      <span
        className="brand-extract-dialog__swatch-box"
        style={{ background: value, color: contrastFor(value) }}
      >
        {value}
      </span>
      <span className="brand-extract-dialog__swatch-label">{label}</span>
    </span>
  );
}
