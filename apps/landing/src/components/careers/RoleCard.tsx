/**
 * RoleCard — single open-role listing.
 *
 * S12.11 — title, department/location/employment badges, a summary, and
 * an Apply CTA that opens the Greenhouse apply URL in a new tab.
 */

import type { JSX } from 'react';
import type { Role } from '../../lib/careers-data';

export interface RoleCardProps {
  readonly role: Role;
}

const DEPARTMENT_LABEL: Record<Role['department'], string> = {
  engineering: 'Engineering',
  design: 'Design',
  product: 'Product',
  'go-to-market': 'Go-to-Market',
  operations: 'Operations',
  finance: 'Finance',
};

const LOCATION_LABEL: Record<Role['location'], string> = {
  remote: 'Remote',
  sf: 'San Francisco',
  nyc: 'New York',
  berlin: 'Berlin',
  singapore: 'Singapore',
};

const EMPLOYMENT_LABEL: Record<Role['employment_type'], string> = {
  full_time: 'Full-time',
  contract: 'Contract',
  intern: 'Intern',
};

const LEVEL_LABEL: Record<Role['level'], string> = {
  junior: 'Junior',
  mid: 'Mid',
  senior: 'Senior',
  staff: 'Staff',
  principal: 'Principal',
};

export function RoleCard({ role }: RoleCardProps): JSX.Element {
  return (
    <article
      className="careers-role-card"
      data-testid="role-card"
      data-role-id={role.id}
      data-department={role.department}
      data-location={role.location}
    >
      <header className="careers-role-card__head">
        <h3 className="careers-role-card__title">{role.title}</h3>
        <ul className="careers-role-card__meta" aria-label="Role metadata">
          <li className="careers-role-card__badge">{DEPARTMENT_LABEL[role.department]}</li>
          <li className="careers-role-card__badge careers-role-card__badge--muted">
            {LOCATION_LABEL[role.location]}
          </li>
          <li className="careers-role-card__badge careers-role-card__badge--muted">
            {LEVEL_LABEL[role.level]}
          </li>
          <li className="careers-role-card__badge careers-role-card__badge--muted">
            {EMPLOYMENT_LABEL[role.employment_type]}
          </li>
        </ul>
      </header>
      <p className="careers-role-card__summary">{role.summary}</p>
      <footer className="careers-role-card__footer">
        <a
          className="careers-role-card__cta"
          href={role.apply_url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Apply for ${role.title} on Greenhouse`}
          data-testid="role-apply"
        >
          Apply on Greenhouse →
        </a>
        <time className="careers-role-card__posted" dateTime={role.posted_at_iso}>
          Posted{' '}
          {new Date(role.posted_at_iso).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          })}
        </time>
      </footer>
    </article>
  );
}

export default RoleCard;
