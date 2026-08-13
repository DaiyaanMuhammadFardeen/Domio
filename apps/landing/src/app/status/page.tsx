/**
 * Public status page (Wave 12 §S12.8).
 *
 * Server-renders the latest `StatusSnapshot` and hands the
 * interactive subscribe form to a thin client component. The
 * `fetchStatus()` helper gracefully falls back to a deterministic
 * seed if the `/v1/status` endpoint is unreachable, so the page
 * never renders an empty state in production.
 */

import type { Metadata } from 'next';
import type { JSX } from 'react';
import { ServiceRow } from '../../components/status/ServiceRow';
import { IncidentList } from '../../components/status/IncidentList';
import { StatusClient } from './StatusClient';
import { fetchStatus } from '../../lib/status-service';
import type { ServiceHealth } from '../../lib/status-types';
import { PageShell } from '../../components/layout/PageShell';

export const metadata: Metadata = {
  title: 'Domio Status',
  description:
    'Real-time and historical availability for every Domio service — Editor, Viewer, Presenter, Realtime, Analytics, Marketplace, Auth, and AI Copilot.',
};

const OVERALL_LABEL: Record<ServiceHealth, string> = {
  operational: 'All systems operational',
  degraded: 'Some systems degraded',
  partial_outage: 'Partial outage in progress',
  major_outage: 'Major outage in progress',
  maintenance: 'Maintenance in progress',
};

const OVERALL_CLASS: Record<ServiceHealth, string> = {
  operational: 'status-banner--ok',
  degraded: 'status-banner--degraded',
  partial_outage: 'status-banner--partial',
  major_outage: 'status-banner--outage',
  maintenance: 'status-banner--maintenance',
};

function formatFetchedAt(ms: number): string {
  const d = new Date(ms);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mi = String(d.getUTCMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${mi} UTC`;
}

export default async function StatusPage(): Promise<JSX.Element> {
  const snapshot = await fetchStatus();

  return (
    <PageShell currentId="status" relatedTitle="Check before you ship">
      <main className="status-page">
        <header className="status-hero" aria-labelledby="status-hero-heading">
          <p className="status-hero__eyebrow">System status</p>
          <h1 id="status-hero-heading" className="status-hero__title">
            Domio service status
          </h1>
          <p className="status-hero__sub">
            Live availability for every public Domio service. We refresh this
            page every minute; subscribe below to be notified by email when an
            incident opens or resolves.
          </p>
        </header>

        <section
          className={`status-banner ${OVERALL_CLASS[snapshot.overall]}`}
          data-testid="status-banner"
          aria-live="polite"
        >
          <span className="status-banner__dot" aria-hidden="true" />
          <span className="status-banner__label">
            {OVERALL_LABEL[snapshot.overall]}
          </span>
          <span className="status-banner__fetched">
            Last updated {formatFetchedAt(snapshot.fetched_at_ms)}
          </span>
        </section>

        <section
          className="status-services"
          aria-labelledby="status-services-heading"
        >
          <h2 id="status-services-heading">Services</h2>
          <ul className="status-services__list">
            {snapshot.services.map((svc) => (
              <ServiceRow key={svc.id} service={svc} />
            ))}
          </ul>
        </section>

        <IncidentList incidents={snapshot.incidents} />

        <StatusClient statusEndpoint="/v1/status" />
      </main>
    </PageShell>
  );
}
