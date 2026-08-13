/**
 * SEO service — generates meta tags for a published deck.
 *
 * Per Wave 3 §S3.1 + §S3.9 of docs/frontend-roadmap/03-wave-viewer-publishing.md.
 *
 * The viewer's `<head>` reads the `SeoBundle` returned by `getSeoBundle`
 * for a deck and renders `title`, `description`, `ogImageUrl`, and
 * `canonicalUrl` meta tags. The real `services/seo` will eventually
 * return per-language, per-platform bundles; today we synthesize a
 * bundle from the deck title so the viewer has the meta it needs to
 * reach Lighthouse SEO ≥ 100.
 */

export interface SeoBundle {
  readonly deckId: string;
  readonly title: string;
  readonly description: string;
  readonly ogImageUrl?: string;
  readonly canonicalUrl?: string;
  /** `noindex` when visibility is restrictive or expiry passed. */
  readonly robots?: 'index,follow' | 'noindex,follow' | 'noindex,nofollow';
  /** Optional site name used by `og:site_name`. */
  readonly siteName?: string;
  /** Twitter card variant. */
  readonly twitterCard?: 'summary' | 'summary_large_image';
}

export const BOOTSTRAP_SEO: ReadonlyArray<SeoBundle> = [];

/**
 * Synthesize a deterministic SEO bundle from the deck's own title.
 * Real `services/seo` will overwrite this with persisted overrides.
 */
export async function bootstrapSeoForDeck(deckId: string, deckTitle: string): Promise<SeoBundle> {
  const canonicalUrl = `https://deck.domio.app/${deckId}`;
  return {
    deckId,
    title: deckTitle,
    description: `${deckTitle} — interactive presentation on Domio.`,
    ogImageUrl: `https://deck.domio.app/api/og/${deckId}`,
    canonicalUrl,
    robots: 'index,follow',
    siteName: 'Domio',
    twitterCard: 'summary_large_image',
  };
}

export async function getSeoBundle(_deckId: string): Promise<SeoBundle | null> {
  return null;
}
