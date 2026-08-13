/**
 * ConflictResolver — per-slide diff between master and downstream.
 *
 * Per Wave 11 §S11.8 of docs/frontend-roadmap/11-wave-novel-frontier.md.
 *
 * For each diverged slide:
 *   - slide title + conflict kind badge (added / removed / modified)
 *   - master version (read-only JSON-ish summary)
 *   - downstream version (read-only JSON-ish summary)
 *   - three actions: Keep master / Keep downstream / Keep both
 *
 * The editor auto-resolves to master by default — clicking the
 * card body also resolves it that way.
 */

'use client';

import { useCallback, useState, type ReactElement } from 'react';
import { FormattedMessage } from '@domio/ui';
import {
  resolveConflict,
  type ConflictResolution,
  type SlideConflict,
} from '../../lib/inheritance-service';

export interface ConflictResolverProps {
  readonly conflicts: readonly SlideConflict[];
  /**
   * Hook invoked after a resolution is applied. The default
   * implementation calls `resolveConflict` from the service. Tests
   * can override to bypass network calls.
   */
  readonly onResolve?: (
    slideId: string,
    resolution: ConflictResolution,
  ) => Promise<void> | void;
  readonly dataTestId?: string;
}

const KIND_LABEL_ID: Record<SlideConflict['kind'], string> = {
  added: 'editor.inheritance.conflicts.kind.added',
  removed: 'editor.inheritance.conflicts.kind.removed',
  modified: 'editor.inheritance.conflicts.kind.modified',
};

const KIND_COLOR: Record<SlideConflict['kind'], string> = {
  added: '#16a34a',
  removed: '#dc2626',
  modified: '#a16207',
};

function summarize(record: Record<string, unknown>): string {
  const keys = Object.keys(record);
  if (keys.length === 0) return '—';
  return keys
    .map((k) => `${k}: ${typeof record[k] === 'object' ? JSON.stringify(record[k]) : String(record[k])}`)
    .join('\n');
}

export function ConflictResolver({
  conflicts,
  onResolve,
  dataTestId = 'conflict-resolver',
}: ConflictResolverProps): ReactElement {
  const [resolved, setResolved] = useState<ReadonlySet<string>>(() => new Set());
  const [busyId, setBusyId] = useState<string | null>(null);

  const apply = useCallback(
    async (slideId: string, resolution: ConflictResolution) => {
      setBusyId(slideId);
      try {
        if (onResolve) {
          await onResolve(slideId, resolution);
        } else {
          await resolveConflict('', slideId, resolution);
        }
        setResolved((prev) => {
          const next = new Set(prev);
          next.add(slideId);
          return next;
        });
      } finally {
        setBusyId(null);
      }
    },
    [onResolve],
  );

  const visible = conflicts.filter((c) => !resolved.has(c.slide_id));

  return (
    <section
      data-testid={dataTestId}
      aria-labelledby={`${dataTestId}-heading`}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        padding: 12,
        border: '1px solid rgba(0,0,0,0.1)',
        borderRadius: 6,
        background: 'rgba(0,0,0,0.02)',
      }}
    >
      <header>
        <h2 id={`${dataTestId}-heading`} style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>
          <FormattedMessage id="editor.inheritance.conflicts.heading" /> ({visible.length})
        </h2>
      </header>

      {visible.length === 0 ? (
        <p data-testid={`${dataTestId}-empty`} style={{ margin: 0, opacity: 0.6 }}>
          <FormattedMessage id="editor.inheritance.conflicts.empty" />
        </p>
      ) : (
        <ul role="list" style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {visible.map((conflict) => {
            const isBusy = busyId === conflict.slide_id;
            return (
              <li
                key={conflict.slide_id}
                data-testid={`${dataTestId}-conflict-${conflict.slide_id}`}
                data-kind={conflict.kind}
                style={{
                  border: '1px solid rgba(0,0,0,0.12)',
                  borderRadius: 6,
                  padding: 12,
                  background: 'white',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                  <strong>{conflict.slide_title}</strong>
                  <span
                    style={{
                      padding: '2px 8px',
                      borderRadius: 999,
                      background: `${KIND_COLOR[conflict.kind]}22`,
                      color: KIND_COLOR[conflict.kind],
                      fontSize: 11,
                      fontWeight: 600,
                      textTransform: 'uppercase',
                    }}
                  >
                    <FormattedMessage id={KIND_LABEL_ID[conflict.kind]} />
                  </span>
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: 12,
                    marginTop: 8,
                  }}
                >
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 600, opacity: 0.7, marginBottom: 4 }}>MASTER</div>
                    <pre
                      data-testid={`${dataTestId}-master-${conflict.slide_id}`}
                      style={{
                        margin: 0,
                        padding: 8,
                        fontSize: 12,
                        background: 'rgba(59,130,246,0.06)',
                        border: '1px solid rgba(59,130,246,0.2)',
                        borderRadius: 4,
                        whiteSpace: 'pre-wrap',
                      }}
                    >
                      {summarize(conflict.master_version)}
                    </pre>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 600, opacity: 0.7, marginBottom: 4 }}>DOWNSTREAM</div>
                    <pre
                      data-testid={`${dataTestId}-downstream-${conflict.slide_id}`}
                      style={{
                        margin: 0,
                        padding: 8,
                        fontSize: 12,
                        background: 'rgba(220,38,38,0.06)',
                        border: '1px solid rgba(220,38,38,0.2)',
                        borderRadius: 4,
                        whiteSpace: 'pre-wrap',
                      }}
                    >
                      {summarize(conflict.downstream_version)}
                    </pre>
                  </div>
                </div>

                <div style={{ fontSize: 11, opacity: 0.6, marginTop: 6 }}>
                  Downstream: {conflict.downstream_decks.join(', ')}
                </div>

                <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={() => apply(conflict.slide_id, 'master')}
                    disabled={isBusy}
                    data-testid={`${dataTestId}-keep-master-${conflict.slide_id}`}
                    style={{
                      padding: '4px 10px',
                      cursor: isBusy ? 'wait' : 'pointer',
                      background: '#3b82f6',
                      color: 'white',
                      border: 'none',
                      borderRadius: 4,
                    }}
                  >
                    <FormattedMessage id="editor.inheritance.conflicts.keepMaster" />
                  </button>
                  <button
                    type="button"
                    onClick={() => apply(conflict.slide_id, 'downstream')}
                    disabled={isBusy}
                    data-testid={`${dataTestId}-keep-downstream-${conflict.slide_id}`}
                    style={{
                      padding: '4px 10px',
                      cursor: isBusy ? 'wait' : 'pointer',
                      background: 'white',
                      border: '1px solid rgba(0,0,0,0.2)',
                      borderRadius: 4,
                    }}
                  >
                    <FormattedMessage id="editor.inheritance.conflicts.keepDownstream" />
                  </button>
                  <button
                    type="button"
                    onClick={() => apply(conflict.slide_id, 'both')}
                    disabled={isBusy}
                    data-testid={`${dataTestId}-keep-both-${conflict.slide_id}`}
                    style={{
                      padding: '4px 10px',
                      cursor: isBusy ? 'wait' : 'pointer',
                      background: 'white',
                      border: '1px solid rgba(0,0,0,0.2)',
                      borderRadius: 4,
                    }}
                  >
                    <FormattedMessage id="editor.inheritance.conflicts.keepBoth" />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
