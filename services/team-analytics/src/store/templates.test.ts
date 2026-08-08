/**
 * Team-analytics — DAO tests (Phase 17 W9).
 *
 * Validates parameter substitution, workspace_id tenant scoping, and
 * shape mapping (funnel conversion_rate normalisation, brand-health
 * thresholding).
 */

import { describe, it, expect } from 'vitest';
import { buildInMemoryClickHouseClient } from './clickhouse.js';
import { buildTemplateDao } from './templates.js';
import type { QueryScope } from '../types.js';

function scope(workspace_id = 'ws-1'): QueryScope {
  return {
    workspace_id,
    from_ms: 1_700_000_000_000,
    to_ms: 1_700_086_400_000,
  };
}

describe('buildTemplateDao.topTemplates', () => {
  it('issues a SELECT against team_metric_materialized_view with workspace_id', async () => {
    const ch = buildInMemoryClickHouseClient();
    const dao = buildTemplateDao(ch);
    const rows = await dao.topTemplates(scope(), 5);
    expect(rows).toEqual([]);
    expect(ch.queries).toHaveLength(1);
    const q = ch.queries[0]!;
    expect(q.sql).toMatch(/team_metric_materialized_view/);
    expect(q.params?.['workspace_id']).toBe('ws-1');
    expect(q.params?.['limit']).toBe(5);
  });

  it('returns the seeded rows unchanged', async () => {
    const ch = buildInMemoryClickHouseClient();
    ch.setRows('team_metric_materialized_view', [
      {
        workspace_id: 'ws-1',
        template_id: 'tpl-1',
        deck_count: 4,
        total_views: 100,
        total_completions: 10,
        distinct_viewers: 25,
        composite_score: 150,
      },
    ]);
    const dao = buildTemplateDao(ch);
    const rows = await dao.topTemplates(scope(), 10);
    expect(rows[0]?.template_id).toBe('tpl-1');
    expect(rows[0]?.composite_score).toBe(150);
  });
});

describe('buildTemplateDao.brandHealth', () => {
  it('classifies status as trending when delta > 20%', async () => {
    const ch = buildInMemoryClickHouseClient();
    ch.setRows('team_metric_materialized_view', [
      { brand_kit_id: 'brand-A', total_views_30d: 120, total_views_prev: 80 },
      { brand_kit_id: 'brand-B', total_views_30d: 50, total_views_prev: 100 },
      { brand_kit_id: 'brand-C', total_views_30d: 70, total_views_prev: 70 },
    ]);
    const dao = buildTemplateDao(ch);
    const rows = await dao.brandHealth('ws-1', 1_700_000_000_000);
    const map = new Map(rows.map((r) => [r.brand_kit_id, r]));
    expect(map.get('brand-A')?.status).toBe('trending');
    expect(map.get('brand-B')?.status).toBe('declining');
    expect(map.get('brand-C')?.status).toBe('stable');
  });
});

describe('buildTemplateDao.funnel', () => {
  it('returns an empty array for empty steps', async () => {
    const ch = buildInMemoryClickHouseClient();
    const dao = buildTemplateDao(ch);
    const rows = await dao.funnel(scope(), []);
    expect(rows).toEqual([]);
    expect(ch.queries).toHaveLength(0);
  });

  it('normalises conversion_rate against step 0', async () => {
    const ch = buildInMemoryClickHouseClient();
    ch.setRows('UNION ALL', [
      { step_index: 0, step_name: 'view', entered: 100 },
      { step_index: 1, step_name: 'share', entered: 40 },
      { step_index: 2, step_name: 'react', entered: 10 },
    ]);
    const dao = buildTemplateDao(ch);
    const rows = await dao.funnel(scope(), ['view', 'share', 'react']);
    expect(rows[0]?.conversion_rate).toBe(1);
    expect(rows[1]?.conversion_rate).toBeCloseTo(0.4, 5);
    expect(rows[2]?.conversion_rate).toBeCloseTo(0.1, 5);
  });

  it('passes the step name as a parameter per step', async () => {
    const ch = buildInMemoryClickHouseClient();
    const dao = buildTemplateDao(ch);
    await dao.funnel(scope(), ['view', 'share', 'react']);
    expect(ch.queries[0]?.params?.['step_0']).toBe('view');
    expect(ch.queries[0]?.params?.['step_1']).toBe('share');
    expect(ch.queries[0]?.params?.['step_2']).toBe('react');
  });
});