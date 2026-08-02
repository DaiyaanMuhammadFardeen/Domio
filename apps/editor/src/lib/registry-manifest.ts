/**
 * Registry manifest — a small in-repo JSON of curated component versions.
 * Used by the Library panel for update-badge comparison.
 */

export interface RegistryEntry {
  catalogId: string;
  latestVersion: string;
}

export const REGISTRY_MANIFEST: readonly RegistryEntry[] = [
  { catalogId: 'domio.stat-card', latestVersion: '1.0.0' },
  { catalogId: 'domio.kpi-trio', latestVersion: '1.0.0' },
  { catalogId: 'domio.metric-hero', latestVersion: '1.0.0' },
  { catalogId: 'domio.progress-card', latestVersion: '1.0.0' },
  { catalogId: 'domio.bar-chart', latestVersion: '1.0.0' },
  { catalogId: 'domio.line-chart', latestVersion: '1.0.0' },
  { catalogId: 'domio.donut-chart', latestVersion: '1.0.0' },
  { catalogId: 'domio.quadrant-chart', latestVersion: '1.0.0' },
  { catalogId: 'domio.comparison-table', latestVersion: '1.0.0' },
  { catalogId: 'domio.data-table', latestVersion: '1.0.0' },
  { catalogId: 'domio.roadmap', latestVersion: '1.0.0' },
  { catalogId: 'domio.timeline', latestVersion: '1.0.0' },
  { catalogId: 'domio.section-header', latestVersion: '1.0.0' },
  { catalogId: 'domio.agenda', latestVersion: '1.0.0' },
  { catalogId: 'domio.bullet-list', latestVersion: '1.0.0' },
  { catalogId: 'domio.numbered-steps', latestVersion: '1.0.0' },
  { catalogId: 'domio.callout', latestVersion: '1.0.0' },
  { catalogId: 'domio.quote-block', latestVersion: '1.0.0' },
  { catalogId: 'domio.badges', latestVersion: '1.0.0' },
  { catalogId: 'domio.team-grid', latestVersion: '1.0.0' },
  { catalogId: 'domio.profile-card', latestVersion: '1.0.0' },
  { catalogId: 'domio.bento-grid', latestVersion: '1.0.0' },
  { catalogId: 'domio.kanban-board', latestVersion: '1.0.0' },
  { catalogId: 'domio.org-chart', latestVersion: '1.0.0' },
  { catalogId: 'domio.icon', latestVersion: '1.0.0' },
];

const byCatalogId = new Map(REGISTRY_MANIFEST.map((e) => [e.catalogId, e]));

export function getLatestVersion(catalogId: string): string | undefined {
  return byCatalogId.get(catalogId)?.latestVersion;
}
