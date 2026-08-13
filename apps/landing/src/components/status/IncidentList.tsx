/**
 * Recent incidents list.
 *
 * Renders a chronological list of past or active incidents with
 * severity, time window, affected services, and the public
 * summary. Active incidents (resolved_at_ms === null) are
 * surfaced first.
 */

import type { JSX } from 'react';
import type { Incident } from '../../lib/status-types';

const SEVERITY_CLASS: Record<Incident['severity'], string> = {
  minor: 'status-incident__severity--minor',
  major: 'status-incident__severity--major',
  critical: 'status-incident__severity--critical',
};

function formatDate(ms: number): string {
  // Avoid timezone surprises in the marketing surface by
  // formatting in UTC explicitly.
  const d = new Date(ms);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mi = String(d.getUTCMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${mi} UTC`;
}

function durationLabel(start: number, end: number | null): string {
  if (end === null) return 'ongoing';
  const minutes = Math.max(1, Math.round((end - start) / 60000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remMin = minutes % 60;
  return remMin === 0 ? `${hours} h` : `${hours} h ${remMin} min`;
}

export interface IncidentListProps {
  readonly incidents: ReadonlyArray<Incident>;
}

export function IncidentList({ incidents }: IncidentListProps): JSX.Element {
  // Active first, then most recently resolved.
  const ordered = [...incidents].sort((a, b) => {
    if (a.resolved_at_ms === null && b.resolved_at_ms !== null) return -1;
    if (a.resolved_at_ms !== null && b.resolved_at_ms === null) return 1;
    return b.started_at_ms - a.started_at_ms;
  });

  if (ordered.length === 0) {
    return (
      <section
        className="status-incidents"
        aria-labelledby="status-incidents-heading"
      >
        <h2 id="status-incidents-heading">Recent incidents</h2>
        <p className="status-incidents__empty">
          No incidents in the past 90 days.
        </p>
      </section>
    );
  }

  return (
    <section
      className="status-incidents"
      aria-labelledby="status-incidents-heading"
    >
      <h2 id="status-incidents-heading">Recent incidents</h2>
      <ul className="status-incidents__list">
        {ordered.map((inc) => {
          const active = inc.resolved_at_ms === null;
          return (
            <li
              key={inc.id}
              className={
                'status-incident' + (active ? ' status-incident--active' : '')
              }
            >
              <header className="status-incident__head">
                <span
                  className={`status-incident__severity ${SEVERITY_CLASS[inc.severity]}`}
                >
                  {inc.severity}
                </span>
                <h3 className="status-incident__title">{inc.title}</h3>
                {active ? (
                  <span className="status-incident__state status-incident__state--active">
                    Active
                  </span>
                ) : null}
              </header>
              <p className="status-incident__meta">
                <span>{formatDate(inc.started_at_ms)}</span>
                <span aria-hidden="true"> → </span>
                <span>
                  {inc.resolved_at_ms === null
                    ? 'now'
                    : formatDate(inc.resolved_at_ms)}
                </span>
                <span aria-hidden="true"> · </span>
                <span>{durationLabel(inc.started_at_ms, inc.resolved_at_ms)}</span>
              </p>
              <p className="status-incident__services">
                Affected: {inc.affected_services.join(', ')}
              </p>
              <p className="status-incident__summary">{inc.summary}</p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export default IncidentList;
