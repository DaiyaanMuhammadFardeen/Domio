/**
 * Marketplace creator service — Wave 9 S9.9.
 *
 * Per-creator profile data, feature listings, and reviews. Backed by
 * the marketplace API:
 *   - GET /v1/marketplace/creators/:handle
 *   - GET /v1/marketplace/creators/featured
 *   - GET /v1/marketplace/creators/:handle/listings
 *   - GET /v1/marketplace/creators/:handle/reviews
 *
 * Falls back to deterministic seed data so the UI is testable offline
 * (and loads cleanly while the marketplace-service is offline).
 */

import type { ListingCardVM, Review } from './types';

const API_BASE = process.env['NEXT_PUBLIC_API_BASE'] ?? 'http://localhost:8080';

/* ── Types ──────────────────────────────────────────────────────────── */

export interface CreatorProfile {
  handle: string;
  display_name: string;
  bio: string;
  joined_at_ms: number;
  location: string;
  listing_count: number;
  total_sales: number;
  avg_rating: number;
  response_time_hours: number;
  avatar_url?: string;
}

export interface FeaturedCreator extends CreatorProfile {
  cover_url?: string;
  featured_listing_ids: string[];
}

/* ── Seed data ──────────────────────────────────────────────────────── */

const SEED_CREATORS: ReadonlyArray<FeaturedCreator> = [
  {
    handle: 'ada',
    display_name: 'Ada Lovelace',
    bio: 'Designing the analytical engine of the web — components and templates for ambitious product teams.',
    joined_at_ms: Date.UTC(2024, 1, 14),
    location: 'London, UK',
    listing_count: 28,
    total_sales: 18420,
    avg_rating: 4.8,
    response_time_hours: 3,
    featured_listing_ids: ['lst_0001', 'lst_0007', 'lst_0013'],
  },
  {
    handle: 'turing',
    display_name: 'Alan Turing',
    bio: 'Cryptography, code, and beautifully engineered systems. I ship developer tools and themes.',
    joined_at_ms: Date.UTC(2024, 2, 21),
    location: 'Manchester, UK',
    listing_count: 19,
    total_sales: 9870,
    avg_rating: 4.7,
    response_time_hours: 6,
    featured_listing_ids: ['lst_0002', 'lst_0008', 'lst_0014'],
  },
  {
    handle: 'lovelace',
    display_name: 'Ada & Co',
    bio: 'A small studio shipping minimal, accessible UI kits for design systems.',
    joined_at_ms: Date.UTC(2024, 4, 3),
    location: 'Berlin, DE',
    listing_count: 14,
    total_sales: 6430,
    avg_rating: 4.9,
    response_time_hours: 2,
    featured_listing_ids: ['lst_0003', 'lst_0009', 'lst_0015'],
  },
  {
    handle: 'hopper',
    display_name: 'Grace Hopper',
    bio: 'Compiler-quality components. Compilers, debuggers, and the occasional sticker pack.',
    joined_at_ms: Date.UTC(2024, 6, 11),
    location: 'New York, US',
    listing_count: 22,
    total_sales: 11200,
    avg_rating: 4.6,
    response_time_hours: 5,
    featured_listing_ids: ['lst_0004', 'lst_0010', 'lst_0016'],
  },
  {
    handle: 'katherine',
    display_name: 'Katherine Johnson',
    bio: 'Calculating trajectories since 1962. I build templates for early-stage SaaS founders.',
    joined_at_ms: Date.UTC(2024, 8, 5),
    location: 'Hampton, US',
    listing_count: 11,
    total_sales: 4280,
    avg_rating: 4.8,
    response_time_hours: 4,
    featured_listing_ids: ['lst_0005', 'lst_0011', 'lst_0017'],
  },
  {
    handle: 'curie',
    display_name: 'Marie Curie',
    bio: 'Radical iconography and chemistry-themed sticker packs. Polish through iteration.',
    joined_at_ms: Date.UTC(2024, 9, 19),
    location: 'Paris, FR',
    listing_count: 17,
    total_sales: 7180,
    avg_rating: 4.9,
    response_time_hours: 1,
    featured_listing_ids: ['lst_0006', 'lst_0012', 'lst_0018'],
  },
];

/* ── Helpers ────────────────────────────────────────────────────────── */

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  if (!res.ok) throw new Error(`creator-service: ${res.status}`);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

function findSeedCreator(handle: string): FeaturedCreator | null {
  return SEED_CREATORS.find((c) => c.handle === handle) ?? null;
}

function profileFromCreator(c: FeaturedCreator): CreatorProfile {
  return {
    handle: c.handle,
    display_name: c.display_name,
    bio: c.bio,
    joined_at_ms: c.joined_at_ms,
    location: c.location,
    listing_count: c.listing_count,
    total_sales: c.total_sales,
    avg_rating: c.avg_rating,
    response_time_hours: c.response_time_hours,
    ...(c.avatar_url ? { avatar_url: c.avatar_url } : {}),
  };
}

/* ── Public API ─────────────────────────────────────────────────────── */

export async function getCreator(handle: string): Promise<CreatorProfile | null> {
  try {
    const remote = await apiFetch<CreatorProfile | null>(
      `/v1/marketplace/creators/${encodeURIComponent(handle)}`,
    );
    if (remote) return remote;
  } catch {
    // fall through to seed
  }
  const seed = findSeedCreator(handle);
  return seed ? profileFromCreator(seed) : null;
}

export async function listFeaturedCreators(): Promise<FeaturedCreator[]> {
  try {
    const remote = await apiFetch<FeaturedCreator[]>('/v1/marketplace/creators/featured');
    if (remote && Array.isArray(remote) && remote.length > 0) return remote;
  } catch {
    // fall through to seed
  }
  return [...SEED_CREATORS];
}

export async function getCreatorListings(handle: string): Promise<ListingCardVM[]> {
  try {
    const remote = await apiFetch<ListingCardVM[]>(
      `/v1/marketplace/creators/${encodeURIComponent(handle)}/listings`,
    );
    if (remote && Array.isArray(remote) && remote.length > 0) return remote;
  } catch {
    // fall through to seed
  }

  const seed = findSeedCreator(handle);
  if (!seed) return [];
  return seed.featured_listing_ids.map((id, idx) => {
    const isFree = idx % 2 === 0;
    const priceCents = isFree ? 0 : 1500 + idx * 800;
    return {
      id,
      slug: id,
      title: `${seed.display_name} listing ${idx + 1}`,
      kind: (['component', 'template', 'theme'] as const)[idx % 3]!,
      price_cents: priceCents,
      currency: 'USD',
      is_free: isFree,
      price_model: isFree ? 'free' : 'one_time',
      creator_name: seed.display_name,
      rating_avg: Math.max(4, seed.avg_rating - 0.1),
      rating_count: 50 + idx * 30,
      download_count: 200 + idx * 175,
      tags: ['seed', seed.handle],
      created_at: Date.UTC(2025, 0, 1) + idx * 86400000,
    };
  });
}

export async function getCreatorReviews(handle: string): Promise<Review[]> {
  try {
    const remote = await apiFetch<Review[]>(
      `/v1/marketplace/creators/${encodeURIComponent(handle)}/reviews`,
    );
    if (remote && Array.isArray(remote) && remote.length > 0) return remote;
  } catch {
    // fall through to seed
  }

  const seed = findSeedCreator(handle);
  if (!seed) return [];
  const baseTs = Date.UTC(2025, 5, 1);
  const samples = [
    'Excellent quality — saved me hours of work.',
    'Documentation is thorough and the support is responsive.',
    'Looks great out of the box. Highly recommend.',
    'Exactly what I needed for my project.',
    'Solid design and production-ready code.',
  ];
  return samples.map((body, idx) => ({
    id: `rev_${seed.handle}_${idx + 1}`,
    listing_id: seed.featured_listing_ids[idx % seed.featured_listing_ids.length] ?? '',
    reviewer_id: `buyer_${seed.handle}_${idx + 1}`,
    rating: Math.min(5, Math.max(4, Math.round(seed.avg_rating))),
    body,
    status: 'accepted',
    verified_buyer: true,
    created_at: baseTs + idx * 86400000 * 6,
  }));
}
