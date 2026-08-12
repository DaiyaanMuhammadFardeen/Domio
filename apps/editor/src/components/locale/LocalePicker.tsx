/**
 * LocalePicker — per-element locale picker.
 *
 * Per Wave 2 §S2.9 of docs/frontend-roadmap/02-wave-editor-surface.md.
 *
 * Drop-in for any element-level prop editor that needs "Show USD to
 * one audience, EUR to another." The picker is a select bound to a
 * `locale` prop on the element, plus a small preview chip that
 * renders a sample value in the chosen locale via
 * `formatPreviewSync()` (the live `/v1/localization/format` service
 * is wrapped in `lib/localization-service.ts`).
 */

'use client';

import { useMemo } from 'react';
import type { ReactElement } from 'react';
import { formatPreviewSync, SUPPORTED_LOCALES, SUPPORTED_CURRENCIES } from '../../lib/localization-service';
import { cn } from '../../lib/cn';
import { useT } from '../../lib/locale';

export interface LocalePickerProps {
  /** The currently selected locale (BCP-47). */
  value: string;
  /** Called when the user picks a new locale. */
  onChange: (locale: string) => void;
  /** Whether currency formatting is enabled (renders the currency select too). */
  withCurrency?: boolean;
  currency?: string;
  onCurrencyChange?: (currency: string) => void;
  /** Sample value to render in the preview chip. Defaults to 1234.56. */
  sampleValue?: number;
  /** Locale-grouped labels for nicer UX. */
  groupByRegion?: boolean;
  /** Optional override for the picker label (defaults to "Locale"). */
  label?: string;
}

interface LocaleGroup {
  region: string;
  entries: { locale: string; label: string }[];
}

const SAMPLE_LABELS: Record<string, string> = {
  'en-US': 'English (US)',
  'en-GB': 'English (UK)',
  'de-DE': 'Deutsch',
  'fr-FR': 'Français',
  'es-ES': 'Español',
  'it-IT': 'Italiano',
  'pt-BR': 'Português (BR)',
  'ja-JP': '日本語',
  'zh-CN': '中文 (简体)',
  'ko-KR': '한국어',
  'ar-EG': 'العربية',
  'bn-BD': 'বাংলা',
  'ur-PK': 'اردو',
  'hi-IN': 'हिन्दी',
};

const REGION_HINTS: Record<string, string> = {
  'en': 'Americas / Europe',
  'de': 'Europe',
  'fr': 'Europe',
  'es': 'Europe / Americas',
  'it': 'Europe',
  'pt': 'Americas',
  'ja': 'Asia',
  'zh': 'Asia',
  'ko': 'Asia',
  'ar': 'MENA',
  'bn': 'South Asia',
  'ur': 'South Asia',
  'hi': 'South Asia',
};

function groupLocales(): readonly LocaleGroup[] {
  const groups = new Map<string, { locale: string; label: string }[]>();
  for (const locale of SUPPORTED_LOCALES) {
    const lang = locale.split('-')[0] ?? locale;
    const region = REGION_HINTS[lang] ?? 'Other';
    if (!groups.has(region)) groups.set(region, []);
    groups.get(region)!.push({ locale, label: SAMPLE_LABELS[locale] ?? locale });
  }
  return Array.from(groups.entries()).map(([region, entries]) => ({ region, entries }));
}

export function LocalePicker(props: LocalePickerProps): ReactElement {
  const t = useT();
  const groups = useMemo(() => groupLocales(), []);
  const sample = props.sampleValue ?? 1234.56;
  const preview = useMemo(
    () =>
      formatPreviewSync({
        value: sample,
        locale: props.value,
        style: props.withCurrency ? 'currency' : 'decimal',
        ...(props.currency ? { currency: props.currency } : {}),
      }),
    [sample, props.value, props.withCurrency, props.currency],
  );

  return (
    <div className="locale-picker" data-testid="locale-picker">
      <label className="locale-picker__field">
        <span className="locale-picker__label">{props.label ?? t('locale.locale')}</span>
        <select
          className="locale-picker__select"
          value={props.value}
          onChange={(e) => props.onChange(e.target.value)}
          aria-label={props.label ?? t('locale.locale')}
        >
          {!props.groupByRegion && SUPPORTED_LOCALES.map((locale) => (
            <option key={locale} value={locale}>
              {SAMPLE_LABELS[locale] ?? locale}
            </option>
          ))}
          {props.groupByRegion && groups.map((g) => (
            <optgroup key={g.region} label={g.region}>
              {g.entries.map((entry) => (
                <option key={entry.locale} value={entry.locale}>
                  {entry.label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>

      {props.withCurrency ? (
        <label className="locale-picker__field">
          <span className="locale-picker__label">{t('locale.currency')}</span>
          <select
            className="locale-picker__select"
            value={props.currency ?? 'USD'}
            onChange={(e) => props.onCurrencyChange?.(e.target.value)}
            aria-label={t('locale.currency')}
          >
            {SUPPORTED_CURRENCIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </label>
      ) : null}

      <div
        className={cn('locale-picker__preview', preview.fallback && 'locale-picker__preview--fallback')}
        data-testid="locale-picker-preview"
      >
        <span className="locale-picker__preview-label">{t('locale.preview')}</span>
        <span className="locale-picker__preview-value">{preview.formatted}</span>
        {preview.fallback ? (
          <span className="locale-picker__preview-note">{t('locale.fallback')}</span>
        ) : null}
      </div>
    </div>
  );
}