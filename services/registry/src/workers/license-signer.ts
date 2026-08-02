import type { ServiceDeps } from '../deps.js';
import { issueLicenseGrant } from '../install/license.js';

export interface SignInput {
  workspaceId: string;
  userId?: string;
  catalogId: string;
  version: string;
  listingId?: string;
  seats?: number;
}

export interface SignResult {
  grantId: string;
  token: string;
  expiresAt: number;
}

/**
 * Issue a signed license grant for a catalog item in a workspace.
 *
 * Wraps `issueLicenseGrant` from `src/install/license.js`. If `listingId` is
 * omitted, the worker attempts to look it up by `catalogId` via the store's
 * `getListingByCatalogId`.
 *
 * Returns `{ grantId, token, expiresAt }` on success.
 */
export async function run(deps: ServiceDeps, input: SignInput): Promise<SignResult> {
  const { store } = deps;

  let listingId = input.listingId;
  if (!listingId) {
    const listing = await store.getListingByCatalogId(input.catalogId);
    if (!listing) {
      throw new Error(`No published listing found for catalog "${input.catalogId}"`);
    }
    listingId = listing.id;
  }

  const grant = await issueLicenseGrant(deps, {
    workspaceId: input.workspaceId,
    ...(input.userId != null ? { userId: input.userId } : {}),
    catalogId: input.catalogId,
    version: input.version,
    listingId,
    seats: input.seats ?? 1,
  });

  return {
    grantId: grant.id,
    token: grant.signedToken,
    expiresAt: grant.expiresAt,
  };
}
