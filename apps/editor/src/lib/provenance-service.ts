/**
 * Provenance service — trackable lineage for any data-bound element
 * on a slide.
 *
 * Per Wave 11 §S11.11 of docs/frontend-roadmap/11-wave-novel-frontier.md.
 *
 * Each element on a slide that binds to live data carries a
 * `Provenance` record: which source system produced it, the query
 * (SQL / API path) that fetched it, the team/person that owns it,
 * when it was last verified, and a freshness badge (fresh / stale /
 * outdated). Agents can fetch the same record through
 * `services/ai-orchestrator/get_provenance?id={id}`.
 *
 * Today: returns deterministic seed data with 5-8 mock records of
 * varied freshness. The ai-orchestrator client (when it lands) will
 * replace the seeded fallback.
 */

export type FreshnessStatus = 'fresh' | 'stale' | 'outdated';

export interface Provenance {
  readonly id: string;
  readonly element_id: string;
  readonly source_system: string;
  readonly query: string;
  readonly owner: string;
  readonly last_verified_at_ms: number;
  readonly freshness: FreshnessStatus;
  readonly agent_endpoint: string;
}

export const AGENT_PROVENANCE_BASE = 'services/ai-orchestrator/get_provenance';

/** Map a freshness-status label to a localized key. */
export const FRESHNESS_KEY: Readonly<Record<FreshnessStatus, string>> = {
  fresh: 'editor.provenance.drawer.freshness.fresh',
  stale: 'editor.provenance.drawer.freshness.stale',
  outdated: 'editor.provenance.drawer.freshness.outdated',
};

/** Map a freshness status to its badge colour token. */
export const FRESHNESS_COLOR: Readonly<Record<FreshnessStatus, string>> = {
  fresh: 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/30',
  stale: 'bg-amber-500/15 text-amber-300 ring-amber-500/30',
  outdated: 'bg-rose-500/15 text-rose-300 ring-rose-500/30',
};

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/**
 * Seed dataset — eight deterministic provenance records with varied
 * freshness. Used as the fallback whenever the network call fails
 * (and as the source of truth in tests).
 */
function buildSeed(): Provenance[] {
  const now = Date.now();
  const base: Array<Omit<Provenance, 'agent_endpoint'>> = [
    {
      id: 'prv-001',
      element_id: 'el-stat-mrr',
      source_system: 'Stripe',
      query:
        "SELECT sum(amount) FROM charges WHERE status = 'succeeded' AND created >= now() - interval '30 days'",
      owner: 'finance@growthco.com',
      last_verified_at_ms: now - 12 * 60 * 1000, // 12 min ago — fresh
      freshness: 'fresh',
    },
    {
      id: 'prv-002',
      element_id: 'el-stat-churn',
      source_system: 'Salesforce',
      query:
        'GET /services/data/v59.0/query?q=SELECT+Id,Status+FROM+Opportunity+WHERE+IsClosed=true',
      owner: 'revops@growthco.com',
      last_verified_at_ms: now - 5 * HOUR, // 5h ago — stale
      freshness: 'stale',
    },
    {
      id: 'prv-003',
      element_id: 'el-chart-active-users',
      source_system: 'Internal DB',
      query:
        "SELECT date_trunc('day', event_at) AS d, count(distinct user_id) FROM app_events WHERE event_at >= now() - interval '14 days' GROUP BY 1",
      owner: 'data-platform@growthco.com',
      last_verified_at_ms: now - 3 * DAY, // 3d ago — outdated
      freshness: 'outdated',
    },
    {
      id: 'prv-004',
      element_id: 'el-stat-arpu',
      source_system: 'Stripe',
      query:
        "SELECT avg(amount_cents)/100 AS arpu FROM invoices WHERE created >= now() - interval '30 days'",
      owner: 'finance@growthco.com',
      last_verified_at_ms: now - 30 * 60 * 1000, // 30 min ago — fresh
      freshness: 'fresh',
    },
    {
      id: 'prv-005',
      element_id: 'el-chart-pipeline',
      source_system: 'Salesforce',
      query: 'GET /services/data/v59.0/analytics/reports/00O5g00000XYZABC',
      owner: 'revops@growthco.com',
      last_verified_at_ms: now - 6 * HOUR, // 6h ago — stale
      freshness: 'stale',
    },
    {
      id: 'prv-006',
      element_id: 'el-stat-nps',
      source_system: 'Delighted',
      query: 'GET https://api.delighted.com/v1/nps.json?since=2026-07-01',
      owner: 'cx@growthco.com',
      last_verified_at_ms: now - 45 * 60 * 1000, // 45 min ago — fresh
      freshness: 'fresh',
    },
    {
      id: 'prv-007',
      element_id: 'el-chart-funnel',
      source_system: 'Internal DB',
      query:
        "SELECT stage, count(*) FROM funnel_events WHERE created_at >= now() - interval '7 days' GROUP BY stage",
      owner: 'product@growthco.com',
      last_verified_at_ms: now - 2 * HOUR, // 2h ago — fresh
      freshness: 'fresh',
    },
    {
      id: 'prv-008',
      element_id: 'el-stat-trial-conv',
      source_system: 'BigQuery',
      query:
        "SELECT count(distinct user_id) / count(*) AS rate FROM `growthco.analytics.trial_events` WHERE event = 'converted'",
      owner: 'data-platform@growthco.com',
      last_verified_at_ms: now - 10 * DAY, // 10d ago — outdated
      freshness: 'outdated',
    },
  ];
  return base.map((b) => ({ ...b, agent_endpoint: `${AGENT_PROVENANCE_BASE}?id=${b.id}` }));
}

const SEED: ReadonlyArray<Provenance> = buildSeed();

/** Pure lookup: returns the seed record for an element_id, or null. */
export function findSeed(elementId: string): Provenance | null {
  return SEED.find((p) => p.element_id === elementId) ?? null;
}

/** Pure list: returns the seed records for a deck (subset by element_id prefix). */
export function listSeed(deckId: string): Provenance[] {
  // Deterministic slice: take records whose element_id contains a
  // digit from the deck id so different decks see different subsets.
  const digit = deckId.replace(/\D/g, '').slice(-1) || '0';
  const offset = Number.parseInt(digit, 10) % Math.max(1, SEED.length);
  return SEED.slice(offset).concat(SEED.slice(0, offset));
}

/** Render a friendly relative time for a millisecond timestamp. */
export function formatRelative(ms: number, now: number = Date.now()): string {
  const delta = Math.max(0, now - ms);
  if (delta < 60 * 1000) return 'just now';
  if (delta < HOUR) return `${Math.round(delta / (60 * 1000))} min ago`;
  if (delta < DAY) return `${Math.round(delta / HOUR)} h ago`;
  return `${Math.round(delta / DAY)} d ago`;
}

/**
 * Fetch the provenance record for a single element.
 *
 * Falls back to deterministic seed data on any failure so the chip
 * can always render something useful.
 */
export async function getProvenance(elementId: string): Promise<Provenance | null> {
  try {
    const seed = findSeed(elementId);
    if (!seed) return null;
    // Clone so callers can't mutate the seed.
    return { ...seed, agent_endpoint: `${AGENT_PROVENANCE_BASE}?id=${seed.id}` };
  } catch {
    return findSeed(elementId);
  }
}

/**
 * Refresh the provenance record by re-fetching from the upstream.
 * Today: bumps `last_verified_at_ms` and recomputes freshness.
 */
export async function refreshProvenance(elementId: string): Promise<Provenance> {
  const seed = findSeed(elementId);
  if (!seed) {
    return {
      id: `prv-${elementId.slice(-6)}`,
      element_id: elementId,
      source_system: 'Unknown',
      query: '—',
      owner: 'unassigned',
      last_verified_at_ms: Date.now(),
      freshness: 'fresh',
      agent_endpoint: `${AGENT_PROVENANCE_BASE}?id=${elementId}`,
    };
  }
  return {
    ...seed,
    last_verified_at_ms: Date.now(),
    freshness: 'fresh',
    agent_endpoint: `${AGENT_PROVENANCE_BASE}?id=${seed.id}`,
  };
}

/**
 * List every provenance record attached to a deck.
 *
 * Falls back to deterministic seed data on any failure.
 */
export async function listProvenance(deckId: string): Promise<Provenance[]> {
  try {
    return listSeed(deckId).map((p) => ({ ...p }));
  } catch {
    return listSeed(deckId).map((p) => ({ ...p }));
  }
}

export const SEED_PROVENANCE: ReadonlyArray<Provenance> = SEED;
