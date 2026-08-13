/**
 * Status service (Wave 12 §S12.8).
 *
 * Exposes a single `fetchStatus()` function that the marketing
 * status page uses to load a `StatusSnapshot`. The function:
 *
 *   1. Tries a live `GET /v1/status` request (relative to the
 *      current origin so it works in dev, staging, and prod).
 *   2. Falls back to a deterministic, fully offline seed so the
 *      page renders something meaningful in CI, while offline,
 *      or when the API is unreachable.
 *
 * The fallback is deterministic (no `Math.random()`) so that tests
 * and snapshot rendering stay reproducible.
 */

import type {
  Incident,
  ServiceHealth,
  StatusService,
  StatusSnapshot,
} from './status-types';

const HISTORY_LENGTH = 90;

const SERVICE_IDS = [
  'editor-api',
  'viewer-api',
  'presenter-gateway',
  'realtime-ws',
  'analytics',
  'marketplace',
  'auth',
  'ai-copilot',
] as const;

/**
 * Pick the worst status in the snapshot — `major_outage` beats
 * `partial_outage` beats `degraded`, etc. Used to derive the
 * site-wide banner from the per-service rows.
 */
const SEVERITY_RANK: Record<ServiceHealth, number> = {
  operational: 0,
  maintenance: 1,
  degraded: 2,
  partial_outage: 3,
  major_outage: 4,
};

function rankFor(health: ServiceHealth): number {
  return SEVERITY_RANK[health];
}

/**
 * Deterministic 32-bit FNV-1a hash. Lets us turn a numeric seed
 * (or a string) into a stable pseudo-random number in `[0, 1)`
 * without depending on `Math.random()` — the seed has to be
 * reproducible so tests don't flake.
 */
function fnv1a(seed: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    // 32-bit FNV prime multiplication, kept inside the 32-bit
    // range via Math.imul to avoid floating-point drift.
    hash = Math.imul(hash, 0x01000193);
  }
  // Unsigned → [0, 1).
  return (hash >>> 0) / 0xffffffff;
}

/**
 * Pick a `ServiceHealth` for a single day cell using the
 * deterministic hash. We bias toward `operational` so the bar
 * looks mostly green.
 */
function pickHealth(seedKey: string): ServiceHealth {
  const r = fnv1a(seedKey);
  if (r < 0.92) return 'operational';
  if (r < 0.96) return 'degraded';
  if (r < 0.985) return 'partial_outage';
  if (r < 0.997) return 'maintenance';
  return 'major_outage';
}

function buildServiceHistory(serviceId: string): ReadonlyArray<ServiceHealth> {
  const out: ServiceHealth[] = [];
  for (let day = 0; day < HISTORY_LENGTH; day++) {
    out.push(pickHealth(`${serviceId}:d${day}`));
  }
  return out;
}

function uptimePct(history: ReadonlyArray<ServiceHealth>): number {
  if (history.length === 0) return 100;
  let healthy = 0;
  for (const h of history) {
    if (h === 'operational' || h === 'maintenance') healthy++;
  }
  // Two decimal places, rounded.
  return Math.round((healthy / history.length) * 10000) / 100;
}

const SERVICE_META: ReadonlyArray<{ id: string; name: string; description: string }> = [
  {
    id: 'editor-api',
    name: 'Editor API',
    description: 'Document CRUD, autosave, and version history for the canvas editor.',
  },
  {
    id: 'viewer-api',
    name: 'Viewer API',
    description: 'Public read-only deck rendering and embed endpoints.',
  },
  {
    id: 'presenter-gateway',
    name: 'Presenter gateway',
    description: 'Routes live presenter sessions and audience hand-offs.',
  },
  {
    id: 'realtime-ws',
    name: 'Realtime WS',
    description: 'WebSocket fanout for cursor presence, comments, and live edits.',
  },
  {
    id: 'analytics',
    name: 'Analytics',
    description: 'Aggregated view, engagement, and conversion metrics.',
  },
  {
    id: 'marketplace',
    name: 'Marketplace',
    description: 'Plugin and template discovery, install, and license checks.',
  },
  {
    id: 'auth',
    name: 'Auth',
    description: 'Sign-in, SSO, session refresh, and API token issuance.',
  },
  {
    id: 'ai-copilot',
    name: 'AI Copilot',
    description: 'Streaming completions for the in-editor writing assistant.',
  },
];

/**
 * Build a snapshot from the deterministic seed. Exported so tests
 * can assert against the same payload the live API would have
 * produced when offline.
 */
export function buildSeedSnapshot(): StatusSnapshot {
  const services: StatusService[] = SERVICE_META.map((meta) => {
    const history = buildServiceHistory(meta.id);
    const status: ServiceHealth =
      history[history.length - 1] ?? 'operational';
    return {
      id: meta.id,
      name: meta.name,
      description: meta.description,
      status,
      uptime_pct_90d: uptimePct(history),
      history,
    };
  });

  // Derive the site-wide health from the worst per-service cell.
  let worst: ServiceHealth = 'operational';
  for (const svc of services) {
    if (rankFor(svc.status) > rankFor(worst)) worst = svc.status;
  }

  // A single illustrative incident so the list isn't empty in dev.
  const incidents: ReadonlyArray<Incident> = [
    {
      id: 'inc-seed-001',
      title: 'Elevated latency on Viewer API (EU)',
      started_at_ms: Date.UTC(2026, 7, 10, 9, 30), // 2026-08-10T09:30Z
      resolved_at_ms: Date.UTC(2026, 7, 10, 11, 5), // 2026-08-10T11:05Z
      severity: 'minor',
      affected_services: ['viewer-api'],
      summary:
        'Cache warm-up on the EU edge took longer than usual after a deploy. ' +
        'Viewers saw first-paint delays of ~4s for ~95 minutes. Mitigated by a manual cache flush.',
    },
  ];

  return {
    overall: worst,
    services,
    incidents,
    fetched_at_ms: Date.UTC(2026, 7, 13, 12, 0), // deterministic, fixed clock
  };
}

interface FetchOptions {
  /** Override the `/v1/status` URL — tests use this to point at a mock. */
  readonly endpoint?: string;
  /** Inject a custom `fetch` (e.g. a Vitest stub). Defaults to globalThis.fetch. */
  readonly fetcher?: typeof fetch;
  /** Skip the network call and go straight to the seed. */
  readonly offline?: boolean;
}

function isSnapshot(value: unknown): value is StatusSnapshot {
  if (!value || typeof value !== 'object') return false;
  const v = value as Partial<StatusSnapshot>;
  return (
    typeof v.overall === 'string' &&
    Array.isArray(v.services) &&
    Array.isArray(v.incidents) &&
    typeof v.fetched_at_ms === 'number'
  );
}

/**
 * Validates the wire shape of one `StatusService`. Cheaper than
 * pulling in a full schema validator and keeps the dependency
 * surface minimal.
 */
function isService(value: unknown): value is StatusService {
  if (!value || typeof value !== 'object') return false;
  const s = value as Partial<StatusService>;
  return (
    typeof s.id === 'string' &&
    typeof s.name === 'string' &&
    typeof s.description === 'string' &&
    typeof s.status === 'string' &&
    typeof s.uptime_pct_90d === 'number' &&
    Array.isArray(s.history) &&
    s.history.length === HISTORY_LENGTH
  );
}

function isIncident(value: unknown): value is Incident {
  if (!value || typeof value !== 'object') return false;
  const i = value as Partial<Incident>;
  return (
    typeof i.id === 'string' &&
    typeof i.title === 'string' &&
    typeof i.started_at_ms === 'number' &&
    (i.resolved_at_ms === null || typeof i.resolved_at_ms === 'number') &&
    typeof i.severity === 'string' &&
    Array.isArray(i.affected_services)
  );
}

/**
 * Fetch the current `StatusSnapshot`. Falls back to the
 * deterministic seed on any error so the marketing page never
 * goes blank.
 */
export async function fetchStatus(
  options: FetchOptions = {},
): Promise<StatusSnapshot> {
  if (options.offline) {
    return buildSeedSnapshot();
  }

  const endpoint = options.endpoint ?? '/v1/status';
  const fetcher = options.fetcher ?? globalThis.fetch;

  try {
    const res = await fetcher(endpoint, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) {
      return buildSeedSnapshot();
    }
    const data: unknown = await res.json();
    if (!isSnapshot(data)) {
      return buildSeedSnapshot();
    }
    // Defensive per-element validation — a partially-formed
    // response should still degrade to the seed rather than
    // blowing up the page.
    const services = data.services.filter(isService);
    const incidents = data.incidents.filter(isIncident);
    return {
      overall: data.overall,
      services,
      incidents,
      fetched_at_ms: data.fetched_at_ms,
    };
  } catch {
    return buildSeedSnapshot();
  }
}

/** Internal export so tests can sanity-check the seed generation. */
export const __testing = {
  SERVICE_IDS,
  HISTORY_LENGTH,
  fnv1a,
  pickHealth,
  buildServiceHistory,
  uptimePct,
};
