/**
 * `/[deckId]/scroll` — scrollytelling variant of the viewer.
 *
 * Per Wave 3 §S3.2 of docs/frontend-roadmap/03-wave-viewer-publishing.md.
 *
 * Thin server component that resolves the deck and hands it to
 * `ViewerShell` with `initialMode='scroll'` — the shell then renders
 * `ScrollMode` instead of the stage + nav chrome.
 */

import type { Metadata } from 'next';
import type { ReactElement } from 'react';
import { fetchViewerDeck } from '../../../lib/deck-service';
import { bootstrapSeoForDeck } from '../../../lib/seo-service';
import { ViewerShell } from '../../../components/ViewerShell';

export interface ScrollPageProps {
  readonly params: Promise<{ deckId: string }>;
  readonly searchParams: Promise<{ start?: string }>;
}

export async function generateMetadata({ params }: ScrollPageProps): Promise<Metadata> {
  const { deckId } = await params;
  const { deck } = await fetchViewerDeck(deckId);
  const seo = await bootstrapSeoForDeck(deckId, deck.title);
  return {
    title: `${seo.title} (scroll)`,
    description: seo.description,
    alternates: { canonical: seo.canonicalUrl },
  };
}

export default async function ScrollDeckPage({ params, searchParams }: ScrollPageProps): Promise<ReactElement> {
  const { deckId } = await params;
  const { start } = await searchParams;
  const { deck } = await fetchViewerDeck(deckId);
  const initialIdx = start ? Math.max(0, Math.min(Number(start) || 0, deck.slides.length - 1)) : 0;
  return (
    <ViewerShell
      deck={deck}
      initialIdx={initialIdx}
      initialMode="scroll"
      dataTestId={`viewer-${deckId}-scroll`}
    />
  );
}