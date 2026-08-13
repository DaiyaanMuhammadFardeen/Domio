'use client';

/**
 * SectionHistory — Wave 11 §S11.2.
 *
 * Version-history-per-section. Renders the timeline of versions for a
 * given deck section (slide or deck section). Each row has a timestamp,
 * the author, the change summary, and a Restore button.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactElement,
} from 'react';
import { FormattedMessage } from '@domio/ui';

import {
  formatRelative,
  listSectionVersions,
  restoreSectionVersion,
  type SectionVersion,
} from '../../lib/living-service.js';

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function formatClock(ts: number): string {
  const d = new Date(ts);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
}

/* -------------------------------------------------------------------------- */
/* Component                                                                  */
/* -------------------------------------------------------------------------- */

export interface SectionHistoryProps {
  readonly deckId: string;
  readonly sectionId: string;
  /** data-testid prefix. Default: "living-section-history". */
  readonly dataTestId?: string;
  /** Callback fired after a successful restore. */
  readonly onRestored?: ((info: { versionId: string; restoredAtMs: number }) => void) | undefined;
}

export function SectionHistory({
  deckId,
  sectionId,
  dataTestId = 'living-section-history',
  onRestored,
}: SectionHistoryProps): ReactElement {
  const [versions, setVersions] = useState<readonly SectionVersion[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [now, setNow] = useState<number>(() => Date.now());

  /* -- fetch ------------------------------------------------------------- */

  const fetchVersions = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const list = await listSectionVersions(deckId, sectionId);
      setVersions(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'unknown');
    } finally {
      setLoading(false);
    }
  }, [deckId, sectionId]);

  useEffect(() => {
    void fetchVersions();
  }, [fetchVersions]);

  /* -- tick clock -------------------------------------------------------- */

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return (): void => clearInterval(id);
  }, []);

  /* -- derive ------------------------------------------------------------ */

  const sorted = useMemo<readonly SectionVersion[]>(
    () => versions.slice().sort((a, b) => b.timestamp_ms - a.timestamp_ms),
    [versions],
  );

  /* -- restore ----------------------------------------------------------- */

  const handleRestore = useCallback(
    async (version: SectionVersion): Promise<void> => {
      setRestoringId(version.id);
      try {
        const result = await restoreSectionVersion(deckId, sectionId, version.id);
        setToast('restored');
        onRestored?.({ versionId: version.id, restoredAtMs: result.restored_at_ms });
        // Refresh to reflect any server-side ordering changes.
        await fetchVersions();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'restore failed');
      } finally {
        setRestoringId(null);
        // Auto-hide toast
        setTimeout(() => setToast(null), 2_500);
      }
    },
    [deckId, sectionId, onRestored, fetchVersions],
  );

  /* -- render ------------------------------------------------------------ */

  return (
    <section
      data-testid={dataTestId}
      aria-label="Section history"
      style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13 }}
    >
      <header style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <h2 style={{ fontSize: 14, margin: 0 }}>
          <FormattedMessage id="editor.living.history.heading" />
        </h2>
        <span style={{ fontSize: 11, color: '#6b7280' }}>· {sectionId}</span>
      </header>

      {toast === 'restored' ? (
        <div
          role="status"
          data-testid={`${dataTestId}-restored-toast`}
          style={{ color: '#059669', fontSize: 12 }}
        >
          <FormattedMessage id="editor.living.history.restored" />
        </div>
      ) : null}

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
          <FormattedMessage id="editor.living.history.empty" />
        </div>
      ) : (
        <table
          data-testid={`${dataTestId}-table`}
          style={{
            borderCollapse: 'collapse',
            width: '100%',
            tableLayout: 'fixed',
          }}
        >
          <thead>
            <tr>
              <th style={thStyle}>
                <FormattedMessage id="editor.living.history.col.timestamp" />
              </th>
              <th style={thStyle}>
                <FormattedMessage id="editor.living.history.col.author" />
              </th>
              <th style={thStyle}>
                <FormattedMessage id="editor.living.history.col.summary" />
              </th>
              <th style={thStyle} aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {sorted.map((v) => {
              const restoring = restoringId === v.id;
              return (
                <tr
                  key={v.id}
                  data-testid={`${dataTestId}-row`}
                  data-version-id={v.id}
                  style={{ borderTop: '1px solid rgba(0,0,0,0.06)' }}
                >
                  <td style={tdStyle}>
                    <div>{formatClock(v.timestamp_ms)}</div>
                    <div style={{ fontSize: 11, color: '#6b7280' }}>
                      {formatRelative(v.timestamp_ms, now)}
                    </div>
                  </td>
                  <td style={tdStyle}>{v.author}</td>
                  <td style={{ ...tdStyle, wordBreak: 'break-word' }}>{v.change_summary}</td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>
                    <button
                      type="button"
                      data-testid={`${dataTestId}-restore`}
                      disabled={restoring}
                      onClick={() => void handleRestore(v)}
                      style={{
                        padding: '4px 10px',
                        fontSize: 12,
                        border: '1px solid rgba(0,0,0,0.16)',
                        borderRadius: 4,
                        background: '#fff',
                        cursor: restoring ? 'wait' : 'pointer',
                        opacity: restoring ? 0.6 : 1,
                      }}
                    >
                      <FormattedMessage id="editor.living.history.restore" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}

const thStyle: React.CSSProperties = {
  textAlign: 'left',
  fontSize: 11,
  fontWeight: 600,
  color: '#6b7280',
  padding: '6px 8px',
  borderBottom: '1px solid rgba(0,0,0,0.08)',
  textTransform: 'uppercase',
  letterSpacing: 0.4,
};

const tdStyle: React.CSSProperties = {
  padding: '8px',
  verticalAlign: 'top',
};

export default SectionHistory;