/**
 * Consent screen — full-screen modal that lists every category of
 * data Domio collects and lets the participant opt in/out per item.
 *
 * Per Wave 5 §S5.10 of docs/frontend-roadmap/05-wave-audience-participation.md.
 *
 * Required categories are forced on (checkbox disabled). Optional
 * categories can be toggled. The choices — together with the current
 * `policy_version` — are persisted to `sessionStorage` under
 * `domio.consent.v1` so the screen is only re-prompted when the
 * policy version changes.
 *
 *   <ConsentScreen
 *     categories={CATEGORIES}
 *     policyVersion="v1"
 *     onPersist={(choice) => …}
 *   />
 */

import { useCallback, useEffect, useState, type ReactElement } from 'react';

export interface ConsentCategory {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly required: boolean;
}

export interface ConsentChoice {
  readonly policy_version: string;
  readonly accepted: ReadonlyArray<string>;
  readonly declined: ReadonlyArray<string>;
  readonly accepted_at_ms: number;
}

export interface ConsentScreenProps {
  readonly categories: ReadonlyArray<ConsentCategory>;
  readonly policyVersion: string;
  /** Fired after the choice has been written to sessionStorage. */
  readonly onPersist?: (choice: ConsentChoice) => void;
}

const STORAGE_KEY = 'domio.consent.v1';

export function ConsentScreen({
  categories,
  policyVersion,
  onPersist,
}: ConsentScreenProps): ReactElement {
  const [selected, setSelected] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    for (const c of categories) init[c.id] = c.required;
    return init;
  });

  const persist = useCallback(
    (next: Record<string, boolean>) => {
      const accepted: string[] = [];
      const declined: string[] = [];
      for (const c of categories) {
        if (next[c.id]) accepted.push(c.id);
        else declined.push(c.id);
      }
      const choice: ConsentChoice = {
        policy_version: policyVersion,
        accepted,
        declined,
        accepted_at_ms: Date.now(),
      };
      try {
        if (typeof sessionStorage !== 'undefined') {
          sessionStorage.setItem(STORAGE_KEY, JSON.stringify(choice));
        }
      } catch {
        // sessionStorage may be disabled by the browser; persistence
        // is best-effort and the modal still closes for the user.
      }
      onPersist?.(choice);
    },
    [categories, policyVersion, onPersist],
  );

  // Pre-fill from any previous saved choice under the same policy.
  useEffect(() => {
    if (typeof sessionStorage === 'undefined') return;
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<ConsentChoice> | null;
      if (!parsed || parsed.policy_version !== policyVersion) return;
      const next: Record<string, boolean> = {};
      for (const c of categories) {
        if (c.required) next[c.id] = true;
        else next[c.id] = parsed.accepted?.includes(c.id) ?? false;
      }
      setSelected(next);
    } catch {
      // ignore corrupt sessionStorage
    }
  }, [categories, policyVersion]);

  const toggle = (id: string, required: boolean): void => {
    if (required) return;
    setSelected((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const acceptAll = (): void => {
    const next: Record<string, boolean> = {};
    for (const c of categories) next[c.id] = true;
    setSelected(next);
    persist(next);
  };

  const acceptSelected = (): void => {
    persist(selected);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="consent-heading"
      data-testid="consent-screen"
      className="fixed inset-0 z-40 bg-slate-50 text-slate-900 overflow-y-auto"
    >
      <div className="max-w-lg mx-auto p-6">
        <h1 id="consent-heading" className="text-2xl font-semibold mb-2">
          Before you join
        </h1>
        <p className="text-sm text-slate-600 mb-6">
          Tell us what you're comfortable sharing. You can change these later from your session header.
        </p>
        <ul className="space-y-3 mb-6">
          {categories.map((c) => (
            <li key={c.id} className="flex items-start gap-3 p-3 rounded border bg-white">
              <input
                type="checkbox"
                id={`consent-${c.id}`}
                data-testid={`consent-check-${c.id}`}
                data-required={c.required}
                disabled={c.required}
                checked={Boolean(selected[c.id])}
                onChange={() => toggle(c.id, c.required)}
                className="mt-1 h-5 w-5 disabled:opacity-60"
              />
              <label htmlFor={`consent-${c.id}`} className="flex-1 cursor-pointer">
                <span className="block font-medium">
                  {c.label}
                  {c.required ? (
                    <span className="ml-2 text-xs text-slate-500">(required)</span>
                  ) : null}
                </span>
                <span className="block text-sm text-slate-600">{c.description}</span>
              </label>
            </li>
          ))}
        </ul>
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={acceptAll}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded p-3"
            data-testid="consent-accept-all"
          >
            Accept all
          </button>
          <button
            type="button"
            onClick={acceptSelected}
            className="w-full bg-white border border-slate-300 rounded p-3"
            data-testid="consent-accept-selected"
          >
            Accept selected
          </button>
        </div>
      </div>
    </div>
  );
}