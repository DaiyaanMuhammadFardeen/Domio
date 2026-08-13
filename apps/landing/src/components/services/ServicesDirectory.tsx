/**
 * ServicesDirectory — the public service directory surface.
 *
 * Per Wave 13. Lists every user-facing service grouped by category.
 * Pure backend services and infrastructure (postgres, redis, etc.)
 * are deliberately excluded — they have no link target.
 *
 * The component is a server component (no client state). The list
 * comes from `services-registry.ts`.
 */

import type { JSX } from 'react';
import {
  userFacingByCategory,
  type ServiceCategory,
} from '../../lib/services-registry';
import { ServiceCard } from './ServiceCard';

const CATEGORY_LABELS: Readonly<Record<ServiceCategory, string>> = {
  design: 'Design',
  platform: 'Platform',
  ml: 'Machine learning',
  marketplace: 'Marketplace',
  qa: 'Quality assurance',
  engagement: 'Audience engagement',
  analytics: 'Analytics',
  realtime: 'Real-time',
  auth: 'Identity',
  integration: 'Integrations',
  content: 'Content',
  support: 'Support',
  infra: 'Infrastructure',
  backend: 'Backend',
};

export function ServicesDirectory(): JSX.Element {
  const groups = userFacingByCategory();
  return (
    <div className="services-directory" data-testid="services-directory">
      {groups.map((group) => (
        <section
          key={group.category}
          className="services-directory__group"
          aria-labelledby={`services-group-${group.category}`}
          data-testid={`services-group-${group.category}`}
        >
          <h2
            id={`services-group-${group.category}`}
            className="services-directory__heading"
          >
            {CATEGORY_LABELS[group.category]}
          </h2>
          <ul className="services-directory__list">
            {group.services.map((svc) => (
              <li key={svc.id} className="services-directory__item">
                <ServiceCard service={svc} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

export default ServicesDirectory;