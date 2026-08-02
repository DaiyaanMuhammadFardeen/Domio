/**
 * Component catalog — the curated pack registry. Frontend-first source of
 * truth for what the Insert panel, prop engine, and renderers resolve.
 */

import type { DomioComponentDef } from './types.js';
import { STAT_CARD, KPI_TRIO, METRIC_HERO, PROGRESS_CARD } from './components/stats.js';
import { BAR_CHART, LINE_CHART, DONUT_CHART, QUADRANT_CHART } from './components/charts.js';
import { COMPARISON_TABLE, DATA_TABLE, ROADMAP, TIMELINE } from './components/tables.js';
import { SECTION_HEADER, AGENDA, BULLET_LIST, NUMBERED_STEPS, CALLOUT, QUOTE_BLOCK, BADGES } from './components/structure.js';
import { TEAM_GRID, PROFILE_CARD } from './components/people.js';
import { BENTO_GRID, KANBAN_BOARD, ORG_CHART } from './components/layout.js';
import { ICON } from './components/icons.js';

export const CATALOG: readonly DomioComponentDef[] = [
  STAT_CARD,
  KPI_TRIO,
  METRIC_HERO,
  PROGRESS_CARD,
  BAR_CHART,
  LINE_CHART,
  DONUT_CHART,
  QUADRANT_CHART,
  COMPARISON_TABLE,
  DATA_TABLE,
  ROADMAP,
  TIMELINE,
  SECTION_HEADER,
  AGENDA,
  BULLET_LIST,
  NUMBERED_STEPS,
  CALLOUT,
  QUOTE_BLOCK,
  BADGES,
  TEAM_GRID,
  PROFILE_CARD,
  BENTO_GRID,
  KANBAN_BOARD,
  ORG_CHART,
  ICON,
];

const byCatalogId = new Map(CATALOG.map((def) => [def.catalogId, def]));

export function getComponent(catalogId: string): DomioComponentDef | undefined {
  return byCatalogId.get(catalogId);
}

export function listComponents(): readonly DomioComponentDef[] {
  return CATALOG;
}

export function listByCategory(category: DomioComponentDef['category']): readonly DomioComponentDef[] {
  return CATALOG.filter((def) => def.category === category);
}

export function listCategories(): DomioComponentDef['category'][] {
  return Array.from(new Set(CATALOG.map((def) => def.category)));
}

export function searchComponents(query: string): readonly DomioComponentDef[] {
  const q = query.trim().toLowerCase();
  if (!q) return CATALOG;
  return CATALOG.filter(
    (def) =>
      def.catalogId.toLowerCase().includes(q) ||
      def.name.toLowerCase().includes(q) ||
      def.description.toLowerCase().includes(q) ||
      def.category.toLowerCase().includes(q),
  );
}
