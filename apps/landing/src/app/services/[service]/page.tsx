/**
 * /services/[service] — auto-generated stub page for a single service.
 *
 * Per Wave 13. Content is derived from `services-registry.ts` +
 * `services-docs.ts`. Pure infrastructure services (postgres, redis,
 * etc.) 404 here by design.
 */

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import type { JSX } from 'react';
import { PageShell } from '../../../components/layout/PageShell';
import {
  USER_FACING_SERVICES,
} from '../../../lib/services-registry';
import { buildServiceDoc } from '../../../lib/services-docs';

interface ServicePageParams {
  readonly service: string;
}

interface ServicePageProps {
  readonly params: Promise<ServicePageParams>;
}

export function generateStaticParams(): Array<ServicePageParams> {
  return USER_FACING_SERVICES.map((svc) => ({ service: svc.id }));
}

export async function generateMetadata({
  params,
}: ServicePageProps): Promise<Metadata> {
  const resolved = await params;
  const doc = buildServiceDoc(resolved.service);
  if (!doc) {
    return {
      title: 'Service not found — Domio',
      description: 'The service you requested could not be found.',
    };
  }
  return {
    title: `${doc.service.name} — Domio services`,
    description: doc.service.description,
  };
}

export default async function ServiceDetailPage({
  params,
}: ServicePageProps): Promise<JSX.Element> {
  const resolved = await params;
  const doc = buildServiceDoc(resolved.service);
  if (!doc) {
    notFound();
  }

  return (
    <PageShell currentId="services-index" relatedTitle="Other services">
      <main
        className="service-detail"
        data-testid="service-detail"
        data-service-id={doc.service.id}
      >
        <header className="service-detail__hero">
          <p className="service-detail__eyebrow">Service</p>
          <h1 className="service-detail__name">{doc.service.name}</h1>
          <span className="service-detail__port">:{doc.service.port}</span>
          <p className="service-detail__summary">{doc.summary}</p>
        </header>

        <section
          className="service-detail__section"
          aria-labelledby="service-detail-meta"
        >
          <h2 id="service-detail-meta" className="service-detail__heading">
            Metadata
          </h2>
          <dl className="service-detail__meta">
            <div className="service-detail__meta-row">
              <dt>Dev port</dt>
              <dd>:{doc.service.port}</dd>
            </div>
            <div className="service-detail__meta-row">
              <dt>Owners</dt>
              <dd>{doc.ownersLabel}</dd>
            </div>
            <div className="service-detail__meta-row">
              <dt>Consumers</dt>
              <dd>{doc.consumersLabel}</dd>
            </div>
            <div className="service-detail__meta-row">
              <dt>Documentation</dt>
              <dd>
                <a href={doc.docsHref}>{doc.docsHref}</a>
              </dd>
            </div>
            <div className="service-detail__meta-row">
              <dt>Category</dt>
              <dd>{doc.service.category}</dd>
            </div>
          </dl>
        </section>

        <section
          className="service-detail__section"
          aria-labelledby="service-detail-api"
        >
          <h2 id="service-detail-api" className="service-detail__heading">
            API surface
          </h2>
          <ul className="service-detail__api">
            {doc.apiSurface.map((endpoint) => (
              <li key={endpoint} className="service-detail__api-item">
                <code>{endpoint}</code>
              </li>
            ))}
          </ul>
        </section>

        <section
          className="service-detail__section"
          aria-labelledby="service-detail-runbook"
        >
          <h2 id="service-detail-runbook" className="service-detail__heading">
            Runbook
          </h2>
          <ol className="service-detail__runbook">
            {doc.runbookSteps.map((step, idx) => (
              <li key={idx} className="service-detail__runbook-step">
                {step}
              </li>
            ))}
          </ol>
        </section>
      </main>
    </PageShell>
  );
}