'use client';

/**
 * UpdateStream — Wave 11 §S11.2.
 *
 * A live stream of every "deck" update event: data refreshes, comments,
 * version publishes, auto-refreshes, and section restores. Auto-scrolls
 * to the newest entry. Caps the visible list at 50 entries; any older
 * entries are summarized as "{n} older updates — view history".
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { FormattedMessage } from '@domio/ui';

import {
  formatRelative,
  listUpdates,
  type LivingUpdate,
  type LivingUpdateKind,
} from '../../lib/living-service.js';

/* -------------------------------------------------------------------------- */
/* Constants                                                                  */
/* -------------------------------------------------------------------------- */

const MAX_VISIBLE = 50;

const KIND_LABEL_KEY: Readonly<Record<LivingUpdateKind, string>> = {
  data_refresh: 'editor.living.stream.kind.dataRefresh',
  comment_added: 'editor.living.stream.kind.commentAdded',
  version_published: 'editor.living.stream.kind.versionPublished',
  auto_refresh: 'editor.living.stream.kind.autoRefresh',
  section_restored: 'editor.living.stream.kind.sectionRestored',
};

const KIND_COLOR: Readonly<Record<LivingUpdateKind, string>> = {
  data_refresh: '#2563eb',
  comment_added: '#9333ea',
  version_published: '#059669',
  auto_refresh: '#0891b2',
  section_restored: '#d97706',
};

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function formatClock(ts: number): string {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

/* -------------------------------------------------------------------------- */
/* Component                                                                  */
/* -------------------------------------------------------------------------- */

export interface UpdateStreamProps {
  readonly deckId: string;
  /** Polling cadence in ms. Default: 15 seconds. */
  readonly pollIntervalMs?: number;
  /** Max entries shown. Default: 50. */
  readonly maxVisible?: number;
  /** data-testid prefix. Default: "living-stream". */
  readonly dataTestId?: string;
  /** Optional section filter — only show updates for this section. */
  readonly sectionId?: string | undefined;
  /** Optional click handler — receives the clicked update. */
  readonly onSelect?: ((update: LivingUpdate) => void) | undefined;
}

export function UpdateStream({
  deckId,
  pollIntervalMs = 15_000,
  maxVisible = MAX_VISIBLE,
  dataTestId = 'living-stream',
  sectionId,
  onSelect,
}: UpdateStreamProps): ReactElement {
  const [updates, setUpdates] = useState<readonly LivingUpdate[]>([]);
  const [now, setNow] = useState<number>(() => Date.now());
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const containerRef = useRef<HTMLOListElement | null>(null);

  /* -- fetch ------------------------------------------------------------- */

  const fetchAll = useCallback(async (): Promise<void> => {
    try {
      const list = await listUpdates({ deckId });
      setUpdates(list);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'unknown');
    } finally {
      setLoading(false);
    }
  }, [deckId]);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  useEffect(() => {
    const id = setInterval(() => void fetchAll(), pollIntervalMs);
    return (): void => clearInterval(id);
  }, [fetchAll, pollIntervalMs]);

  /* -- tick clock so "X ago" stays fresh --------------------------------- */

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 10_000);
    return (): void => clearInterval(id);
  }, []);

  /* -- derive visible / older counts ------------------------------------- */

  const sorted = useMemo<readonly LivingUpdate[]>(
    () =>
      updates
        .filter((u) => (sectionId === undefined ? true : u.section_id === sectionId))
        .slice()
        .sort((a, b) => b.timestamp_ms - a.timestamp_ms),
    [updates, sectionId],
  );

  const visible = useMemo<readonly LivingUpdate[]>(
    () => sorted.slice(0, maxVisible),
    [sorted, maxVisible],
  );

  const olderCount = Math.max(0, sorted.length - visible.length);

  /* -- auto-scroll to newest --------------------------------------------- */

  useEffect(() => {
    if (!containerRef.current) return;
    const first = containerRef.current.firstElementChild;
    if (first instanceof HTMLElement) {
      first.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [visible]);

  /* -- render ------------------------------------------------------------ */

  return (
    <section
      data-testid={dataTestId}
      aria-label="Update stream"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        minHeight: 120,
        fontSize: 13,
      }}
    >
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '4px 0',
        }}
      >
        <h2 style={{ fontSize: 14, margin: 0 }}>
          <FormattedMessage id="editor.living.stream.heading" />
        </h2>
        <span
          aria-hidden
          data-testid={`${dataTestId}-count`}
          style={{ fontSize: 11, color: '#6b7280' }}
        >
          ({sorted.length})
        </span>
      </header>

      {loading ? (
        <div data-testid={`${dataTestId}-loading`} role="status">
          …
        </div>
      ) : error !== null ? (
        <div data-testid={`${dataTestId}-error`} role="alert" style={{ color: '#dc2626' }}>
          {error}
        </div>
      ) : sorted.length === 0 ? (
        <div data-testid={`${dataTestId}-empty`} role="status" style={{ color: '#6b7280' }}>
          <FormattedMessage id="editor.living.stream.empty" />
        </div>
      ) : (
        <ol
          ref={containerRef}
          data-testid={`${dataTestId}-list`}
          style={{
            listStyle: 'none',
            margin: 0,
            padding: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
            maxHeight: 420,
            overflowY: 'auto',
          }}
        >
          {visible.map((u) => (
            <li
              key={u.id}
              data-testid={`${dataTestId}-row`}
              data-kind={u.kind}
              onClick={onSelect ? () => onSelect(u) : undefined}
              style={{
                display: 'grid',
                gridTemplateColumns: 'auto 1fr auto',
                gap: 8,
                padding: '6px 8px',
                borderRadius: 4,
                border: '1px solid rgba(0,0,0,0.06)',
                background: '#fafafa',
                cursor: onSelect ? 'pointer' : 'default',
              }}
            >
              <span
                aria-hidden
                style={{
                  display: 'inline-block',
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: KIND_COLOR[u.kind],
                  marginTop: 6,
                }}
              />
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
                  <span style={{ fontWeight: 600 }}>
                    <FormattedMessage id={KIND_LABEL_KEY[u.kind]} />
                  </span>
                  <span style={{ color: '#6b7280', fontSize: 12 }}>{u.actor.name}</span>
                </div>
                <div
                  style={{
                    color: '#374151',
                    marginTop: 2,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                  title={u.summary}
                >
                  {u.summary}
                </div>
              </div>
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'flex-end',
                  fontSize: 11,
                  color: '#6b7280',
                  minWidth: 80,
                }}
              >
                <span>{formatRelative(u.timestamp_ms, now)}</span>
                <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {formatClock(u.timestamp_ms)}
                </span>
              </div>
            </li>
          ))}

          {olderCount > 0 ? (
            <li
              data-testid={`${dataTestId}-older`}
              style={{
                textAlign: 'center',
                padding: '8px 0',
                fontSize: 12,
                color: '#6b7280',
                fontStyle: 'italic',
              }}
            >
              <FormattedMessage id="editor.living.stream.olderHidden" values={{ n: olderCount }} />
            </li>
          ) : null}
        </ol>
      )}
    </section>
  );
}

export default UpdateStream;
