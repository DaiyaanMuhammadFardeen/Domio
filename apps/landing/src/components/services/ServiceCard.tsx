/**
 * ServiceCard — single row/card for the public service directory.
 *
 * Per Wave 13. Renders a service's name, port badge, description, and
 * a "View service" CTA pointing at `/services/<id>`. Pure presentation
 * (server-rendered).
 */

import type { JSX } from 'react';
import type { UserFacingService } from '../../lib/services-registry';

export interface ServiceCardProps {
  readonly service: UserFacingService;
}

export function ServiceCard({ service }: ServiceCardProps): JSX.Element {
  const detailHref = `/services/${encodeURIComponent(service.id)}`;
  const docsHref = `/docs/${service.docsSlug}`;
  return (
    <article className="service-card" data-testid="service-card" data-service-id={service.id}>
      <header className="service-card__header">
        <h3 className="service-card__name">{service.name}</h3>
        <span className="service-card__port" aria-label={`Dev port ${service.port}`}>
          :{service.port}
        </span>
      </header>
      <p className="service-card__description">{service.description}</p>
      <footer className="service-card__footer">
        <a
          className="service-card__cta"
          href={detailHref}
          data-testid={`service-card-cta-${service.id}`}
        >
          View service →
        </a>
        <a
          className="service-card__docs"
          href={docsHref}
          data-testid={`service-card-docs-${service.id}`}
        >
          Docs
        </a>
      </footer>
    </article>
  );
}

export default ServiceCard;
