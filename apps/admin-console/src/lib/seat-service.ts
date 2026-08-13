/**
 * Seat analytics service — Wave 8 §S8.7.
 *
 * Returns the tenant's license summary, daily seat-usage history, and
 * per-user activity. The real endpoints will live at
 *   GET /v1/admin/seats/license
 *   GET /v1/admin/seats/usage?days=N
 *   GET /v1/admin/seats/users
 * but until those land we fall back to deterministic local seed so the
 * admin console UI and tests have something to render.
 *
 * Mirrors the deferred-endpoint pattern used by
 * `custom-domain-service.ts` and `scim-service.ts`.
 */

import { fetcher } from './fetcher';
import type { LicenseSummary, SeatUsagePoint, UserActivity } from './types';

const NOW = Date.UTC(2026, 7, 13); // 2026-08-13
const DAY = 24 * 60 * 60 * 1000;

// ── Seed data ────────────────────────────────────────────────────────────

const LICENSE_SEED: LicenseSummary = {
  tier: 'enterprise',
  seats_total: 50,
  seats_used: 40,
  seats_available: 10,
  renews_at_ms: Date.UTC(2027, 0, 1), // 2027-01-01
  monthly_cost_cents: 240000, // $2,400/mo
};

const USAGE_START = 30;
const USAGE_END = 40;

function generateUsageHistory(days: number): ReadonlyArray<SeatUsagePoint> {
  const safe = Math.max(1, Math.min(365, Math.floor(days)));
  const out: SeatUsagePoint[] = [];
  // Anchor at "today" (NOW) and walk backwards so the latest point is
  // the most recent day. Values monotonically increase from 30 → 40.
  for (let i = safe - 1; i >= 0; i -= 1) {
    const t = NOW - i * DAY;
    const ratio = (safe - 1 - i) / Math.max(1, safe - 1);
    const seats = Math.round(USAGE_START + ratio * (USAGE_END - USAGE_START));
    out.push({ date_ms: t, seats_used: seats });
  }
  return out;
}

const USER_ACTIVITY_SEED: ReadonlyArray<UserActivity> = [
  {
    user_id: 'u-acme-001',
    email: 'avery.chen@acme.com',
    name: 'Avery Chen',
    last_active_at_ms: NOW - 1000 * 60 * 12,
    decks_created: 34,
    shares_sent: 128,
    minutes_presenting: 412,
    role: 'admin',
  },
  {
    user_id: 'u-acme-002',
    email: 'morgan.lee@acme.com',
    name: 'Morgan Lee',
    last_active_at_ms: NOW - 1000 * 60 * 60 * 3,
    decks_created: 22,
    shares_sent: 87,
    minutes_presenting: 305,
    role: 'editor',
  },
  {
    user_id: 'u-acme-003',
    email: 'priya.kapoor@acme.com',
    name: 'Priya Kapoor',
    last_active_at_ms: NOW - 1000 * 60 * 60 * 26,
    decks_created: 17,
    shares_sent: 64,
    minutes_presenting: 198,
    role: 'editor',
  },
  {
    user_id: 'u-acme-004',
    email: 'dani.santos@acme.com',
    name: 'Dani Santos',
    last_active_at_ms: NOW - 1000 * 60 * 60 * 72,
    decks_created: 9,
    shares_sent: 31,
    minutes_presenting: 124,
    role: 'viewer',
  },
  {
    user_id: 'u-acme-005',
    email: 'jordan.park@acme.com',
    name: 'Jordan Park',
    last_active_at_ms: NOW - 1000 * 60 * 60 * 24 * 2,
    decks_created: 5,
    shares_sent: 12,
    minutes_presenting: 38,
    role: 'viewer',
  },
  {
    user_id: 'u-acme-006',
    email: 'sasha.romanov@acme.com',
    name: 'Sasha Romanov',
    last_active_at_ms: NOW - 1000 * 60 * 60 * 5,
    decks_created: 14,
    shares_sent: 41,
    minutes_presenting: 162,
    role: 'editor',
  },
  {
    user_id: 'u-acme-007',
    email: 'kai.nakamura@acme.com',
    name: 'Kai Nakamura',
    last_active_at_ms: null,
    decks_created: 2,
    shares_sent: 0,
    minutes_presenting: 0,
    role: 'guest',
  },
  {
    user_id: 'u-acme-008',
    email: 'riley.cox@acme.com',
    name: 'Riley Cox',
    last_active_at_ms: NOW - 1000 * 60 * 30,
    decks_created: 19,
    shares_sent: 73,
    minutes_presenting: 241,
    role: 'editor',
  },
  {
    user_id: 'u-acme-009',
    email: 'amir.farooq@acme.com',
    name: 'Amir Farooq',
    last_active_at_ms: NOW - 1000 * 60 * 60 * 8,
    decks_created: 11,
    shares_sent: 29,
    minutes_presenting: 84,
    role: 'viewer',
  },
  {
    user_id: 'u-acme-010',
    email: 'nora.bell@acme.com',
    name: 'Nora Bell',
    last_active_at_ms: NOW - 1000 * 60 * 60 * 24 * 4,
    decks_created: 7,
    shares_sent: 18,
    minutes_presenting: 56,
    role: 'viewer',
  },
  {
    user_id: 'u-acme-011',
    email: 'tomas.bauer@acme.com',
    name: 'Tomas Bauer',
    last_active_at_ms: NOW - 1000 * 60 * 60 * 12,
    decks_created: 13,
    shares_sent: 52,
    minutes_presenting: 173,
    role: 'editor',
  },
  {
    user_id: 'u-acme-012',
    email: 'ines.cardoso@acme.com',
    name: 'Inês Cardoso',
    last_active_at_ms: NOW - 1000 * 60 * 60 * 48,
    decks_created: 4,
    shares_sent: 8,
    minutes_presenting: 22,
    role: 'guest',
  },
];

// ── Public API ───────────────────────────────────────────────────────────

export async function getLicenseSummary(): Promise<LicenseSummary> {
  try {
    const json = await fetcher<LicenseSummary>('/v1/admin/seats/license');
    if (json && typeof json.seats_total === 'number' && typeof json.seats_used === 'number') {
      return json;
    }
  } catch {
    // Backend endpoint deferred — fall through to seed.
  }
  return LICENSE_SEED;
}

export async function getSeatUsageHistory(days: number): Promise<ReadonlyArray<SeatUsagePoint>> {
  const safe = Math.max(1, Math.min(365, Math.floor(days)));
  try {
    const json = await fetcher<{ items?: SeatUsagePoint[] }>(`/v1/admin/seats/usage?days=${safe}`);
    if (json.items && Array.isArray(json.items) && json.items.length > 0) {
      return json.items;
    }
  } catch {
    // Backend endpoint deferred — fall through to seed.
  }
  return generateUsageHistory(safe);
}

export async function listUserActivity(): Promise<ReadonlyArray<UserActivity>> {
  try {
    const json = await fetcher<{ items?: UserActivity[] }>('/v1/admin/seats/users');
    if (json.items && Array.isArray(json.items) && json.items.length > 0) {
      return json.items;
    }
  } catch {
    // Backend endpoint deferred — fall through to seed.
  }
  return USER_ACTIVITY_SEED.slice();
}
