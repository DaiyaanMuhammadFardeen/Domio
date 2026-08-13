/**
 * Feature deep-dive page — `/features/[slug]`.
 *
 * Wave 12 §S12.2. One page per major feature. The page is server-
 * rendered, calls `notFound()` for unknown slugs, and uses
 * `generateStaticParams` to pre-render every known slug at build
 * time.
 *
 * Sections (top to bottom):
 *   1. Hero — title, tagline, illustration, primary CTA
 *   2. GifDemo — 30-second animated demo placeholder
 *   3. TutorialSteps — walkthrough with screenshots
 *   4. RelatedFeatures — cross-link to other features
 *   5. Bottom CTA — "Try it now" → /signup?feature=<slug>
 *
 * Note: Next.js 15 passes `params` as a Promise, so we destructure
 * with `await` before reading the slug.
 */

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import type { JSX } from 'react';
import { Hero } from '../../../components/feature-page/Hero';
import { GifDemo } from '../../../components/feature-page/GifDemo';
import { TutorialSteps } from '../../../components/feature-page/TutorialSteps';
import { FeaturePageClient } from './FeaturePageClient';
import { BreadcrumbsShell } from '../../../components/layout/BreadcrumbsShell';
import { getFeature, listAllFeatures } from '../../../lib/feature-catalog';
import { landingNodeById } from '../../../lib/nav-sitemap';
import { relatedFor } from '@domio/ui';
import { RelatedLinks } from '@domio/ui';

interface FeaturePageParams {
  readonly slug: string;
}

export interface FeaturePageProps {
  readonly params: Promise<FeaturePageParams>;
}

export function generateStaticParams(): Array<FeaturePageParams> {
  return listAllFeatures().map((feature) => ({ slug: feature.slug }));
}

export async function generateMetadata({ params }: FeaturePageProps): Promise<Metadata> {
  const { slug } = await params;
  const feature = getFeature(slug);
  if (!feature) {
    return {
      title: 'Feature not found — Domio',
      description: 'The feature you requested could not be found.',
    };
  }
  return {
    title: `${feature.title} — Domio`,
    description: feature.hero_description,
  };
}

export default async function FeaturePage({ params }: FeaturePageProps): Promise<JSX.Element> {
  const { slug } = await params;
  const feature = getFeature(slug);
  if (!feature) {
    notFound();
  }

  // Resolve related nodes via the global nav-graph: siblings (other
  // features in the same category) + seeAlso (docs, services).
  const nodeId = `feature-${feature.slug}`;
  const node = landingNodeById(nodeId);
  const related = node ? relatedFor(node) : [];

  const body = (
    <>
      <Hero feature={feature} />
      <GifDemo slug={feature.slug} title={feature.title} description={feature.tagline} />
      <TutorialSteps feature={feature} />
      <RelatedLinks
        items={related}
        title="Related features"
        className="fp-related"
        testId="fp-related"
      />
      <section className="fp-bottom-cta" aria-label="Get started" data-testid="fp-bottom-cta">
        <h2 className="fp-bottom-cta__heading">Ready to try {feature.title}?</h2>
        <p className="fp-bottom-cta__sub">{feature.tagline}</p>
        <a
          className="fp-bottom-cta__button"
          href={`/signup?feature=${encodeURIComponent(feature.slug)}`}
          data-testid="fp-bottom-cta-button"
        >
          Try it now →
        </a>
      </section>
    </>
  );

  return (
    <main className="fp-main" data-testid="fp-page" data-slug={feature.slug}>
      <BreadcrumbsShell currentId={nodeId}>
        <FeaturePageClient feature={feature}>{body}</FeaturePageClient>
      </BreadcrumbsShell>
    </main>
  );
}
