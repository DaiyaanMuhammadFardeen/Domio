/**
 * SEO service — generates meta tags for a published deck.
 *
 * Per Wave 1 §S1.2 of docs/frontend-roadmap/01-wave-productionization.md.
 *
 * Today: returns a placeholder SEO bundle. The seo-svc client will
 * replace this in a later wave.
 */

export interface SeoBundle {
  readonly deckId: string;
  readonly title: string;
  readonly description: string;
  readonly ogImageUrl?: string;
  readonly canonicalUrl?: string;
}

export const BOOTSTRAP_SEO: ReadonlyArray<SeoBundle> = [];

export async function getSeoBundle(_deckId: string): Promise<SeoBundle | null> {
  return null;
}