/**
 * Careers landing page — `/careers`.
 *
 * Wave 12 S12.11. Renders the hero, the filtered list of open roles,
 * the company values, and the benefits grid. The interactive filter
 * is isolated in CareersClient so the rest of the page stays
 * server-rendered.
 */

import type { Metadata } from 'next';
import type { JSX } from 'react';
import { landing } from '@domio/ui';
import CareersClient from './CareersClient';
import { ValuesList } from '../../components/careers/ValuesList';
import { BenefitsGrid } from '../../components/careers/BenefitsGrid';
import { OPEN_ROLES, VALUES, BENEFITS } from '../../lib/careers-data';
import { PageShell } from '../../components/layout/PageShell';

export const metadata: Metadata = {
  title: 'Careers — Domio',
  description:
    'Open roles at Domio. Build the future of interactive presentations with a small, async-first team hiring across engineering, design, product, go-to-market, operations, and finance.',
};

export default function CareersPage(): JSX.Element {
  const greenhouseBoard = 'https://boards.greenhouse.io/domio';
  const rolesAnchor = `${landing('careers')}#open-roles`;

  return (
    <PageShell currentId="careers" relatedTitle="Follow Domio">
      <div className="careers-page">
        <section className="careers-hero" aria-labelledby="careers-hero-heading">
          <div className="careers-hero__inner">
            <p className="careers-hero__eyebrow">Careers at Domio</p>
            <h1 id="careers-hero-heading" className="careers-hero__title">
              Build the future of presentations with us.
            </h1>
            <p className="careers-hero__subtitle">
              We&rsquo;re a small, fully remote team building Domio &mdash; the interactive deck
              platform powering pitches, demos, and live presentations for thousands of teams. We
              hire across engineering, design, product, go-to-market, operations, and finance.
            </p>
            <div className="careers-hero__actions">
              <a
                className="careers-hero__cta careers-hero__cta--primary"
                href={rolesAnchor}
                data-testid="careers-hero-cta"
              >
                See open roles
              </a>
              <a
                className="careers-hero__cta careers-hero__cta--secondary"
                href={greenhouseBoard}
                target="_blank"
                rel="noopener noreferrer"
              >
                Our Greenhouse board →
              </a>
            </div>
          </div>
        </section>

        <div className="careers-page__body">
          <section
            id="open-roles"
            className="careers-roles-section"
            aria-labelledby="careers-roles-heading"
          >
            <h2 id="careers-roles-heading" className="careers-section-heading">
              Open roles
            </h2>
            <CareersClient roles={OPEN_ROLES} />
          </section>

          <ValuesList values={VALUES} />
          <BenefitsGrid benefits={BENEFITS} />

          <section className="careers-cta" aria-labelledby="careers-cta-heading">
            <h2 id="careers-cta-heading" className="careers-cta__heading">
              Don&rsquo;t see the right role?
            </h2>
            <p className="careers-cta__sub">
              We always want to hear from strong generalists. Send a note, your work, and what you
              want to build next.
            </p>
            <div className="careers-cta__actions">
              <a
                className="careers-cta__button careers-cta__button--primary"
                href={`mailto:careers@domio.app?subject=${encodeURIComponent(
                  'General application — Domio Careers',
                )}`}
                data-testid="careers-cta"
              >
                Email careers@domio.app
              </a>
            </div>
          </section>
        </div>
      </div>
    </PageShell>
  );
}
