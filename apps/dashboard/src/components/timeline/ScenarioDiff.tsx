'use client';

import type { EventChange } from '../../lib/timeline-service';

export interface ScenarioDiffProps {
  fromSummary: string | null;
  toSummary: string | null;
  fromLabel: string;
  toLabel: string;
  changes: ReadonlyArray<EventChange>;
  heading: string;
  selectBothLabel: string;
  emptyLabel: string;
}

function humanise(field: string): string {
  switch (field) {
    case 'slide_index':
      return 'Slides advanced';
    case 'scenarios_added':
      return 'Scenarios turned ON';
    case 'scenarios_removed':
      return 'Scenarios turned OFF';
    case 'annotations_count':
      return 'Annotations';
    case 'polls_count':
      return 'Polls launched';
    case 'qa_count':
      return 'Q&A submitted';
    case 'comments_count':
      return 'Comments';
    default:
      return field;
  }
}

function formatValue(value: unknown): string {
  if (Array.isArray(value)) {
    if (value.length === 0) return '—';
    return value.join(', ');
  }
  if (value === null || value === undefined) return '—';
  return String(value);
}

function describeDelta(change: EventChange): string {
  switch (change.field) {
    case 'slide_index': {
      const before = typeof change.before === 'number' ? change.before + 1 : change.before;
      const after = typeof change.after === 'number' ? change.after + 1 : change.after;
      return `${humanise(change.field)}: ${String(before)} → ${String(after)}`;
    }
    case 'scenarios_added':
    case 'scenarios_removed': {
      const verb = change.field === 'scenarios_added' ? 'added' : 'removed';
      const values = Array.isArray(change.after)
        ? change.after
        : Array.isArray(change.before)
          ? change.before
          : [];
      if (values.length === 0) return '';
      return `${values.length} scenario${values.length === 1 ? '' : 's'} ${verb}: ${values.join(', ')}`;
    }
    case 'annotations_count':
    case 'polls_count':
    case 'qa_count':
    case 'comments_count': {
      const delta = Number(change.after ?? 0) - Number(change.before ?? 0);
      const sign = delta > 0 ? '+' : '';
      return `${humanise(change.field)}: ${String(change.before)} → ${String(change.after)} (${sign}${delta})`;
    }
    default:
      return `${humanise(change.field)}: ${formatValue(change.before)} → ${formatValue(change.after)}`;
  }
}

/**
 * Side-by-side diff between two timeline events. The summary line for
 * each endpoint is shown on top, followed by a list of structured
 * changes (slide advance, scenario toggle, counts, etc.).
 */
export function ScenarioDiff({
  fromSummary,
  toSummary,
  fromLabel,
  toLabel,
  changes,
  heading,
  selectBothLabel,
  emptyLabel,
}: ScenarioDiffProps) {
  return (
    <section
      data-testid="scenario-diff"
      className="space-y-3 rounded-xl border border-slate-200 bg-white p-4"
    >
      <header>
        <h3 className="text-sm font-semibold text-slate-900">{heading}</h3>
      </header>

      <div className="grid grid-cols-2 gap-3 text-xs">
        <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
          <div className="font-semibold uppercase tracking-wide text-slate-500">{fromLabel}</div>
          <div className="mt-1 text-slate-700" data-testid="diff-from-summary">
            {fromSummary ?? '—'}
          </div>
        </div>
        <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
          <div className="font-semibold uppercase tracking-wide text-slate-500">{toLabel}</div>
          <div className="mt-1 text-slate-700" data-testid="diff-to-summary">
            {toSummary ?? '—'}
          </div>
        </div>
      </div>

      {changes.length === 0 ? (
        <p data-testid="scenario-diff-empty" className="text-xs text-slate-500">
          {fromSummary === null || toSummary === null ? selectBothLabel : emptyLabel}
        </p>
      ) : (
        <ul className="space-y-1 text-xs" data-testid="scenario-diff-changes">
          {changes.map((change, idx) => {
            const description = describeDelta(change);
            if (!description) return null;
            return (
              <li
                key={`${change.field}-${idx}`}
                className="rounded-md bg-slate-50 px-3 py-1.5 text-slate-700"
              >
                {description}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
