import type { ServiceDeps } from '../deps.js';
import { nowMs } from '../deps.js';
import { Errors } from '../errors.js';
import { uuid } from '../crypto/index.js';
import type { ListingStatus, MarketplaceListing } from '../store/types.js';

/** Allowed lifecycle transitions for a marketplace listing. */
export const LISTING_TRANSITIONS: Record<ListingStatus, ListingStatus[]> = {
  draft: ['in_review', 'removed'],
  in_review: ['published', 'removed', 'draft'],
  published: ['deprecated', 'removed', 'draft'],
  deprecated: ['removed', 'draft'],
  removed: [],
};

export interface ListingInput {
  catalogId: string;
  sellerId: string;
  title: string;
  description: string;
  tags?: string[];
  priceCents: number;
  currency?: string;
  isFree?: boolean;
  preview?: Record<string, unknown>;
}

export async function createListing(deps: ServiceDeps, input: ListingInput): Promise<MarketplaceListing> {
  const versions = await deps.store.listVersions(input.catalogId);
  if (!versions.length) throw Errors.notFound(`component ${input.catalogId}`);
  const existing = await deps.store.getListingByCatalogId(input.catalogId);
  if (existing && existing.status !== 'removed') {
    throw Errors.conflict(`listing already exists for ${input.catalogId}`);
  }
  const now = nowMs(deps);
  const listing: MarketplaceListing = {
    id: uuid(),
    catalogId: input.catalogId,
    sellerId: input.sellerId,
    title: input.title,
    description: input.description,
    status: 'draft',
    isFree: input.isFree ?? input.priceCents === 0,
    ...(input.priceCents ? { priceCents: input.priceCents } : {}),
    ...(input.currency ? { currency: input.currency } : {}),
    tags: input.tags ?? [],
    ...(input.preview ? { preview: input.preview } : {}),
    createdAt: now,
    updatedAt: now,
  };
  await deps.store.putListing(listing);
  return listing;
}

export function allowedTransition(from: ListingStatus, to: ListingStatus): boolean {
  return LISTING_TRANSITIONS[from]?.includes(to) ?? false;
}

export async function transitionListing(
  deps: ServiceDeps,
  listingId: string,
  to: ListingStatus,
  actorId: string,
  reason?: string,
): Promise<MarketplaceListing> {
  const listing = await deps.store.getListing(listingId);
  if (!listing) throw Errors.notFound(`listing ${listingId}`);
  if (!allowedTransition(listing.status, to)) {
    throw Errors.transition(`Invalid listing transition ${listing.status} -> ${to}`);
  }
  if (to === 'published') {
    const versions = await deps.store.listVersions(listing.catalogId);
    const pkg = versions[versions.length - 1];
    if (!pkg || pkg.deprecation) throw Errors.validation('Cannot publish: component package is missing or deprecated');
  }
  const now = nowMs(deps);
  const next: MarketplaceListing = {
    ...listing,
    status: to,
    updatedAt: now,
    ...(to === 'published' ? { publishedAt: now } : {}),
    ...(to === 'deprecated' ? { deprecatedAt: now } : {}),
    ...(reason ? { deprecatedAt: now } : {}),
  };
  await deps.store.putListing(next);
  await deps.store.appendAudit({
    id: uuid(),
    actorId,
    actorKind: 'human',
    action: `listing.${to}`,
    resourceType: 'listing',
    resourceId: listingId,
    detail: { from: listing.status, to, ...(reason ? { reason } : {}) },
    createdAt: now,
  });
  return next;
}

export async function listListings(
  deps: ServiceDeps,
  opts: { status?: ListingStatus; sellerId?: string; limit?: number } = {},
): Promise<MarketplaceListing[]> {
  const listings = await deps.store.listListings({ ...(opts.status ? { status: opts.status } : {}), ...(opts.sellerId ? { sellerId: opts.sellerId } : {}) });
  return listings
    .filter((l) => (opts.status ? l.status === opts.status : l.status !== 'removed'))
    .sort((a, b) => (b.publishedAt ?? b.createdAt) - (a.publishedAt ?? a.createdAt))
    .slice(0, opts.limit ?? 50);
}

/** A removed listing must keep its component installed/renderable (no cascade delete). */
export async function getPublicListing(deps: ServiceDeps, listingId: string): Promise<MarketplaceListing> {
  const listing = await deps.store.getListing(listingId);
  if (!listing) throw Errors.notFound(`listing ${listingId}`);
  if (listing.status === 'removed') {
    throw Errors.gone(`listing ${listingId} was removed`);
  }
  return listing;
}
