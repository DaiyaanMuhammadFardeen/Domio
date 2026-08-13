'use client';

/**
 * RateLimitRuleDrawer — slide-over editor for a single rate-limit rule.
 *
 * Per Wave 10 §S10.6. Designed to be controlled by the parent
 * rate-limits page (opens via `open` prop, closes via `onClose`,
 * persists via `onSubmit`).
 */

import { useEffect, useState, type FormEvent } from 'react';
import { X } from 'lucide-react';
import { clsx } from 'clsx';
import {
  type RateLimitRule,
  type RateLimitRuleInput,
  type RateLimitScope,
  type RateLimitWindow,
} from '../../lib/billing-service';

export interface RateLimitRuleDrawerProps {
  readonly open: boolean;
  readonly initial: RateLimitRule | null;
  readonly saving?: boolean;
  readonly errorMessage?: string | null;
  readonly onClose: () => void;
  readonly onSubmit: (input: RateLimitRuleInput) => Promise<void> | void;
  readonly onDelete?: (id: string) => Promise<void> | void;
  readonly labels: {
    headingAdd: string;
    headingEdit: string;
    scope: string;
    scopePerKey: string;
    scopePerAgent: string;
    scopePerIp: string;
    subject: string;
    limit: string;
    window: string;
    window1m: string;
    window5m: string;
    window1h: string;
    window1d: string;
    save: string;
    cancel: string;
    delete: string;
  };
}

const DEFAULT_INPUT: RateLimitRuleInput = {
  scope: 'per_key',
  subject: '',
  limit: 1000,
  window: '1m',
};

export function RateLimitRuleDrawer({
  open,
  initial,
  saving = false,
  errorMessage = null,
  onClose,
  onSubmit,
  onDelete,
  labels,
}: RateLimitRuleDrawerProps) {
  const [input, setInput] = useState<RateLimitRuleInput>(DEFAULT_INPUT);

  useEffect(() => {
    if (initial) {
      setInput({
        scope: initial.scope,
        subject: initial.subject,
        limit: initial.limit,
        window: initial.window,
      });
    } else {
      setInput(DEFAULT_INPUT);
    }
  }, [initial, open]);

  if (!open) return null;

  const isEdit = initial !== null;
  const heading = isEdit ? labels.headingEdit : labels.headingAdd;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void onSubmit(input);
  }

  return (
    <div
      className="fixed inset-0 z-40 flex justify-end"
      role="dialog"
      aria-modal="true"
      aria-label={heading}
    >
      <button
        type="button"
        onClick={onClose}
        className="flex-1 bg-slate-900/30 backdrop-blur-sm"
        aria-label={labels.cancel}
      />
      <aside className="flex h-full w-full max-w-md flex-col border-l border-slate-200 bg-white shadow-xl">
        <header className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <h2 className="text-base font-semibold text-slate-900">{heading}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
            aria-label={labels.cancel}
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <form onSubmit={handleSubmit} className="flex flex-1 flex-col">
          <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4 text-sm">
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                {labels.scope}
              </span>
              <select
                value={input.scope}
                onChange={(e) =>
                  setInput((prev) => ({
                    ...prev,
                    scope: e.target.value as RateLimitScope,
                  }))
                }
                className="w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-800 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              >
                <option value="per_key">{labels.scopePerKey}</option>
                <option value="per_agent">{labels.scopePerAgent}</option>
                <option value="per_ip">{labels.scopePerIp}</option>
              </select>
            </label>

            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                {labels.subject}
              </span>
              <input
                type="text"
                required
                value={input.subject}
                onChange={(e) =>
                  setInput((prev) => ({ ...prev, subject: e.target.value }))
                }
                placeholder={
                  input.scope === 'per_ip'
                    ? '203.0.113.42'
                    : input.scope === 'per_agent'
                      ? 'agent-deck-builder'
                      : 'ak-acme-prod-201'
                }
                className="w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-800 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {labels.limit}
                </span>
                <input
                  type="number"
                  min={1}
                  required
                  value={input.limit}
                  onChange={(e) =>
                    setInput((prev) => ({
                      ...prev,
                      limit: Number(e.target.value),
                    }))
                  }
                  className="w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm tabular-nums text-slate-800 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {labels.window}
                </span>
                <select
                  value={input.window}
                  onChange={(e) =>
                    setInput((prev) => ({
                      ...prev,
                      window: e.target.value as RateLimitWindow,
                    }))
                  }
                  className="w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-800 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                >
                  <option value="1m">{labels.window1m}</option>
                  <option value="5m">{labels.window5m}</option>
                  <option value="1h">{labels.window1h}</option>
                  <option value="1d">{labels.window1d}</option>
                </select>
              </label>
            </div>

            {errorMessage ? (
              <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                {errorMessage}
              </div>
            ) : null}
          </div>

          <footer className="flex items-center justify-between border-t border-slate-200 px-5 py-3">
            <div>
              {isEdit && onDelete ? (
                <button
                  type="button"
                  onClick={() => initial && void onDelete(initial.id)}
                  className="rounded-md border border-rose-200 px-3 py-1.5 text-sm font-medium text-rose-700 hover:bg-rose-50"
                >
                  {labels.delete}
                </button>
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-md border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                {labels.cancel}
              </button>
              <button
                type="submit"
                disabled={saving}
                className={clsx(
                  'rounded-md px-3 py-1.5 text-sm font-medium text-white shadow-sm',
                  saving
                    ? 'cursor-wait bg-brand-400'
                    : 'bg-brand-600 hover:bg-brand-700',
                )}
              >
                {labels.save}
              </button>
            </div>
          </footer>
        </form>
      </aside>
    </div>
  );
}
