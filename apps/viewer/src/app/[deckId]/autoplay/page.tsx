/**
 * `/[deckId]/autoplay` — narrated auto-play variant of the viewer.
 *
 * Per Wave 3 §S3.7 of docs/frontend-roadmap/03-wave-viewer-publishing.md.
 *
 * Thin server component that resolves the deck and hands it to
 * `ViewerShell` with `initialMode='autoplay'`. The shell then
 * renders `AutoPlayMode` instead of stage/scroll chrome.
 */

import type { Metadata } from 'next';
import type { ReactElement } from 'react';
import { fetchViewerDeck } from '../../../lib/deck-service';
import { bootstrapSeoForDeck } from '../../../lib/seo-service';
import { ViewerShell } from '../../../components/ViewerShell';

export interface AutoplayPageProps {
  readonly params: Promise<{ deckId: string }>;
}

export async function generateMetadata({ params }: AutoplayPageProps): Promise<Metadata> {
  const { deckId } = await params;
  const { deck } = await fetchViewerDeck(deckId);
  const seo = await bootstrapSeoForDeck(deckId, deck.title);
  return {
    title: `${seo.title} (autoplay)`,
    description: seo.description,
    alternates: { canonical: seo.canonicalUrl },
  };
}

export default async function AutoplayDeckPage({ params }: AutoplayPageProps): Promise<ReactElement> {
  const { deckId } = await params;
  const { deck } = await fetchViewerDeck(deckId);
  return (
    <ViewerShell
      deck={deck}
      initialIdx={0}
      initialMode="autoplay"
      dataTestId={`viewer-${deckId}-autoplay`}
    />
  );
}