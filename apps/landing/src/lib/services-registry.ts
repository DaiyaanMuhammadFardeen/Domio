/**
 * services-registry — the canonical service taxonomy.
 *
 * Per Wave 13. The Domio monorepo has 80+ backend services. They
 * fall into three tiers:
 *
 *   1. USER_FACING_SERVICES — services that have an admin page, an
 *      iframe surface, or otherwise surface in the navigation graph.
 *      These get a public `/services/<name>` stub page and a row in
 *      the admin-console service directory.
 *
 *   2. PURE_BACKEND_SERVICES — services with an HTTP surface that the
 *      user never visits directly. They are listed for transparency
 *      (under "Other services" on `/services`) but have no link
 *      target and do not appear in the admin-console directory.
 *
 *   3. INFRASTRUCTURE — databases, caches, message buses, observability
 *      stacks. They have no UI surface at all and are *excluded* from
 *      every consumer of this registry. They are listed here only so
 *      the taxonomy is auditable.
 *
 * The taxonomy is the single source of truth for both the
 * admin-console `/services` page and the new public `/services`
 * directory on the landing app. Adding a new service = add one entry
 * to the appropriate array.
 */

// Pure-data module — no UI imports needed; consumers compose URLs.

export type ServiceCategory =
  | 'design'
  | 'platform'
  | 'ml'
  | 'marketplace'
  | 'qa'
  | 'engagement'
  | 'analytics'
  | 'realtime'
  | 'auth'
  | 'integration'
  | 'content'
  | 'support'
  | 'infra'
  | 'backend';

/**
 * Tier 1: services that get a stub page + admin row.
 */
export interface UserFacingService {
  readonly id: string;
  readonly name: string;
  readonly port: number;
  readonly description: string;
  readonly category: ServiceCategory;
  readonly owners: ReadonlyArray<string>;
  readonly consumers: ReadonlyArray<string>;
  readonly docsSlug: string;
  /** Optional admin actions surfaced on the admin-console row. */
  readonly adminActions?: ReadonlyArray<'rotate-keys' | 'view-audit' | 'view-metrics' | 'restart'>;
}

export const USER_FACING_SERVICES: ReadonlyArray<UserFacingService> = [
  {
    id: 'theme',
    name: 'theme',
    port: 3010,
    description: 'Theme tokens, design primitives, brand-locked palettes.',
    category: 'design',
    owners: ['brand-team'],
    consumers: ['editor', 'dashboard', 'marketplace-web'],
    docsSlug: 'design/theme-tokens',
    adminActions: ['rotate-keys', 'view-metrics'],
  },
  {
    id: 'brand',
    name: 'brand',
    port: 3020,
    description: 'Brand registry, palette enforcement, override policy.',
    category: 'design',
    owners: ['brand-team', 'trust-team'],
    consumers: ['editor', 'dashboard'],
    docsSlug: 'design/brand-registry',
    adminActions: ['view-audit', 'view-metrics'],
  },
  {
    id: 'ai-orchestrator',
    name: 'ai-orchestrator',
    port: 7100,
    description: 'Routes model requests, applies guardrails, audits usage.',
    category: 'ml',
    owners: ['ml-team'],
    consumers: ['editor', 'dashboard'],
    docsSlug: 'ml/ai-orchestrator',
    adminActions: ['view-audit', 'rotate-keys'],
  },
  {
    id: 'registry',
    name: 'registry',
    port: 7110,
    description: 'Component / template / listing registry + version pinning.',
    category: 'platform',
    owners: ['platform-team'],
    consumers: ['editor', 'marketplace-web', 'admin-console'],
    docsSlug: 'platform/registry',
    adminActions: ['view-metrics'],
  },
  {
    id: 'marketplace-preview',
    name: 'marketplace-preview',
    port: 7200,
    description: 'Sandbox previews for marketplace listings (iframe surface).',
    category: 'marketplace',
    owners: ['marketplace-team'],
    consumers: ['marketplace-web', 'creator-console'],
    docsSlug: 'marketplace/preview-sandbox',
    adminActions: ['restart'],
  },
  {
    id: 'control-plane',
    name: 'control-plane',
    port: 7300,
    description: 'Workspace, billing, seats, audit fan-out for admin ops.',
    category: 'platform',
    owners: ['platform-team'],
    consumers: ['admin-console', 'dashboard', 'api'],
    docsSlug: 'platform/control-plane',
    adminActions: ['view-audit', 'rotate-keys', 'view-metrics'],
  },
  {
    id: 'qa-engine',
    name: 'qa-engine',
    port: 7400,
    description: 'Automated component QA, regression suites, CI hooks.',
    category: 'qa',
    owners: ['qa-team'],
    consumers: ['registry', 'editor'],
    docsSlug: 'qa/qa-engine',
    adminActions: ['view-metrics'],
  },
  {
    id: 'quiz-engine',
    name: 'quiz-engine',
    port: 7500,
    description: 'Audience quiz grading, scoring, leaderboard sync.',
    category: 'engagement',
    owners: ['education-team'],
    consumers: ['presenter', 'dashboard'],
    docsSlug: 'engagement/quiz-engine',
    adminActions: ['view-metrics'],
  },
  {
    id: 'reaction-broadcaster',
    name: 'reaction-broadcaster',
    port: 7600,
    description: 'WS fan-out for reactions, raise-hand, emoji pings.',
    category: 'realtime',
    owners: ['live-team'],
    consumers: ['presenter', 'viewer', 'join-web'],
    docsSlug: 'realtime/reaction-broadcaster',
    adminActions: ['view-metrics', 'restart'],
  },
  {
    id: 'live-analytics',
    name: 'live-analytics',
    port: 7700,
    description: 'Live HUD telemetry: viewers, attention, current slide.',
    category: 'analytics',
    owners: ['analytics-team'],
    consumers: ['presenter', 'dashboard'],
    docsSlug: 'analytics/live-telemetry',
    adminActions: ['view-metrics'],
  },
];

/**
 * Tier 2: services with an HTTP surface but no UI link target.
 * Listed for transparency on `/services` but excluded from admin nav.
 */
export interface PureBackendService {
  readonly id: string;
  readonly name: string;
  readonly port: number;
  readonly category: ServiceCategory;
  readonly purpose: string;
}

export const PURE_BACKEND_SERVICES: ReadonlyArray<PureBackendService> = [
  {
    id: 'event-ingest',
    name: 'event-ingest',
    port: 3020,
    category: 'analytics',
    purpose: 'Streams raw interaction events into the warehouse.',
  },
  {
    id: 'analytics-warehouse',
    name: 'analytics-warehouse',
    port: 3030,
    category: 'analytics',
    purpose: 'Pre-aggregated analytics tables (denormalized for dashboard reads).',
  },
  {
    id: 'clickhouse-loader',
    name: 'clickhouse-loader',
    port: 3040,
    category: 'analytics',
    purpose: 'Materializes event-ingest streams into ClickHouse tables.',
  },
  {
    id: 'viewer-identity',
    name: 'viewer-identity',
    port: 3050,
    category: 'auth',
    purpose: 'Issues per-session viewer tokens; ties anon-id to presenter deck.',
  },
  {
    id: 'sessionization',
    name: 'sessionization',
    port: 3051,
    category: 'analytics',
    purpose: 'Buckets events into sessions keyed on join + slide boundaries.',
  },
  {
    id: 'heatmap-generator',
    name: 'heatmap-generator',
    port: 3052,
    category: 'analytics',
    purpose: 'Rolls sessionized events into attention heatmaps.',
  },
  {
    id: 'presenter-session',
    name: 'presenter-session',
    port: 3010,
    category: 'realtime',
    purpose: 'Per-session state for the presenter app (slide, hotkeys, HUD).',
  },
  {
    id: 'team-analytics',
    name: 'team-analytics',
    port: 3060,
    category: 'analytics',
    purpose: 'Aggregates per-deck analytics into team-level rollups.',
  },
  {
    id: 'live-analytics-stream',
    name: 'live-analytics-stream',
    port: 3070,
    category: 'analytics',
    purpose: 'Pushes real-time metrics to the live HUD via websocket.',
  },
  {
    id: 'annotation-engine',
    name: 'annotation-engine',
    port: 3080,
    category: 'content',
    purpose: 'Stores presenter annotations and forwards to viewer.',
  },
];

/**
 * Tier 3: databases / caches / buses / observability. Excluded from
 * every consumer. Listed for audit only.
 */
export interface InfrastructureService {
  readonly id: string;
  readonly name: string;
  readonly port: number;
  readonly kind: 'database' | 'cache' | 'bus' | 'observability' | 'object-store';
}

export const INFRASTRUCTURE: ReadonlyArray<InfrastructureService> = [
  { id: 'postgres', name: 'postgres', port: 5432, kind: 'database' },
  { id: 'redis', name: 'redis', port: 6379, kind: 'cache' },
  { id: 'nats', name: 'nats', port: 4222, kind: 'bus' },
  { id: 'clickhouse', name: 'clickhouse', port: 8123, kind: 'database' },
  { id: 'opensearch', name: 'opensearch', port: 9200, kind: 'database' },
  { id: 'minio', name: 'minio', port: 9000, kind: 'object-store' },
  { id: 'mailhog', name: 'mailhog', port: 1025, kind: 'observability' },
  { id: 'prometheus', name: 'prometheus', port: 9090, kind: 'observability' },
  { id: 'grafana', name: 'grafana', port: 3001, kind: 'observability' },
  { id: 'jaeger', name: 'jaeger', port: 16686, kind: 'observability' },
  { id: 'otel-collector', name: 'otel-collector', port: 4317, kind: 'observability' },
];

/**
 * Convenience: find a user-facing service by id (the URL slug).
 */
export function userFacingById(id: string): UserFacingService | null {
  return USER_FACING_SERVICES.find((svc) => svc.id === id) ?? null;
}

/**
 * Group user-facing services by category for the directory page.
 */
export function userFacingByCategory(): ReadonlyArray<{
  readonly category: ServiceCategory;
  readonly services: ReadonlyArray<UserFacingService>;
}> {
  const groups = new Map<ServiceCategory, UserFacingService[]>();
  for (const svc of USER_FACING_SERVICES) {
    const list = groups.get(svc.category) ?? [];
    list.push(svc);
    groups.set(svc.category, list);
  }
  const out: { category: ServiceCategory; services: ReadonlyArray<UserFacingService> }[] = [];
  for (const [category, list] of groups) {
    list.sort((a, b) => a.name.localeCompare(b.name));
    out.push({ category, services: Object.freeze(list) });
  }
  out.sort((a, b) => a.category.localeCompare(b.category));
  return Object.freeze(out);
}

/**
 * Local dev URL for a service (e.g. `http://localhost:3010`).
 * Returns a port-aware absolute URL in Node and a relative path when
 * running on the matching dev server.
 */
export function serviceLocalUrl(port: number, path = '/'): string {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  if (typeof window !== 'undefined' && window.location.port === String(port)) {
    return normalized;
  }
  return `http://localhost:${port}${normalized}`;
}