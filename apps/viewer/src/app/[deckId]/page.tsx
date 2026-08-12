/**
 * `/[deckId]` — viewer entry route. Resolves to the deck's first slide
 * (or a cover if configured) and renders `<ViewerShell>`.
 *
 * Per Wave 3 §S3.1 of docs/frontend-roadmap/03-wave-viewer-publishing.md.
 *
 * The shell does the heavy lifting: this route is intentionally thin so
 * SEO meta + server-rendered fallback bodies stay easy to read.
 */

import type { Metadata } from 'next';
import type { ReactElement } from 'react';
import { fetchViewerDeck } from '../../lib/deck-service';
import { bootstrapSeoForDeck } from '../../lib/seo-service';
import { ViewerShell } from '../../components/ViewerShell';

export interface DeckPageProps {
  readonly params: Promise<{ deckId: string }>;
  readonly searchParams: Promise<{ mode?: string; share?: string }>;
}

export async function generateMetadata({ params }: DeckPageProps): Promise<Metadata> {
  const { deckId } = await params;
  const { deck } = await fetchViewerDeck(deckId);
  const seo = await bootstrapSeoForDeck(deckId, deck.title);
  return {
    title: seo.title,
    description: seo.description,
    openGraph: {
      title: seo.title,
      description: seo.description,
      url: seo.canonicalUrl,
      siteName: seo.siteName,
      images: seo.ogImageUrl ? [{ url: seo.ogImageUrl }] : undefined,
    },
    twitter: {
      card: seo.twitterCard ?? 'summary_large_image',
      title: seo.title,
      description: seo.description,
      images: seo.ogImageUrl ? [seo.ogImageUrl] : undefined,
    },
    alternates: {
      canonical: seo.canonicalUrl,
    },
    robots: seo.robots ?? 'index,follow',
  };
}

export default async function DeckPage({ params, searchParams }: DeckPageProps): Promise<ReactElement> {
  const { deckId } = await params;
  const { mode: modeParam, share } = await searchParams;
  const { deck } = await fetchViewerDeck(deckId);
  const initialMode = modeParam === 'scroll' ? 'scroll' : 'stage';
  return (
    <ViewerShell
      deck={deck}
      initialMode={initialMode}
      {...(share ? { watermark: `viewer:${share}` } : {})}
      dataTestId={`viewer-${deckId}`}
    />
  );
}