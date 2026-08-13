/**
 * Changelog landing page — `/changelog`.
 *
 * Wave 12 §S12.5 — lists Domio releases newest-first. Each entry
 * shows version, release date, highlights, optional fixes, and a
 * distinct breaking-changes block when present. The page is a server
 * component so the catalog is in the initial HTML payload; the
 * category filter ships as a small client island via
 * `ChangelogClient`.
 */

import type { Metadata } from 'next';
import type { JSX } from 'react';
import { landing } from '@domio/ui';
import { CHANGELOG } from '../../lib/changelog-data';
import ChangelogClient from './ChangelogClient';
import { PageShell } from '../../components/layout/PageShell';

export const metadata: Metadata = {
  title: 'Changelog — Domio',
  description:
    'Every release of Domio — new features, fixes, breaking changes, and migration guides.',
};

export default function ChangelogPage(): JSX.Element {
  const rssHref = '/changelog/feed.xml';
  const docsMigrationsHref = landing('docs', { slug: 'migrations' });

  return (
    <PageShell currentId="changelog" relatedTitle="Stay informed">
      <div className="cl-page" data-testid="changelog-page">
        <section className="cl-hero" aria-labelledby="cl-hero-heading">
          <div className="cl-hero__inner">
            <p className="cl-hero__eyebrow">Changelog</p>
            <h1 id="cl-hero-heading" className="cl-hero__title">
              What&rsquo;s new in Domio
            </h1>
            <p className="cl-hero__subtitle">
              Every release, newest first. Filter by category, watch for breaking changes, and
              follow the migration guide when it&rsquo;s time to upgrade.
            </p>
            <div className="cl-hero__meta">
              <span className="cl-hero__badge">{CHANGELOG.length} releases</span>
              <a className="cl-hero__rss" href={rssHref} aria-label="Changelog RSS feed">
                RSS
              </a>
            </div>
          </div>
        </section>

        <ChangelogClient entries={CHANGELOG} />

        <section className="cl-cta" aria-labelledby="cl-cta-heading">
          <h2 id="cl-cta-heading" className="cl-cta__heading">
            Upgrading an older version?
          </h2>
          <p className="cl-cta__sub">
            The migration index walks through every breaking change since v1.0 and includes
            migration scripts for the CLI.
          </p>
          <a className="cl-cta__button" href={docsMigrationsHref}>
            Read the migration index →
          </a>
        </section>
      </div>
    </PageShell>
  );
}
