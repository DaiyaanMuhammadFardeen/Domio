/**
 * TrustClient — client wrapper for the trust page interactive surface.
 *
 * Wave 12 S12.7. The page itself is a server component; this wrapper
 * isolates the only piece that genuinely needs to be client-side: a
 * "Copy PGP fingerprint" button. Everything else ships as static HTML.
 *
 * The component is a thin pass-through that owns the copy state. The
 * badge, residency, contact, and report children are server components
 * re-exported through the trust barrel.
 */

'use client';

import { useState, useEffect, type JSX } from 'react';
import {
  ComplianceBadge,
  ResidencyMap,
  SecurityContact,
  ReportList,
} from '../../components/trust';
import type {
  ComplianceBadge as ComplianceBadgeData,
  ResidencyRegion,
  SecurityReport,
} from '../../lib/trust-data';

export interface TrustClientProps {
  readonly badges: ReadonlyArray<ComplianceBadgeData>;
  readonly regions: ReadonlyArray<ResidencyRegion>;
  readonly reports: ReadonlyArray<SecurityReport>;
  readonly pgpFingerprint: string;
}

function CopyPgpButton({ value }: { value: string }): JSX.Element {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(t);
  }, [copied]);

  const onClick = async (): Promise<void> => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(value);
      }
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <button
      type="button"
      className="trust-contact__copy"
      onClick={onClick}
      aria-label={copied ? 'Fingerprint copied' : 'Copy PGP fingerprint'}
      data-testid="trust-pgp-copy"
    >
      {copied ? 'Copied!' : 'Copy fingerprint'}
    </button>
  );
}

export function TrustClient({
  badges,
  regions,
  reports,
  pgpFingerprint,
}: TrustClientProps): JSX.Element {
  return (
    <div className="trust-page__body">
      <section className="trust-badges" aria-labelledby="trust-badges-heading">
        <h2 id="trust-badges-heading" className="trust-section-heading">
          Compliance posture
        </h2>
        <p className="trust-badges__lede">
          Independent attestations and active programmes. Customers can
          request the underlying reports via the form below.
        </p>
        <ul className="trust-badges__list" data-testid="trust-badges-list">
          {badges.map((badge) => (
            <li key={badge.id} className="trust-badges__item">
              <ComplianceBadge badge={badge} />
            </li>
          ))}
        </ul>
      </section>

      <ResidencyMap regions={regions} />
      <SecurityContact />
      <ReportList reports={reports} />

      <div className="trust-contact__copy-row">
        <CopyPgpButton value={pgpFingerprint} />
      </div>
    </div>
  );
}

export default TrustClient;