/**
 * UnitFormatDialog — per-element unit format editor.
 *
 * Per Wave 2 §S2.9 of docs/frontend-roadmap/02-wave-editor-surface.md.
 *
 * Lets a designer pick locale + currency + style + decimal precision
 * for a single element's numeric output, with a live preview tile
 * that renders the formatted string in the chosen locale. Calls
 * `formatPreview()` (the bootstrap seam for `/v1/localization/format`)
 * so the editor works in editor-only mode and swaps to the live
 * service transparently once the backend is wired.
 */

'use client';

import { useEffect, useMemo, useState } from 'react';
import type { ReactElement } from 'react';
import {
  formatPreview,
  formatPreviewSync,
  SUPPORTED_LOCALES,
  type FormatStyle,
} from '../../lib/localization-service';
import { LocalePicker } from './LocalePicker';
import { useT } from '../../lib/locale';

export interface UnitFormatValue {
  locale: string;
  style: FormatStyle;
  currency?: string;
  decimals?: number;
}

export interface UnitFormatDialogProps {
  open: boolean;
  initial: UnitFormatValue;
  sampleValue?: number;
  onCancel: () => void;
  onApply: (next: UnitFormatValue) => void;
}

const STYLES: readonly FormatStyle[] = ['decimal', 'currency', 'percent'];

export function UnitFormatDialog(props: UnitFormatDialogProps): ReactElement | null {
  const t = useT();
  const [locale, setLocale] = useState(props.initial.locale);
  const [style, setStyle] = useState<FormatStyle>(props.initial.style);
  const [currency, setCurrency] = useState<string>(props.initial.currency ?? 'USD');
  const [decimals, setDecimals] = useState<number>(props.initial.decimals ?? 2);
  const [serverPreview, setServerPreview] = useState<string | null>(null);

  const sample = props.sampleValue ?? 1234.56;

  const localPreview = useMemo(
    () =>
      formatPreviewSync({
        value: sample,
        locale,
        style,
        ...(style === 'currency' ? { currency } : {}),
        ...(decimals !== undefined ? { decimals } : {}),
      }),
    [sample, locale, style, currency, decimals],
  );

  // Background-call the live service. The bootstrap client returns
  // the same shape immediately; once the backend is wired this will
  // refresh with the canonical server-rendered string.
  useEffect(() => {
    let cancelled = false;
    void formatPreview({
      value: sample,
      locale,
      style,
      ...(style === 'currency' ? { currency } : {}),
      ...(decimals !== undefined ? { decimals } : {}),
    }).then((res) => {
      if (cancelled) return;
      setServerPreview(res.fallback ? null : res.formatted);
    });
    return () => {
      cancelled = true;
    };
  }, [sample, locale, style, currency, decimals]);

  if (!props.open) return null;

  const apply = () => {
    const next: UnitFormatValue = { locale, style };
    if (style === 'currency') next.currency = currency;
    if (decimals !== undefined) next.decimals = decimals;
    props.onApply(next);
  };

  return (
    <div className="dialog-backdrop" role="dialog" aria-modal="true" aria-label={t('locale.unitDialog')} data-testid="unit-format-dialog">
      <div className="dialog">
        <header className="dialog__header">
          <h2 className="dialog__title">{t('locale.unitDialog')}</h2>
          <button
            type="button"
            className="dialog__close"
            onClick={props.onCancel}
            aria-label={t('locale.close')}
          >
            ×
          </button>
        </header>

        <div className="dialog__body">
          <LocalePicker
            value={locale}
            onChange={setLocale}
            withCurrency={style === 'currency'}
            currency={currency}
            onCurrencyChange={setCurrency}
            sampleValue={sample}
          />

          <fieldset className="unit-format__style">
            <legend>{t('locale.style')}</legend>
            {STYLES.map((s) => (
              <label key={s} className="unit-format__radio">
                <input
                  type="radio"
                  name="unit-format-style"
                  value={s}
                  checked={style === s}
                  onChange={() => setStyle(s)}
                />
                {t(`locale.style.${s}`)}
              </label>
            ))}
          </fieldset>

          <label className="unit-format__field">
            <span className="unit-format__label">{t('locale.decimals')}</span>
            <input
              type="number"
              min={0}
              max={6}
              step={1}
              value={decimals}
              onChange={(e) => setDecimals(Number.parseInt(e.target.value, 10) || 0)}
              className="unit-format__input"
            />
          </label>

          <div className="unit-format__preview" data-testid="unit-format-preview">
            <span className="unit-format__preview-label">{t('locale.preview')}</span>
            <span className="unit-format__preview-value">{localPreview.formatted}</span>
            {serverPreview && serverPreview !== localPreview.formatted ? (
              <span className="unit-format__preview-server" title={t('locale.serverPreview')}>
                {serverPreview}
              </span>
            ) : null}
          </div>
        </div>

        <footer className="dialog__footer">
          <button type="button" className="dialog__btn" onClick={props.onCancel}>
            {t('locale.cancel')}
          </button>
          <button
            type="button"
            className="dialog__btn dialog__btn--primary"
            onClick={apply}
            data-testid="unit-format-apply"
          >
            {t('locale.apply')}
          </button>
        </footer>
      </div>
    </div>
  );
}

/**
 * Default initial value when a designer first opens the dialog.
 */
export function defaultUnitFormatValue(): UnitFormatValue {
  return {
    locale: SUPPORTED_LOCALES[0] ?? 'en-US',
    style: 'decimal',
    decimals: 2,
  };
}