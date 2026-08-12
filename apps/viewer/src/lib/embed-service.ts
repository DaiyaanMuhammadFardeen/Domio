/**
 * Embed service — produces the iframe snippet for embedding a published
 * deck on a third-party page.
 *
 * Per Wave 1 §S1.2 of docs/frontend-roadmap/01-wave-productionization.md.
 *
 * Today: returns a deterministic placeholder snippet. The embed-svc
 * client will replace this in a later wave.
 */

export interface EmbedDescriptor {
  readonly deckId: string;
  readonly iframeHtml: string;
  readonly allowedDomains: ReadonlyArray<string>;
}

export const BOOTSTRAP_EMBEDS: ReadonlyArray<EmbedDescriptor> = [];

export async function listEmbeds(_deckId: string): Promise<ReadonlyArray<EmbedDescriptor>> {
  return BOOTSTRAP_EMBEDS;
}