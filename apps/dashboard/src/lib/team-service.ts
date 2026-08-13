/**
 * team-service — typed client for team analytics.
 *
 * Per Wave 7 §S7.1 of docs/frontend-roadmap/07-wave-analytics-insights.md.
 *
 * Wraps the workspace team-analytics REST endpoints:
 *   GET /v1/analytics/team/templates/top
 *   GET /v1/analytics/team/components/top
 *   GET /v1/analytics/team/brands/health
 *   GET /v1/analytics/team/retention
 *
 * On any failure the loader returns an empty list. The page renders
 * an empty state — never fabricated rows.
 */

import { fetcher } from './fetcher';

export interface TemplateRow {
  readonly templateId: string;
  readonly name: string;
  readonly workspaceCount: number;
  readonly totalViews: number;
}

export interface ComponentRow {
  readonly componentId: string;
  readonly name: string;
  readonly usage: number;
}

export interface BrandHealth {
  readonly brandId: string;
  readonly name: string;
  readonly health: 'green' | 'amber' | 'red';
  readonly activeTokens: number;
}

export interface RetentionCell {
  readonly cohort: string;
  readonly d7: number;
  readonly d30: number;
  readonly d90: number;
}

export interface TeamAnalytics {
  readonly templates: ReadonlyArray<TemplateRow>;
  readonly components: ReadonlyArray<ComponentRow>;
  readonly brands: ReadonlyArray<BrandHealth>;
  readonly retention: ReadonlyArray<RetentionCell>;
}

const EMPTY: TeamAnalytics = {
  templates: [],
  components: [],
  brands: [],
  retention: [],
};

const DEFAULT_BASE: string =
  (typeof process !== 'undefined' ? process.env['TEAM_ANALYTICS_URL'] : undefined) ??
  'http://localhost:8093';

interface TemplateWire {
  template_id?: string;
  name?: string;
  workspace_count?: number;
  total_views?: number;
}

interface ComponentWire {
  component_id?: string;
  name?: string;
  usage?: number;
}

interface BrandWire {
  brand_id?: string;
  name?: string;
  health?: string;
  active_tokens?: number;
}

interface RetentionWire {
  cohort?: string;
  d7?: number;
  d30?: number;
  d90?: number;
}

function asHealth(value: string | undefined): BrandHealth['health'] {
  if (value === 'green' || value === 'amber' || value === 'red') return value;
  return 'amber';
}

function mapTemplate(raw: TemplateWire): TemplateRow {
  return {
    templateId: String(raw.template_id ?? ''),
    name: String(raw.name ?? ''),
    workspaceCount: Number(raw.workspace_count ?? 0),
    totalViews: Number(raw.total_views ?? 0),
  };
}

function mapComponent(raw: ComponentWire): ComponentRow {
  return {
    componentId: String(raw.component_id ?? ''),
    name: String(raw.name ?? ''),
    usage: Number(raw.usage ?? 0),
  };
}

function mapBrand(raw: BrandWire): BrandHealth {
  return {
    brandId: String(raw.brand_id ?? ''),
    name: String(raw.name ?? ''),
    health: asHealth(raw.health),
    activeTokens: Number(raw.active_tokens ?? 0),
  };
}

function mapRetention(raw: RetentionWire): RetentionCell {
  return {
    cohort: String(raw.cohort ?? ''),
    d7: Number(raw.d7 ?? 0),
    d30: Number(raw.d30 ?? 0),
    d90: Number(raw.d90 ?? 0),
  };
}

interface TemplateEnvelope {
  templates?: TemplateWire[];
}
interface ComponentEnvelope {
  components?: ComponentWire[];
}
interface BrandEnvelope {
  brands?: BrandWire[];
}
interface RetentionEnvelope {
  retention?: RetentionWire[];
}

/**
 * Fetch the workspace team-analytics summary.
 *
 * Returns an empty payload on any failure. The page renders an empty
 * state in that case — never fabricated rows.
 */
export async function fetchTeamAnalytics(
  workspaceId: string,
  baseUrl: string = DEFAULT_BASE,
): Promise<TeamAnalytics> {
  try {
    const [t, c, b, r] = await Promise.all([
      fetcher<TemplateEnvelope>(baseUrl, '/v1/analytics/team/templates/top', { workspaceId }),
      fetcher<ComponentEnvelope>(baseUrl, '/v1/analytics/team/components/top', { workspaceId }),
      fetcher<BrandEnvelope>(baseUrl, '/v1/analytics/team/brands/health', { workspaceId }),
      fetcher<RetentionEnvelope>(baseUrl, '/v1/analytics/team/retention', { workspaceId }),
    ]);
    return {
      templates: (t.templates ?? []).map(mapTemplate),
      components: (c.components ?? []).map(mapComponent),
      brands: (b.brands ?? []).map(mapBrand),
      retention: (r.retention ?? []).map(mapRetention),
    };
  } catch {
    return EMPTY;
  }
}

/**
 * @deprecated — kept for backwards compat. Use `fetchTeamAnalytics`
 * (which returns the full bundle) instead.
 */
export const BOOTSTRAP_TEAM: ReadonlyArray<never> = [];

/**
 * @deprecated — use `fetchTeamAnalytics` instead.
 */
export async function listTeam(_workspaceId: string): Promise<ReadonlyArray<never>> {
  return BOOTSTRAP_TEAM;
}

/**
 * Wave 7 §S7.10 — extended surfaces for team analytics.
 *
 * Most-active creators + template usage heatmap drive the
 * leaderboard + heatmap components below.
 */
export interface CreatorRow {
  readonly creatorId: string;
  readonly displayName: string;
  readonly decksPublished: number;
  readonly totalViews: number;
}

export interface TemplateUsageCell {
  readonly templateId: string;
  readonly templateName: string;
  readonly category: string;
  /** Bucketed engagement (0–100). */
  readonly engagement: number;
  /** Total views over the window. */
  readonly views: number;
}

interface CreatorWire {
  creator_id?: string;
  display_name?: string;
  decks_published?: number;
  total_views?: number;
}

interface TemplateUsageWire {
  template_id?: string;
  template_name?: string;
  category?: string;
  engagement?: number;
  views?: number;
}

function mapCreator(raw: CreatorWire): CreatorRow {
  return {
    creatorId: String(raw.creator_id ?? ''),
    displayName: String(raw.display_name ?? ''),
    decksPublished: Number(raw.decks_published ?? 0),
    totalViews: Number(raw.total_views ?? 0),
  };
}

function mapUsageCell(raw: TemplateUsageWire): TemplateUsageCell {
  const engagement = Number(raw.engagement ?? 0);
  return {
    templateId: String(raw.template_id ?? ''),
    templateName: String(raw.template_name ?? ''),
    category: String(raw.category ?? 'general'),
    engagement: Math.max(0, Math.min(100, engagement)),
    views: Number(raw.views ?? 0),
  };
}

export interface CreatorLeaderboard {
  readonly creators: ReadonlyArray<CreatorRow>;
  readonly templates: ReadonlyArray<TemplateRow>;
}

export interface TemplateUsageHeatmap {
  readonly cells: ReadonlyArray<TemplateUsageCell>;
}

/**
 * Fetch the creator + template leaderboard. Returns empty lists on
 * any failure.
 */
export async function fetchCreatorLeaderboard(
  workspaceId: string,
  baseUrl: string = DEFAULT_BASE,
): Promise<CreatorLeaderboard> {
  try {
    const json = await fetcher<{ creators?: CreatorWire[]; templates?: TemplateWire[] }>(
      baseUrl,
      '/v1/analytics/team/leaderboard',
      { workspaceId },
    );
    return {
      creators: (json.creators ?? []).map(mapCreator),
      templates: (json.templates ?? []).map(mapTemplate),
    };
  } catch {
    return { creators: [], templates: [] };
  }
}

/**
 * Fetch template usage heatmap cells. Returns an empty list on any
 * failure.
 */
export async function fetchTemplateUsageHeatmap(
  workspaceId: string,
  category: string | null = null,
  baseUrl: string = DEFAULT_BASE,
): Promise<TemplateUsageHeatmap> {
  try {
    const json = await fetcher<{ cells?: TemplateUsageWire[] }>(
      baseUrl,
      '/v1/analytics/team/template-usage',
      { workspaceId },
    );
    let cells = (json.cells ?? []).map(mapUsageCell);
    if (category) cells = cells.filter((c) => c.category === category);
    return { cells };
  } catch {
    return { cells: [] };
  }
}

export const TEAM_ANALYTICS_CATEGORIES: ReadonlyArray<string> = [
  'sales',
  'investor',
  'onboarding',
  'marketing',
  'education',
  'general',
];
