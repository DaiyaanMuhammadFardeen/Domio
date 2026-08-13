/**
 * ComplianceBadge — single compliance posture card.
 *
 * Wave 12 S12.7. Renders one of the badges from `lib/trust-data` (SOC 2,
 * GDPR, CCPA, PDPA, ISO 27001, HIPAA) with a coloured status dot. The
 * `status` colour semantics map directly to the procurement-friendly
 * vocabulary:
 *   - `certified`    → green  — formal attestation complete
 *   - `in_progress`  → amber  — actively being certified
 *   - `planned`      → grey   — roadmap commitment only
 *
 * Pure server component. The icon string is a semantic key — a future
 * Wave can swap in an icon library; for now we render the badge name and
 * the dot, which is sufficient for the trust page hero grid.
 */

import type { JSX } from 'react';
import type { ComplianceBadge as ComplianceBadgeData } from '../../lib/trust-data';

export interface ComplianceBadgeProps {
  readonly badge: ComplianceBadgeData;
}

const STATUS_LABEL: Record<ComplianceBadgeData['status'], string> = {
  certified: 'Certified',
  in_progress: 'In progress',
  planned: 'Planned',
};

export function ComplianceBadge({ badge }: ComplianceBadgeProps): JSX.Element {
  return (
    <article
      className={`trust-badge trust-badge--${badge.status}`}
      data-testid="trust-badge"
      data-badge-id={badge.id}
      data-status={badge.status}
      aria-label={`${badge.name} — ${STATUS_LABEL[badge.status]}`}
    >
      <header className="trust-badge__head">
        <span
          className="trust-badge__dot"
          aria-hidden="true"
          data-status={badge.status}
        />
        <h3 className="trust-badge__name">{badge.name}</h3>
      </header>
      <p className="trust-badge__description">{badge.description}</p>
      <footer className="trust-badge__meta">
        <span className="trust-badge__status" data-status={badge.status}>
          {STATUS_LABEL[badge.status]}
        </span>
      </footer>
    </article>
  );
}

export default ComplianceBadge;
