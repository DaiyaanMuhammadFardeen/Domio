/**
 * @domio/join-web — LocalePicker.
 *
 * Per Wave 5 §S5.5 of docs/frontend-roadmap/05-wave-audience-participation.md.
 * Native <select> wrapper that lists every supported locale from
 * `LIST_LOCALES` and writes the choice to the `domio-locale` cookie
 * via `locale-prefs.saveLocale`.
 */

'use client';

import { useEffect, useId } from 'react';
import type { ReactElement } from 'react';
import { LIST_LOCALES, saveLocale, type LocaleDescriptor } from '@/lib/locale-prefs';

export interface LocalePickerProps {
  readonly value: string;
  readonly onChange: (locale: string) => void;
  readonly locales?: readonly LocaleDescriptor[];
  readonly dataTestId?: string;
}

/**
 * Default picker — derives the descriptor list from the legacy
 * `LIST_LOCALES` string array. Callers that need richer labels should
 * pass `locales` explicitly.
 */
export function LocalePicker({
  value,
  onChange,
  locales,
  dataTestId = 'locale-picker',
}: LocalePickerProps): ReactElement {
  const selectId = useId();

  const descriptorList: readonly LocaleDescriptor[] =
    locales ??
    LIST_LOCALES.map((code): LocaleDescriptor => {
      // Synthesize a minimal descriptor; locales passed explicitly
      // override this with their richer labels.
      return {
        code,
        label: code,
        bcp47: code.includes('-') ? code : `${code}-${code.toUpperCase()}`,
      };
    });

  // Persist any external value changes (e.g. auto-detected on mount)
  // so the choice survives reload.
  useEffect(() => {
    if (value) {
      saveLocale(value);
    }
  }, [value]);

  return (
    <label
      htmlFor={selectId}
      className="flex items-center gap-2 text-sm text-slate-700"
      data-testid={dataTestId}
    >
      <span>Language</span>
      <select
        id={selectId}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          saveLocale(e.target.value);
        }}
        data-testid={`${dataTestId}-select`}
        className="border border-slate-300 rounded px-2 py-1 bg-white"
      >
        {descriptorList.map((loc) => (
          <option
            key={loc.bcp47}
            value={loc.bcp47}
            data-testid={`${dataTestId}-option-${loc.code}`}
          >
            {loc.label}
          </option>
        ))}
      </select>
    </label>
  );
}
