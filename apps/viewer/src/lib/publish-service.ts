/**
 * Publish service — viewer-side bookkeeping for published decks.
 *
 * Per Wave 3 §S3.1 of docs/frontend-roadmap/03-wave-viewer-publishing.md.
 *
 * The viewer talks to `services/publish` only over well-typed bundle
 * descriptors today (bootstrap mode); once the publish-svc is wired in
 * these helpers swap to live fetches without callers changing.
 */

export interface PublishDescriptor {
  readonly deckId: string;
  readonly publicUrl: string;
  readonly publishedAtMs: number;
  /** When set, viewers with `share` query param gain a per-session watermark. */
  readonly watermark?: { readonly kind: 'email' | 'id'; readonly opacity: number };
  /** Indicates visibility policy on the share. Bootstrap: `public`. */
  readonly visibility?: 'public' | 'password' | 'domain' | 'sso' | 'email';
}

export const BOOTSTRAP_PUBLISHES: ReadonlyArray<PublishDescriptor> = [];

export async function listPublishedDecks(
  _workspaceId: string,
): Promise<ReadonlyArray<PublishDescriptor>> {
  return BOOTSTRAP_PUBLISHES;
}

/**
 * Bootstrap publish for `deckId`: synthesize a publish record so the viewer
 * has the SEO/policy shape it needs to render without `services/publish`
 * being wired. The `publishedAtMs` is anchored to the deck's title length
 * for determinism.
 */
export async function bootstrapPublishForDeck(
  deckId: string,
  title: string,
): Promise<PublishDescriptor> {
  return {
    deckId,
    publicUrl: `https://deck.domio.app/${deckId}`,
    publishedAtMs: 1_700_000_000_000 + title.length * 86_400_000,
  };
}
