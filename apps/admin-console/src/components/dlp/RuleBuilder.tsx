'use client';

import { useState } from 'react';
import type { DLPRule, DLPRuleInput, DLPPatternKind, DLPScope, DLPAction } from '../../lib/types';

export interface RuleBuilderProps {
  initial?: DLPRule | undefined;
  onSave: (input: DLPRuleInput) => Promise<void>;
  onCancel?: () => void;
}

const ALL_SCOPES: ReadonlyArray<DLPScope> = ['deck-title', 'slide-content', 'comment', 'asset'];

const ALL_ACTIONS: ReadonlyArray<DLPAction> = ['block-share', 'redact', 'notify'];

const ALL_KINDS: ReadonlyArray<DLPPatternKind> = ['regex', 'dictionary', 'entity'];

/**
 * Form for creating or editing a DLP rule. Pure controlled component —
 * the parent owns the submit lifecycle via `onSave`.
 */
export function RuleBuilder({ initial, onSave, onCancel }: RuleBuilderProps) {
  const [name, setName] = useState(initial?.name ?? '');
  const [kind, setKind] = useState<DLPPatternKind>(initial?.kind ?? 'regex');
  const [pattern, setPattern] = useState(initial?.pattern ?? '');
  const [scopes, setScopes] = useState<ReadonlyArray<DLPScope>>(initial?.scopes ?? []);
  const [actions, setActions] = useState<ReadonlyArray<DLPAction>>(initial?.actions ?? []);
  const [enabled, setEnabled] = useState<boolean>(initial?.enabled ?? true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleScope(scope: DLPScope) {
    setScopes((prev) =>
      prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope],
    );
  }

  function toggleAction(action: DLPAction) {
    setActions((prev) =>
      prev.includes(action) ? prev.filter((a) => a !== action) : [...prev, action],
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError('Name is required');
      return;
    }
    if (!pattern.trim()) {
      setError('Pattern is required');
      return;
    }
    if (scopes.length === 0) {
      setError('Pick at least one scope');
      return;
    }
    if (actions.length === 0) {
      setError('Pick at least one action');
      return;
    }
    setSaving(true);
    try {
      await onSave({
        name: name.trim(),
        kind,
        pattern: pattern,
        scopes,
        actions,
        enabled,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save rule');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      data-testid="rule-builder"
      onSubmit={handleSubmit}
      className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
    >
      <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-600">
        Rule builder
      </h3>

      <div className="space-y-4">
        <label className="block">
          <span className="block text-xs font-medium uppercase tracking-wide text-slate-500">
            Name
          </span>
          <input
            data-testid="rule-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm transition focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            placeholder="e.g. Credit card numbers"
          />
        </label>

        <fieldset>
          <legend className="block text-xs font-medium uppercase tracking-wide text-slate-500">
            Pattern kind
          </legend>
          <div className="mt-2 flex gap-4">
            {ALL_KINDS.map((k) => (
              <label key={k} className="inline-flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="radio"
                  name="rule-kind"
                  value={k}
                  checked={kind === k}
                  onChange={() => setKind(k)}
                  data-testid={`rule-kind-${k}`}
                  className="h-3.5 w-3.5 accent-brand-600"
                />
                <span className="capitalize">{k}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <label className="block">
          <span className="block text-xs font-medium uppercase tracking-wide text-slate-500">
            Pattern
          </span>
          <textarea
            data-testid="rule-pattern"
            value={pattern}
            onChange={(e) => setPattern(e.target.value)}
            rows={3}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-xs transition focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            placeholder={
              kind === 'regex'
                ? '\\b\\d{3}-\\d{2}-\\d{4}\\b'
                : kind === 'dictionary'
                  ? 'core-confidential'
                  : 'email'
            }
          />
        </label>

        <fieldset>
          <legend className="block text-xs font-medium uppercase tracking-wide text-slate-500">
            Scopes
          </legend>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {ALL_SCOPES.map((scope) => (
              <label key={scope} className="inline-flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={scopes.includes(scope)}
                  onChange={() => toggleScope(scope)}
                  data-testid={`rule-scope-${scope}`}
                  className="h-3.5 w-3.5 accent-brand-600"
                />
                <span>{scope}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="block text-xs font-medium uppercase tracking-wide text-slate-500">
            Actions
          </legend>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {ALL_ACTIONS.map((action) => (
              <label key={action} className="inline-flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={actions.includes(action)}
                  onChange={() => toggleAction(action)}
                  data-testid={`rule-action-${action}`}
                  className="h-3.5 w-3.5 accent-brand-600"
                />
                <span>{action}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <label className="inline-flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            data-testid="rule-enabled"
            className="h-3.5 w-3.5 accent-brand-600"
          />
          <span>Enabled</span>
        </label>
      </div>

      {error && (
        <div
          className="mt-4 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700"
          role="alert"
        >
          {error}
        </div>
      )}

      <div className="mt-5 flex items-center justify-end gap-2">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            data-testid="rule-cancel"
            className="inline-flex items-center rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-100"
          >
            Cancel
          </button>
        )}
        <button
          type="submit"
          disabled={saving}
          data-testid="rule-save"
          className="inline-flex items-center rounded-md bg-brand-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-brand-700 disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save rule'}
        </button>
      </div>
    </form>
  );
}
