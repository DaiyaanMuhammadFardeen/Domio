/**
 * Marketplace routes — listings CRUD, publish/deprecate transitions,
 * reviews, revenue, and search.
 *
 *   POST   /v1/marketplace/listings             (create listing)
 *   GET    /v1/marketplace/listings              (list)
 *   GET    /v1/marketplace/listings/:listingId   (get listing)
 *   POST   /v1/marketplace/listings/:listingId/publish
 *   POST   /v1/marketplace/listings/:listingId/deprecate
 *   POST   /v1/marketplace/listings/:listingId/reviews
 *   GET    /v1/marketplace/listings/:listingId/reviews
 *   POST   /v1/marketplace/purchases             (record sale)
 *   GET    /v1/marketplace/payouts/eligibility
 *   GET    /v1/marketplace/search
 */

import { Hono } from 'hono';
import type { ServiceDeps } from '../deps.js';
import { Errors, RegistryError } from '../errors.js';
import {
  createListing,
  transitionListing,
  listListings,
  getPublicListing,
} from '../marketplace/listings.js';
import { submitReview, listingReviewStats } from '../marketplace/reviews.js';
import { searchListings, indexListing, type SortMode } from '../marketplace/search.js';
import { recordSale, isPayoutEligible } from '../marketplace/revenue.js';

export function marketplaceRoutes(deps: ServiceDeps): Hono {
  const app = new Hono();

  // ---- POST /v1/marketplace/listings — create ----
  app.post('/v1/marketplace/listings', async (c) => {
    const tenantId = c.req.header('x-tenant-id') ?? 'default';
    const userId = c.req.header('x-user-id') ?? 'anonymous';
    void tenantId;

    const body = await c.req.json();
    const listing = await createListing(deps, {
      catalogId: body.catalogId,
      sellerId: userId,
      title: body.title,
      description: body.description,
      ...(body.tags != null ? { tags: body.tags } : {}),
      priceCents: body.priceCents ?? 0,
      ...(body.currency != null ? { currency: body.currency } : {}),
      ...(body.isFree != null ? { isFree: body.isFree } : {}),
      ...(body.preview != null ? { preview: body.preview } : {}),
    });
    return c.json({ listing }, 201);
  });

  // ---- GET /v1/marketplace/listings — list ----
  app.get('/v1/marketplace/listings', async (c) => {
    const status = c.req.query('status');
    const sellerId = c.req.query('sellerId');
    const limit = c.req.query('limit');
    const listings = await listListings(deps, {
      ...(status ? { status: status as 'draft' | 'in_review' | 'published' | 'deprecated' | 'removed' } : {}),
      ...(sellerId ? { sellerId } : {}),
      ...(limit ? { limit: Number(limit) } : {}),
    });
    return c.json({ listings });
  });

  // ---- GET /v1/marketplace/listings/:listingId — get ----
  app.get('/v1/marketplace/listings/:listingId', async (c) => {
    const listingId = c.req.param('listingId');
    const listing = await getPublicListing(deps, listingId);
    const stats = await listingReviewStats(deps, listingId);
    return c.json({ listing, stats });
  });

  // ---- POST /v1/marketplace/listings/:listingId/publish ----
  app.post('/v1/marketplace/listings/:listingId/publish', async (c) => {
    const listingId = c.req.param('listingId');
    const userId = c.req.header('x-user-id') ?? 'anonymous';
    // Transition through in_review if currently in draft
    let listing = await getPublicListing(deps, listingId).catch(() => deps.store.getListing(listingId));
    if (listing && listing.status === 'draft') {
      listing = await transitionListing(deps, listingId, 'in_review', userId);
    }
    const published = await transitionListing(deps, listingId, 'published', userId);
    await indexListing(deps, listingId);
    return c.json({ listing: published });
  });

  // ---- POST /v1/marketplace/listings/:listingId/deprecate ----
  app.post('/v1/marketplace/listings/:listingId/deprecate', async (c) => {
    const listingId = c.req.param('listingId');
    const userId = c.req.header('x-user-id') ?? 'anonymous';
    const body = await c.req.json();
    const listing = await transitionListing(deps, listingId, 'deprecated', userId, body.reason);
    return c.json({ listing });
  });

  // ---- POST /v1/marketplace/listings/:listingId/reviews — submit review ----
  app.post('/v1/marketplace/listings/:listingId/reviews', async (c) => {
    const listingId = c.req.param('listingId');
    const userId = c.req.header('x-user-id') ?? 'anonymous';
    const body = await c.req.json();
    try {
      const review = await submitReview(deps, {
        listingId,
        reviewerId: userId,
        rating: body.rating,
        body: body.body,
        ...(body.verifiedBuyer != null ? { verifiedBuyer: body.verifiedBuyer } : {}),
      });
      return c.json({ review }, 201);
    } catch (err) {
      if (err instanceof RegistryError) {
        if (err.code === 'ERR_MODERATION_QUEUED') {
          return c.json({ error: { code: err.code, message: err.message } }, err.status as 202);
        }
      }
      throw err;
    }
  });

  // ---- GET /v1/marketplace/listings/:listingId/reviews — list reviews ----
  app.get('/v1/marketplace/listings/:listingId/reviews', async (c) => {
    const listingId = c.req.param('listingId');
    const status = c.req.query('status');
    const reviews = await deps.store.listReviews(listingId, status ?? undefined);
    return c.json({ reviews });
  });

  // ---- POST /v1/marketplace/purchases — record a sale ----
  app.post('/v1/marketplace/purchases', async (c) => {
    const body = await c.req.json();
    const event = await recordSale(deps, {
      listingId: body.listingId,
      sellerId: body.sellerId,
      workspaceId: body.workspaceId,
      currency: body.currency,
      grossCents: body.grossCents,
      feeBps: deps.limits.feeBps,
    });
    return c.json({ revenueEvent: event }, 201);
  });

  // ---- GET /v1/marketplace/payouts/eligibility ----
  app.get('/v1/marketplace/payouts/eligibility', async (c) => {
    const sellerId = c.req.query('sellerId');
    const periodMonth = c.req.query('periodMonth');
    if (!sellerId || !periodMonth) {
      throw Errors.validation('sellerId and periodMonth are required');
    }
    const eligible = await isPayoutEligible(deps, sellerId, periodMonth);
    return c.json({ eligible, minPayoutCents: deps.limits.minPayoutCents });
  });

  // ---- GET /v1/marketplace/search ----
  app.get('/v1/marketplace/search', async (c) => {
    const q = c.req.query('q');
    const category = c.req.query('category');
    const maxPrice = c.req.query('maxPrice');
    const minRating = c.req.query('minRating');
    const sort = c.req.query('sort');
    const page = c.req.query('page');
    const pageSize = c.req.query('pageSize');
    void minRating; // TODO: post-filter by rating when reviews are joined

    const result = await searchListings(deps, {
      ...(q ? { q } : {}),
      ...(category ? { category } : {}),
      ...(maxPrice != null ? { maxPrice: Number(maxPrice) } : {}),
      ...(sort ? { sort: sort as SortMode } : {}),
      ...(page ? { page: Number(page) } : {}),
      ...(pageSize ? { pageSize: Number(pageSize) } : {}),
    });
    return c.json(result);
  });

  return app;
}
