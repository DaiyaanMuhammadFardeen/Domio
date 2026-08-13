/**
 * ReportList — list of available security reports.
 *
 * Wave 12 S12.7. Each row links to a report download or an NDA request
 * flow depending on `requires_nda`. We render the NDA-gated reports with
 * a `rel="nofollow"` and a small label so customers know the request
 * requires a signed agreement before the file is released.
 */

import type { JSX } from 'react';
import type { SecurityReport } from '../../lib/trust-data';

export interface ReportListProps {
  readonly reports: ReadonlyArray<SecurityReport>;
}

export function ReportList({ reports }: ReportListProps): JSX.Element {
  return (
    <section className="trust-reports" aria-labelledby="trust-reports-heading">
      <h2 id="trust-reports-heading" className="trust-section-heading">
        Reports &amp; attestations
      </h2>
      <p className="trust-reports__lede">
        Request audit reports, certifications, and policy templates. Items marked NDA require a
        signed agreement before the file is released.
      </p>

      <ul className="trust-reports__list">
        {reports.map((report) => (
          <li
            key={report.id}
            className="trust-reports__item"
            data-testid="trust-report"
            data-report-id={report.id}
          >
            <div className="trust-reports__head">
              <h3 className="trust-reports__title">{report.title}</h3>
              {report.requires_nda && (
                <span className="trust-reports__pill" data-testid="trust-report-nda">
                  NDA required
                </span>
              )}
            </div>
            <p className="trust-reports__meta">{report.period}</p>
            <a
              href={report.download_url}
              className="trust-reports__link"
              rel={report.requires_nda ? 'nofollow noopener noreferrer' : undefined}
            >
              {report.requires_nda ? 'Request access →' : 'Download ↗'}
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default ReportList;
