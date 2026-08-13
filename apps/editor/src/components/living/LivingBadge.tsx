'use client';

/**
 * LivingBadge — Wave 11 §S11.2.
 *
 * A pulsing "live" badge showing the time since the deck was last refreshed.
 * Click the badge to open a small menu with:
 *   - Refresh now
 *   - Pause / Resume auto-refresh
 *   - View history (popover listing the last 10 refresh events)
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
} from 'react';
import { FormattedMessage } from '@domio/ui';

import {
  formatRelative,
  listUpdates,
  triggerRefresh,
  type LivingUpdate,
} from '../../lib/living-service.js';

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function isRefreshEvent(u: LivingUpdate): boolean {
  return (
    u.kind === 'data_refresh' ||
    u.kind === 'auto_refresh' ||
    u.kind === 'section_restored'
  );
}

/* -------------------------------------------------------------------------- */
/* Component                                                                  */
/* -------------------------------------------------------------------------- */

export interface LivingBadgeProps {
  readonly deckId: string;
  /** Polling cadence in ms. Default: 30 seconds. */
  readonly pollIntervalMs?: number;
  /** data-testid prefix. Default: "living-badge". */
  readonly dataTestId?: string;
  /** Callback fired after a manual refresh completes. */
  readonly onRefresh?: (() => void) | undefined;
  /** Callback fired when pause state changes. */
  readonly onPauseChange?: ((paused: boolean) => void) | undefined;
}

const HISTORY_PREVIEW_LIMIT = 10;

export function LivingBadge({
  deckId,
  pollIntervalMs = 30_000,
  dataTestId = 'living-badge',
  onRefresh,
  onPauseChange,
}: LivingBadgeProps): ReactElement {
  const [updates, setUpdates] = useState<readonly LivingUpdate[]>([]);
  const [now, setNow] = useState<number>(() => Date.now());
  const [paused, setPaused] = useState<boolean>(false);
  const [menuOpen, setMenuOpen] = useState<boolean>(false);
  const [popoverOpen, setPopoverOpen] = useState<boolean>(false);
  const [busy, setBusy] = useState<boolean>(false);

  const menuRef = useRef<HTMLDivElement | null>(null);
  const badgeRef = useRef<HTMLButtonElement | null>(null);

  /* -- fetch updates ----------------------------------------------------- */

  const refresh = useCallback(async (): Promise<void> => {
    try {
      const list = await listUpdates({ deckId });
      setUpdates(list);
      setNow(Date.now());
    } catch {
      // Swallow — the badge always renders something useful, even stale.
    }
  }, [deckId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (paused) return undefined;
    const id = setInterval(() => void refresh(), pollIntervalMs);
    return (): void => clearInterval(id);
  }, [paused, pollIntervalMs, refresh]);

  /* -- tick clock so the "X ago" stays fresh ----------------------------- */

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 15_000);
    return (): void => clearInterval(id);
  }, []);

  /* -- close menu on outside click --------------------------------------- */

  useEffect(() => {
    if (!menuOpen) return undefined;
    const handler = (e: MouseEvent): void => {
      if (
        menuRef.current &&
        !menuRef.current.contains(e.target as Node) &&
        badgeRef.current &&
        !badgeRef.current.contains(e.target as Node)
      ) {
        setMenuOpen(false);
        setPopoverOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return (): void => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  /* -- derived ------------------------------------------------------------ */

  const lastRefreshMs = useMemo<number | undefined>(() => {
    for (const u of updates) {
      if (isRefreshEvent(u)) return u.timestamp_ms;
    }
    return updates[0]?.timestamp_ms;
  }, [updates]);

  const refreshHistory = useMemo<readonly LivingUpdate[]>(
    () =>
      updates
        .filter(isRefreshEvent)
        .slice()
        .sort((a, b) => b.timestamp_ms - a.timestamp_ms)
        .slice(0, HISTORY_PREVIEW_LIMIT),
    [updates],
  );

  /* -- handlers ----------------------------------------------------------- */

  const handleRefreshNow = useCallback(async (): Promise<void> => {
    setBusy(true);
    try {
      await triggerRefresh(deckId);
      await refresh();
      onRefresh?.();
    } finally {
      setBusy(false);
      setMenuOpen(false);
      setPopoverOpen(false);
    }
  }, [deckId, refresh, onRefresh]);

  const handleTogglePause = useCallback((): void => {
    setPaused((prev) => {
      const next = !prev;
      onPauseChange?.(next);
      return next;
    });
  }, [onPauseChange]);

  const handleTogglePopover = useCallback((): void => {
    setPopoverOpen((prev) => !prev);
  }, []);

  /* -- render ------------------------------------------------------------- */

  const timeAgo = lastRefreshMs !== undefined ? formatRelative(lastRefreshMs, now) : null;

  return (
    <div
      data-testid={dataTestId}
      aria-label="Living deck status"
      style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 8 }}
    >
      <button
        ref={badgeRef}
        type="button"
        data-testid={`${dataTestId}-trigger`}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        onClick={() => setMenuOpen((prev) => !prev)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: '4px 10px',
          border: '1px solid rgba(0,0,0,0.12)',
          borderRadius: 999,
          background: '#fff',
          cursor: 'pointer',
          fontSize: 12,
          color: '#111',
        }}
      >
        <span
          data-testid={`${dataTestId}-dot`}
          aria-hidden
          style={{
            display: 'inline-block',
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: paused ? '#9ca3af' : '#22c55e',
            boxShadow: paused ? 'none' : '0 0 0 0 rgba(34,197,94,0.6)',
            animation: paused ? 'none' : 'living-pulse 1.6s infinite',
          }}
        />
        {timeAgo === null ? (
          <FormattedMessage id="editor.living.badge.justNow" />
        ) : (
          <FormattedMessage
            id="editor.living.badge.lastRefreshed"
            values={{ time_ago: timeAgo }}
          />
        )}
      </button>

      {menuOpen ? (
        <div
          ref={menuRef}
          role="menu"
          data-testid={`${dataTestId}-menu`}
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            right: 0,
            minWidth: 200,
            background: '#fff',
            border: '1px solid rgba(0,0,0,0.12)',
            borderRadius: 6,
            boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
            padding: 4,
            zIndex: 50,
          }}
        >
          <button
            type="button"
            role="menuitem"
            data-testid={`${dataTestId}-refresh-now`}
            disabled={busy}
            onClick={() => void handleRefreshNow()}
            style={menuItemStyle}
          >
            <FormattedMessage id="editor.living.badge.refreshNow" />
          </button>
          <button
            type="button"
            role="menuitem"
            data-testid={`${dataTestId}-toggle-pause`}
            onClick={handleTogglePause}
            style={menuItemStyle}
          >
            <FormattedMessage
              id={paused ? 'editor.living.badge.resumeAuto' : 'editor.living.badge.pauseAuto'}
            />
          </button>
          <button
            type="button"
            role="menuitem"
            data-testid={`${dataTestId}-view-history`}
            onClick={handleTogglePopover}
            aria-expanded={popoverOpen}
            style={menuItemStyle}
          >
            <FormattedMessage id="editor.living.badge.viewHistory" />
          </button>

          {popoverOpen ? (
            <div
              data-testid={`${dataTestId}-history`}
              role="dialog"
              aria-label="Refresh history"
              style={{
                marginTop: 4,
                borderTop: '1px solid rgba(0,0,0,0.08)',
                paddingTop: 4,
                maxHeight: 260,
                overflowY: 'auto',
              }}
            >
              {refreshHistory.length === 0 ? (
                <div style={{ padding: 8, fontSize: 12, color: '#6b7280' }}>
                  <FormattedMessage id="editor.living.stream.empty" />
                </div>
              ) : (
                <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                  {refreshHistory.map((u) => (
                    <li
                      key={u.id}
                      data-testid={`${dataTestId}-history-row`}
                      style={{
                        padding: '6px 8px',
                        fontSize: 12,
                        borderBottom: '1px solid rgba(0,0,0,0.04)',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                        <span style={{ fontWeight: 500 }}>{u.actor.name}</span>
                        <span style={{ color: '#6b7280' }}>
                          {formatRelative(u.timestamp_ms, now)}
                        </span>
                      </div>
                      <div style={{ color: '#374151', marginTop: 2 }}>{u.summary}</div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}
        </div>
      ) : null}

      <style>{`
        @keyframes living-pulse {
          0%   { box-shadow: 0 0 0 0 rgba(34,197,94,0.55); }
          70%  { box-shadow: 0 0 0 8px rgba(34,197,94,0); }
          100% { box-shadow: 0 0 0 0 rgba(34,197,94,0); }
        }
      `}</style>
    </div>
  );
}

const menuItemStyle: React.CSSProperties = {
  display: 'block',
  width: '100%',
  textAlign: 'left',
  background: 'transparent',
  border: 0,
  padding: '8px 10px',
  borderRadius: 4,
  cursor: 'pointer',
  fontSize: 13,
  color: '#111',
};

export default LivingBadge;
