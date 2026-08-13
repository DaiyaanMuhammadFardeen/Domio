/**
 * `/[deckId]/[slideIdx]` — deep-link to a specific slide.
 *
 * Per Wave 3 §S3.1 of docs/frontend-roadmap/03-wave-viewer-publishing.md.
 *
 * Renders the ViewerShell with `initialIdx = slideIdx`. The route
 * validates the index range; an out-of-range index falls back to the
 * first slide with a 200 (not a 404 — viewer URLs are forgiving).
 */

import type { Metadata } from 'next';
import type { ReactElement } from 'react';
import { fetchViewerDeck } from '../../../lib/deck-service';
import { bootstrapSeoForDeck } from '../../../lib/seo-service';
import { ViewerShell } from '../../../components/ViewerShell';
import { editor } from '@domio/ui/routing';

export interface SlidePageProps {
  readonly params: Promise<{ deckId: string; slideIdx: string }>;
  readonly searchParams: Promise<{ mode?: string; share?: string }>;
}

export async function generateMetadata({ params }: SlidePageProps): Promise<Metadata> {
  const { deckId, slideIdx } = await params;
  const { deck } = await fetchViewerDeck(deckId);
  const slide = deck.slides[Number(slideIdx)] ?? deck.slides[0];
  const title = slide?.title ?? deck.title;
  const description = `${title} — slide ${slideIdx} of ${deck.slides.length} from ${deck.title}`;
  const seo = await bootstrapSeoForDeck(deckId, title);
  return {
    title: `${title} · ${deck.title}`,
    description,
    openGraph: {
      title: `${title} · ${deck.title}`,
      description,
      url: seo.canonicalUrl ? `${seo.canonicalUrl}/${slideIdx}` : undefined,
      siteName: seo.siteName,
      images: seo.ogImageUrl ? [{ url: seo.ogImageUrl }] : undefined,
    },
    twitter: { card: 'summary_large_image', title: title, description },
    alternates: {
      canonical: seo.canonicalUrl ? `${seo.canonicalUrl}/${slideIdx}` : undefined,
    },
    robots: seo.robots ?? 'index,follow',
  };
}

export default async function SlidePage({ params, searchParams }: SlidePageProps): Promise<ReactElement> {
  const { deckId, slideIdx: slideIdxStr } = await params;
  const { mode: modeParam, share } = await searchParams;
  const { deck } = await fetchViewerDeck(deckId);
  const requestedIdx = Number(slideIdxStr);
  const validIdx = Number.isFinite(requestedIdx) ? Math.max(0, Math.min(requestedIdx, deck.slides.length - 1)) : 0;
  const initialMode = modeParam === 'scroll' ? 'scroll' : 'stage';
  return (
    <>
      <ViewerShell
        deck={deck}
        initialIdx={validIdx}
        initialMode={initialMode}
        {...(share ? { watermark: `viewer:${share}` } : {})}
        dataTestId={`viewer-${deckId}-slide-${validIdx}`}
      />
      <nav aria-label="Cross-app" className="viewer-cross-link">
        <a href={editor(deckId)}>Edit this deck in editor →</a>
      </nav>
    </>
  );
}