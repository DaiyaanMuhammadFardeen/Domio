/**
 * Trust & security page — `/trust`.
 *
 * Wave 12 S12.7. Drives procurement teams from "do you have SOC 2?" to
 * "I have your DPA in my inbox". The page surfaces compliance badges,
 * a data residency map, the security contact (PGP + bug bounty), and
 * the catalogue of available audit reports.
 *
 * The page is a server component; the only client island is the
 * `TrustClient` wrapper which owns the "Copy PGP fingerprint" button.
 */

import type { Metadata } from 'next';
import type { JSX } from 'react';

const ENTERPRISE_HREF = '/contact?topic=enterprise';
import {
  COMPLIANCE_BADGES,
  RESIDENCY_REGIONS,
  SECURITY_REPORTS,
  SECURITY_CONTACT,
} from '../../lib/trust-data';
import TrustClient from './TrustClient';
import { PageShell } from '../../components/layout/PageShell';

export const metadata: Metadata = {
  title: 'Trust & security — Domio',
  description:
    'Domio compliance posture, data residency options, security contact, and available audit reports. SOC 2 Type II, GDPR, CCPA, PDPA.',
};

export default function TrustLandingPage(): JSX.Element {
  const enterpriseHref = ENTERPRISE_HREF;

  return (
    <PageShell currentId="trust" relatedTitle="Stay informed">
      <div className="trust-page">
        <section className="trust-hero" aria-labelledby="trust-hero-heading">
          <div className="trust-hero__inner">
            <p className="trust-hero__eyebrow">Trust &amp; security</p>
            <h1 id="trust-hero-heading" className="trust-hero__title">
              Built for procurement review
            </h1>
            <p className="trust-hero__subtitle">
              Independent attestations, region-pinned data, and a security team that responds within
              a business day. Everything you need to clear vendor review is below.
            </p>
          </div>
        </section>

        <TrustClient
          badges={COMPLIANCE_BADGES}
          regions={RESIDENCY_REGIONS}
          reports={SECURITY_REPORTS}
          pgpFingerprint={SECURITY_CONTACT.pgp_fingerprint}
        />

        <section className="trust-cta" aria-labelledby="trust-cta-heading">
          <h2 id="trust-cta-heading" className="trust-cta__heading">
            Need a signed DPA or BAA?
          </h2>
          <p className="trust-cta__sub">
            Our enterprise team will route your request to legal and turn around a counter-signed
            agreement within five business days.
          </p>
          <div className="trust-cta__actions">
            <a className="trust-cta__button trust-cta__button--primary" href={enterpriseHref}>
              Talk to enterprise →
            </a>
            <a
              className="trust-cta__button trust-cta__button--secondary"
              href={`mailto:${SECURITY_CONTACT.email}`}
            >
              Email security
            </a>
          </div>
        </section>
      </div>
    </PageShell>
  );
}
