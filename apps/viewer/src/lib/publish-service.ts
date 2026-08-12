/**
 * Publish service — viewer publishes its deck to a public URL.
 *
 * Per Wave 1 §S1.2 of docs/frontend-roadmap/01-wave-productionization.md.
 *
 * Today: returns a placeholder publish descriptor. The publish-svc
 * client will replace this in a later wave.
 */

export interface PublishDescriptor {
  readonly deckId: string;
  readonly publicUrl: string;
  readonly publishedAtMs: number;
}

export const BOOTSTRAP_PUBLISHES: ReadonlyArray<PublishDescriptor> = [];

export async function listPublishedDecks(
  _workspaceId: string,
): Promise<ReadonlyArray<PublishDescriptor>> {
  return BOOTSTRAP_PUBLISHES;
}