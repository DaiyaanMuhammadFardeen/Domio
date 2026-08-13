/**
 * @domio/join-web — accessibility preferences panel.
 *
 * Per Wave 5 §S5.9 of docs/frontend-roadmap/05-wave-audience-participation.md.
 * Captions font size + position, high-contrast mode, reduced-motion
 * preference. Persists to localStorage under `domio-a11y-prefs`.
 */

'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

export type CaptionFontSize = 'small' | 'medium' | 'large' | 'xl';
export type CaptionPosition = 'top' | 'bottom';

export interface AccessibilityPrefsState {
  readonly fontSize: CaptionFontSize;
  readonly position: CaptionPosition;
  readonly highContrast: boolean;
  readonly reducedMotion: boolean;
}

export interface AccessibilityPrefsProps {
  /** Optional controlled initial value; otherwise read from localStorage. */
  readonly initial?: AccessibilityPrefsState;
  /** Fired whenever the user changes any preference. */
  readonly onChange?: (prefs: AccessibilityPrefsState) => void;
}

export const A11Y_PREFS_STORAGE_KEY = 'domio-a11y-prefs';

export const DEFAULT_A11Y_PREFS: AccessibilityPrefsState = {
  fontSize: 'medium',
  position: 'bottom',
  highContrast: false,
  reducedMotion: false,
};

export function loadA11yPrefs(
  storageKey: string = A11Y_PREFS_STORAGE_KEY,
): AccessibilityPrefsState {
  if (typeof window === 'undefined') return DEFAULT_A11Y_PREFS;
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return DEFAULT_A11Y_PREFS;
    const parsed = JSON.parse(raw) as Partial<AccessibilityPrefsState>;
    return {
      fontSize: parsed.fontSize ?? DEFAULT_A11Y_PREFS.fontSize,
      position: parsed.position ?? DEFAULT_A11Y_PREFS.position,
      highContrast: parsed.highContrast ?? DEFAULT_A11Y_PREFS.highContrast,
      reducedMotion: parsed.reducedMotion ?? DEFAULT_A11Y_PREFS.reducedMotion,
    };
  } catch {
    return DEFAULT_A11Y_PREFS;
  }
}

export function saveA11yPrefs(
  prefs: AccessibilityPrefsState,
  storageKey: string = A11Y_PREFS_STORAGE_KEY,
): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(storageKey, JSON.stringify(prefs));
}

const FONT_SIZES: readonly CaptionFontSize[] = ['small', 'medium', 'large', 'xl'];
const POSITIONS: readonly CaptionPosition[] = ['top', 'bottom'];

export function AccessibilityPrefs(props: AccessibilityPrefsProps) {
  const [prefs, setPrefs] = useState<AccessibilityPrefsState>(props.initial ?? DEFAULT_A11Y_PREFS);
  const [hydrated, setHydrated] = useState(false);

  // Hydrate from localStorage on mount.
  useEffect(() => {
    if (!props.initial) setPrefs(loadA11yPrefs());
    setHydrated(true);
  }, [props.initial]);

  // Persist + notify on change.
  useEffect(() => {
    if (!hydrated) return;
    saveA11yPrefs(prefs);
    props.onChange?.(prefs);
  }, [prefs, hydrated, props]);

  const setFontSize = useCallback((fontSize: CaptionFontSize) => {
    setPrefs((p) => ({ ...p, fontSize }));
  }, []);
  const setPosition = useCallback((position: CaptionPosition) => {
    setPrefs((p) => ({ ...p, position }));
  }, []);
  const setHighContrast = useCallback((highContrast: boolean) => {
    setPrefs((p) => ({ ...p, highContrast }));
  }, []);
  const setReducedMotion = useCallback((reducedMotion: boolean) => {
    setPrefs((p) => ({ ...p, reducedMotion }));
  }, []);

  const fontButtons = useMemo(
    () =>
      FONT_SIZES.map((size) => {
        const isActive = prefs.fontSize === size;
        return (
          <button
            key={size}
            type="button"
            aria-pressed={isActive}
            onClick={() => setFontSize(size)}
            className={[
              'rounded px-3 py-1.5 text-sm font-medium transition-colors',
              isActive
                ? 'bg-blue-600 text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200',
            ].join(' ')}
            data-testid={`a11y-fontsize-${size}`}
          >
            {size}
          </button>
        );
      }),
    [prefs.fontSize, setFontSize],
  );

  const positionButtons = useMemo(
    () =>
      POSITIONS.map((pos) => {
        const isActive = prefs.position === pos;
        return (
          <button
            key={pos}
            type="button"
            aria-pressed={isActive}
            onClick={() => setPosition(pos)}
            className={[
              'rounded px-3 py-1.5 text-sm font-medium transition-colors',
              isActive
                ? 'bg-blue-600 text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200',
            ].join(' ')}
            data-testid={`a11y-position-${pos}`}
          >
            {pos}
          </button>
        );
      }),
    [prefs.position, setPosition],
  );

  return (
    <section
      aria-label="Accessibility preferences"
      className="flex flex-col gap-4 rounded-lg border border-slate-200 bg-white p-4"
      data-testid="a11y-prefs"
    >
      <header>
        <h2 className="text-base font-semibold text-slate-900">Accessibility</h2>
        <p className="text-xs text-slate-500">Captions + motion preferences</p>
      </header>

      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium text-slate-700">Caption font size</span>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Caption font size">
          {fontButtons}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium text-slate-700">Caption position</span>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Caption position">
          {positionButtons}
        </div>
      </div>

      <label className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-slate-700">High contrast</span>
        <button
          type="button"
          role="switch"
          aria-checked={prefs.highContrast}
          onClick={() => setHighContrast(!prefs.highContrast)}
          className={[
            'relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
            prefs.highContrast ? 'bg-blue-600' : 'bg-slate-300',
          ].join(' ')}
          data-testid="a11y-high-contrast"
        >
          <span
            aria-hidden="true"
            className={[
              'inline-block h-5 w-5 rounded-full bg-white shadow transition-transform',
              prefs.highContrast ? 'translate-x-5' : 'translate-x-0.5',
            ].join(' ')}
          />
        </button>
      </label>

      <label className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-slate-700">Reduced motion</span>
        <button
          type="button"
          role="switch"
          aria-checked={prefs.reducedMotion}
          onClick={() => setReducedMotion(!prefs.reducedMotion)}
          className={[
            'relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
            prefs.reducedMotion ? 'bg-blue-600' : 'bg-slate-300',
          ].join(' ')}
          data-testid="a11y-reduced-motion"
        >
          <span
            aria-hidden="true"
            className={[
              'inline-block h-5 w-5 rounded-full bg-white shadow transition-transform',
              prefs.reducedMotion ? 'translate-x-5' : 'translate-x-0.5',
            ].join(' ')}
          />
        </button>
      </label>
    </section>
  );
}

export default AccessibilityPrefs;
