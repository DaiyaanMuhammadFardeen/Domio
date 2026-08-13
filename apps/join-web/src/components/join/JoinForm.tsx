/**
 * @domio/join-web — join form.
 *
 * Phase 16 W1. Mobile-first form to capture a 6-digit session code
 * (or take from URL) and a display name, plus optional email + locale
 * for Wave 5 §S5.1. Routes to /j/[code] on submit.
 *
 * Validation:
 *  - Code must be exactly 6 digits (post-trim).
 *  - Display name must be non-empty.
 *  - Email is optional; if present, must look like an email.
 *  - Locale picker is rendered only if `navigator.languages.length > 1`
 *    or the URL has `?locale=1`.
 */

'use client';

import { useEffect, useState } from 'react';
import { LIST_LOCALES, loadSavedLocale, saveLocale } from '@/lib/locale-prefs';

export interface JoinFormProps {
  readonly initialCode?: string;
  readonly initialLocale?: string;
  readonly forceLocale?: boolean;
  readonly onSubmit: (
    code: string,
    displayName: string,
    extras: { email?: string; locale?: string },
  ) => void;
  readonly busy?: boolean;
  readonly error?: string | null;
}

const CODE_RE = /^\d{6}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function showLocalePicker(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get('locale') === '1') return true;
    if (navigator.languages && navigator.languages.length > 1) return true;
  } catch {
    // ignore — fall through to false
  }
  return false;
}

export function JoinForm(props: JoinFormProps) {
  const [code, setCode] = useState(props.initialCode ?? '');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [locale, setLocale] = useState<string>(
    props.initialLocale ?? loadSavedLocale() ?? 'en',
  );
  const [localeVisible, setLocaleVisible] = useState(false);

  useEffect(() => {
    setLocaleVisible(props.forceLocale === true || showLocalePicker());
  }, [props.forceLocale]);

  const codeValid = CODE_RE.test(code.trim());
  const nameValid = displayName.trim().length > 0;
  const emailValid = email.trim() === '' || EMAIL_RE.test(email.trim());
  const canSubmit = codeValid && nameValid && emailValid && !props.busy;

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    saveLocale(locale);
    props.onSubmit(code.trim(), displayName.trim(), {
      ...(email.trim() ? { email: email.trim() } : {}),
      locale,
    });
  };

  return (
    <form
      onSubmit={onSubmit}
      className="flex flex-col gap-4 p-4 max-w-md w-full mx-auto"
    >
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">Session code</span>
        <input
          name="code"
          inputMode="numeric"
          pattern="\d{6}"
          autoComplete="off"
          className="border rounded p-3 text-2xl tracking-widest text-center font-mono"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))}
          placeholder="123456"
          maxLength={6}
          data-testid="join-code"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">Display name</span>
        <input
          name="display_name"
          inputMode="text"
          autoComplete="nickname"
          className="border rounded p-3"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="How others see you"
          data-testid="join-display-name"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">
          Email <span className="text-slate-500 font-normal">(optional)</span>
        </span>
        <input
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          className="border rounded p-3"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          data-testid="join-email"
        />
      </label>
      {localeVisible ? (
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Language</span>
          <select
            name="locale"
            className="border rounded p-3 bg-white"
            value={locale}
            onChange={(e) => setLocale(e.target.value)}
            data-testid="join-locale"
          >
            {LIST_LOCALES.map((loc) => (
              <option key={loc} value={loc}>{loc}</option>
            ))}
          </select>
        </label>
      ) : null}
      {props.error ? (
        <p className="text-red-700 text-sm" role="alert" data-testid="join-error">{props.error}</p>
      ) : null}
      {!codeValid && code.length > 0 ? (
        <p className="text-red-700 text-sm" role="alert" data-testid="join-code-error">
          Session code must be 6 digits.
        </p>
      ) : null}
      <button
        type="submit"
        className="bg-blue-600 text-white rounded p-4 text-lg font-medium disabled:opacity-50"
        disabled={!canSubmit}
        data-testid="join-submit"
      >
        {props.busy ? 'Joining…' : 'Join'}
      </button>
    </form>
  );
}