/**
 * /services — public service directory.
 *
 * Per Wave 13. Lists every user-facing service grouped by category.
 * Pure backend services and infrastructure (postgres, redis, …) are
 * deliberately excluded; see `services-registry.ts` for the full
 * taxonomy.
 */

import type { Metadata } from 'next';
import type { JSX } from 'react';
import { PageShell } from '../../components/layout/PageShell';
import { ServicesDirectory } from '../../components/services/ServicesDirectory';

export const metadata: Metadata = {
  title: 'Services — Domio',
  description:
    'The complete directory of every Domio backend service, grouped by category. User-facing services have admin pages; pure backend services and infrastructure are intentionally excluded.',
};

export default function ServicesIndexPage(): JSX.Element {
  return (
    <PageShell currentId="services-index" relatedTitle="More from Domio">
      <main className="services-page" data-testid="services-page">
        <header className="services-page__hero">
          <p className="services-page__eyebrow">Services</p>
          <h1 className="services-page__title">Domio service directory</h1>
          <p className="services-page__subtitle">
            Every user-facing service Domio ships: name, dev port, owning
            team, and what it does. Pure backend services (event streams,
            analytics, identity) and infrastructure (Postgres, Redis, NATS)
            are intentionally excluded — they have no UI surface.
          </p>
        </header>

        <ServicesDirectory />
      </main>
    </PageShell>
  );
}