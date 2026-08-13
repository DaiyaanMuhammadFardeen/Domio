'use client';

/**
 * LatencyMonitor — table of per-region audience latency, packet loss,
 * and sync status.
 *
 * Per Wave 11 §S11.9 of docs/frontend-roadmap/11-wave-novel-frontier.md.
 *
 * Behaviour:
 *   - Polls every 2 seconds (per spec). The 2s cadence is exposed as
 *     a `pollMs` prop for tests / storybook.
 *   - Renders a row per region with: region name, latency (ms),
 *     packet loss (%), and a coloured status pill (synced / lagging /
 *     disconnected).
 *   - On network errors the previous values are kept (with a small
 *     "stale" indicator) so the panel never goes blank.
 */

import { useCallback, useEffect, useState, type ReactElement } from 'react';
import { listRegionLatencies, type RegionLatency, type RegionSyncStatus } from '../../lib/co-presenting-service';

export interface LatencyMonitorProps {
  sessionId: string;
  /** Polling interval (ms). Default 2000 per §S11.9. */
  pollMs?: number;
  readonly labels?: Partial<{
    heading: string;
    colRegion: string;
    colLatency: string;
    colLoss: string;
    colStatus: string;
    statusSynced: string;
    statusLagging: string;
    statusDisconnected: string;
  }>;
  readonly dataTestId?: string;
}

const DEFAULT_LABELS: Required<NonNullable<LatencyMonitorProps['labels']>> = {
  heading: 'Latency by region',
  colRegion: 'Region',
  colLatency: 'Latency',
  colLoss: 'Packet loss',
  colStatus: 'Status',
  statusSynced: 'Synced',
  statusLagging: 'Lagging',
  statusDisconnected: 'Disconnected',
};

function statusLabel(s: RegionSyncStatus, labels: { synced: string; lagging: string; disconnected: string }): string {
  switch (s) {
    case 'synced':       return labels.synced;
    case 'lagging':      return labels.lagging;
    case 'disconnected': return labels.disconnected;
  }
}

function statusClass(s: RegionSyncStatus): string {
  switch (s) {
    case 'synced':       return 'latency-monitor__pill--synced';
    case 'lagging':      return 'latency-monitor__pill--lagging';
    case 'disconnected': return 'latency-monitor__pill--disconnected';
  }
}

export function LatencyMonitor({
  sessionId,
  pollMs = 2000,
  labels,
  dataTestId = 'latency-monitor',
}: LatencyMonitorProps): ReactElement {
  const t = { ...DEFAULT_LABELS, ...(labels ?? {}) };
  const [rows, setRows] = useState<RegionLatency[]>([]);
  const [stale, setStale] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const next = await listRegionLatencies(sessionId);
      setRows(next);
      setStale(false);
    } catch {
      setStale(true);
    }
  }, [sessionId]);

  useEffect(() => {
    void refresh();
    const id = setInterval(() => {
      void refresh();
    }, pollMs);
    return () => clearInterval(id);
  }, [pollMs, refresh]);

  return (
    <section
      className={`latency-monitor ${stale ? 'latency-monitor--stale' : ''}`}
      aria-label={t.heading}
      data-testid={dataTestId}
    >
      <header className="latency-monitor__header">
        <h3 className="latency-monitor__title">{t.heading}</h3>
        {stale && <span className="latency-monitor__stale" data-testid={`${dataTestId}-stale`}>stale</span>}
      </header>
      <table className="latency-monitor__table">
        <thead>
          <tr>
            <th scope="col">{t.colRegion}</th>
            <th scope="col">{t.colLatency}</th>
            <th scope="col">{t.colLoss}</th>
            <th scope="col">{t.colStatus}</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={4} className="latency-monitor__empty">—</td>
            </tr>
          )}
          {rows.map((r) => (
            <tr
              key={r.region}
              data-testid={`${dataTestId}-row`}
              data-region={r.region}
              data-status={r.status}
            >
              <td>{r.region}</td>
              <td className="latency-monitor__num" data-testid={`${dataTestId}-latency`}>
                {Number.isFinite(r.latency_ms) ? `${r.latency_ms} ms` : '—'}
              </td>
              <td className="latency-monitor__num" data-testid={`${dataTestId}-loss`}>
                {r.packet_loss_pct.toFixed(1)}%
              </td>
              <td>
                <span
                  className={`latency-monitor__pill ${statusClass(r.status)}`}
                  data-testid={`${dataTestId}-status`}
                >
                  {statusLabel(r.status, {
                    synced: t.statusSynced,
                    lagging: t.statusLagging,
                    disconnected: t.statusDisconnected,
                  })}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
