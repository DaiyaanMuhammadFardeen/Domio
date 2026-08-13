/**
 * ResolveForm — Wave 9 §S9.6.
 *
 * Notes textarea + Confirm / Dismiss buttons. Owns the in-flight busy
 * state and is invoked by the shared detail panel for both the inline
 * drawer and the full-page detail view.
 */

'use client';

import { useState } from 'react';

export type ResolveDecision = 'confirmed' | 'dismissed';

export interface ResolveFormProps {
  readonly busy: boolean;
  readonly onSubmit: (decision: ResolveDecision, notes: string) => void | Promise<void>;
  readonly confirmLabel: string;
  readonly dismissLabel: string;
  readonly notesLabel: string;
  readonly notesPlaceholder: string;
}

export function ResolveForm({
  busy,
  onSubmit,
  confirmLabel,
  dismissLabel,
  notesLabel,
  notesPlaceholder,
}: ResolveFormProps) {
  const [notes, setNotes] = useState('');

  return (
    <div className="space-y-3">
      <label htmlFor="resolve-notes" className="text-xs font-medium text-slate-600">
        {notesLabel}
      </label>
      <textarea
        id="resolve-notes"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        rows={3}
        placeholder={notesPlaceholder}
        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm transition focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
      />
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => onSubmit('confirmed', notes)}
          className="rounded-md bg-rose-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-rose-700 disabled:opacity-50"
        >
          {confirmLabel}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => onSubmit('dismissed', notes)}
          className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
        >
          {dismissLabel}
        </button>
      </div>
    </div>
  );
}

export default ResolveForm;
