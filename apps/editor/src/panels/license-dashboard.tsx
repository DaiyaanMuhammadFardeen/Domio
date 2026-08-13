'use client';

/**
 * LicenseDashboard — Phase 11 license surface for the editor.
 *
 * Lists the active `LicenseGrant`s for the active workspace and
 * shows remaining days / seat usage / revocation status. Phase 11
 * adds 3D model licenses (from `services/registry`); this panel
 * consumes the same model as the marketplace surface.
 *
 * The dashboard is pure presentation; data fetching is injected so
 * tests can run headless.
 */

import { useEffect, useMemo, useState } from 'react';
import type { ReactElement } from 'react';

export interface LicenseGrantView {
  readonly id: string;
  readonly catalogId: string;
  readonly version: string;
  readonly seats: number;
  readonly seatsUsed: number;
  readonly expiresAt: number;
  readonly revokedAt: number | null;
  readonly offlineGraceUntil?: number;
  readonly status: 'active' | 'expiring' | 'expired' | 'revoked';
}

export interface LicenseDashboardProps {
  /** Workspace ID whose grants to display. */
  readonly workspaceId: string;
  /** Injectable data fetcher for tests. */
  readonly fetchGrants: (workspaceId: string) => Promise<readonly LicenseGrantView[]>;
  /** Optional revoke handler — hidden when null. */
  readonly onRevoke?: (grantId: string) => void;
}

const MS_PER_DAY = 86_400_000;
const EXPIRING_WINDOW_DAYS = 14;

function classifyStatus(
  expiresAt: number,
  revokedAt: number | null,
  now: number,
): LicenseGrantView['status'] {
  if (revokedAt !== null) return 'revoked';
  const daysLeft = Math.floor((expiresAt - now) / MS_PER_DAY);
  if (daysLeft < 0) return 'expired';
  if (daysLeft <= EXPIRING_WINDOW_DAYS) return 'expiring';
  return 'active';
}

function toView(grant: LicenseGrantView, now: number): LicenseGrantView {
  return {
    ...grant,
    status: classifyStatus(grant.expiresAt, grant.revokedAt, now),
  };
}

// ─── Component ────────────────────────────────────────────────────────

export function LicenseDashboard({
  workspaceId,
  fetchGrants,
  onRevoke,
}: LicenseDashboardProps): ReactElement {
  const [grants, setGrants] = useState<readonly LicenseGrantView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState<number>(() => Date.now());

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchGrants(workspaceId)
      .then((rows) => {
        if (cancelled) return;
        setGrants(rows);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [workspaceId, fetchGrants]);

  // Tick "now" once a minute so expiring counts update live.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  const views = useMemo(() => grants.map((g) => toView(g, now)), [grants, now]);

  const summary = useMemo(() => {
    const total = views.length;
    const active = views.filter((v) => v.status === 'active').length;
    const expiring = views.filter((v) => v.status === 'expiring').length;
    const expired = views.filter((v) => v.status === 'expired').length;
    const revoked = views.filter((v) => v.status === 'revoked').length;
    return { total, active, expiring, expired, revoked };
  }, [views]);

  if (loading) {
    return (
      <section data-testid="license-dashboard" className="license-dashboard">
        <p data-testid="license-dashboard-loading">Loading…</p>
      </section>
    );
  }

  if (error) {
    return (
      <section data-testid="license-dashboard" className="license-dashboard">
        <p data-testid="license-dashboard-error" role="alert">
          {error}
        </p>
      </section>
    );
  }

  return (
    <section data-testid="license-dashboard" className="license-dashboard">
      <header className="license-dashboard__header">
        <h2>Licenses</h2>
        <p data-testid="license-dashboard-summary">
          {summary.active} active · {summary.expiring} expiring · {summary.expired} expired ·{' '}
          {summary.revoked} revoked
        </p>
      </header>
      <ul className="license-dashboard__list">
        {views.map((g) => {
          const daysLeft = Math.max(0, Math.floor((g.expiresAt - now) / MS_PER_DAY));
          const seatPct = g.seats > 0 ? Math.round((g.seatsUsed / g.seats) * 100) : 0;
          return (
            <li
              key={g.id}
              data-testid={`license-grant-${g.id}`}
              data-status={g.status}
              className={`license-grant license-grant--${g.status}`}
            >
              <div className="license-grant__title">
                <strong>{g.catalogId}</strong>
                <span className="license-grant__version">v{g.version}</span>
              </div>
              <div className="license-grant__meta">
                <span data-testid={`license-grant-${g.id}-seats`}>
                  {g.seatsUsed} / {g.seats} seats ({seatPct}%)
                </span>
                <span data-testid={`license-grant-${g.id}-days`}>
                  {g.status === 'revoked'
                    ? 'Revoked'
                    : g.status === 'expired'
                      ? 'Expired'
                      : `${daysLeft} day${daysLeft === 1 ? '' : 's'} left`}
                </span>
                <span data-testid={`license-grant-${g.id}-status`}>{g.status}</span>
              </div>
              {onRevoke && g.status !== 'revoked' ? (
                <button
                  type="button"
                  onClick={() => onRevoke(g.id)}
                  data-testid={`license-grant-${g.id}-revoke`}
                  className="license-grant__revoke"
                >
                  Revoke
                </button>
              ) : null}
            </li>
          );
        })}
        {views.length === 0 ? (
          <li data-testid="license-dashboard-empty">No licenses on this workspace.</li>
        ) : null}
      </ul>
    </section>
  );
}
