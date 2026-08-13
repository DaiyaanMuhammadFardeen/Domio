/**
 * OpKindFilter — Wave 10 §S10.7.
 *
 * Chip-based multi-select for change-feed op kinds. Selected chips
 * filter the live OpStream. Empty selection means "show all kinds".
 */

'use client';

import { clsx } from 'clsx';
import { Check } from 'lucide-react';
import { CHANGE_FEED_OP_KINDS, type ChangeFeedOpKind } from '../../lib/change-feed-service';

export interface OpKindFilterProps {
  readonly selected: Set<ChangeFeedOpKind>;
  readonly onChange: (next: Set<ChangeFeedOpKind>) => void;
  /** Optional translator for the chip labels. */
  readonly labelOf?: (kind: ChangeFeedOpKind) => string;
}

export function OpKindFilter({ selected, onChange, labelOf }: OpKindFilterProps) {
  function toggle(kind: ChangeFeedOpKind) {
    const next = new Set(selected);
    if (next.has(kind)) {
      next.delete(kind);
    } else {
      next.add(kind);
    }
    onChange(next);
  }

  function clearAll() {
    onChange(new Set());
  }

  return (
    <div
      data-testid="op-kind-filter"
      className="flex flex-wrap items-center gap-2"
      role="group"
      aria-label="Filter by op kind"
    >
      {CHANGE_FEED_OP_KINDS.map((kind) => {
        const isActive = selected.has(kind);
        const label = labelOf ? labelOf(kind) : kind;
        return (
          <button
            key={kind}
            type="button"
            onClick={() => toggle(kind)}
            aria-pressed={isActive}
            className={clsx(
              'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition',
              isActive
                ? 'border-brand-300 bg-brand-50 text-brand-700'
                : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300',
            )}
          >
            {isActive && <Check className="h-3 w-3" aria-hidden />}
            <span>{label}</span>
          </button>
        );
      })}
      {selected.size > 0 && (
        <button
          type="button"
          onClick={clearAll}
          className="ml-1 text-xs font-medium text-slate-500 underline-offset-2 hover:underline"
        >
          Clear
        </button>
      )}
    </div>
  );
}

export default OpKindFilter;
