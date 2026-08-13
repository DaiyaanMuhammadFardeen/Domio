/**
 * Share service — produces a signed share link for a deck.
 *
 * Per Wave 1 §S1.2 of docs/frontend-roadmap/01-wave-productionization.md.
 *
 * Today: returns a deterministic placeholder link. When the share-svc
 * client lands in a later wave, this becomes a thin loader wrapper.
 */

export interface ShareLink {
  readonly url: string;
  readonly expiresAtMs: number;
  readonly role: 'viewer' | 'commenter' | 'editor';
}

export const BOOTSTRAP_SHARE_LINKS: ReadonlyArray<ShareLink> = [];

export async function createShareLink(
  _deckId: string,
  role: ShareLink['role'] = 'viewer',
): Promise<ShareLink> {
  return {
    url: `https://share.domio.test/d/${_deckId}?role=${role}`,
    expiresAtMs: Date.now() + 24 * 60 * 60 * 1000,
    role,
  };
}

export async function listShareLinks(_deckId: string): Promise<ReadonlyArray<ShareLink>> {
  return BOOTSTRAP_SHARE_LINKS;
}
