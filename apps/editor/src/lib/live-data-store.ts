/**
 * Live Data Store — in-memory demo store for Phase 08.
 *
 * Structure is designed so swapping in real api-client calls later
 * is a thin change: each function mirrors what a real client would expose.
 */

import { generate, type MockSpec, type MockResult } from '@domio/mock-data';
import type { Dataset, ColumnDef, ChartType, BindingSchema } from '@domio/chart';
import { requiredBindings } from '@domio/chart';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type FreshnessStatus = 'fresh' | 'stale' | 'offline' | 'loading';
export type PollInterval = number; // ms

export interface DataSource {
  id: string;
  name: string;
  kind: 'mock' | 'connected';
  freshness: FreshnessStatus;
  lastUpdated: number;
  dataset: Dataset;
  columns: ColumnDef[];
  rowCount: number;
}

export interface ThresholdRule {
  id: string;
  measure: string;
  comparator: 'lt' | 'lte' | 'gt' | 'gte' | 'eq' | 'between' | 'outside';
  values: number[];
  severity: 'info' | 'warn' | 'critical';
  styleOverride: Record<string, unknown>;
}

export interface LiveDataBinding {
  queryId: string | null;
  fieldMap: Record<string, string>;
  listenToFilters: string[];
}

export interface Scenario {
  id: string;
  name: string;
  parentId: string | null;
  isBase: boolean;
  overrides: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Demo datasets
// ---------------------------------------------------------------------------

const REVENUE_SPEC: MockSpec = {
  seed: 42,
  n: 24,
  fields: [
    { name: 'month', type: 'string', categories: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] },
    { name: 'revenue', type: 'number', min: 12000, max: 85000, distribution: 'normal', mean: 48000, stddev: 18000 },
    { name: 'expenses', type: 'number', min: 8000, max: 52000, distribution: 'normal', mean: 32000, stddev: 10000 },
    { name: 'profit', type: 'number', min: -5000, max: 38000, distribution: 'normal', mean: 16000, stddev: 9000 },
    { name: 'category', type: 'string', categories: ['SaaS', 'Services', 'Hardware'] },
  ],
};

const USER_SPEC: MockSpec = {
  seed: 137,
  n: 50,
  fields: [
    { name: 'region', type: 'string', categories: ['North America', 'Europe', 'Asia Pacific', 'Latin America'] },
    { name: 'users', type: 'number', min: 200, max: 15000, distribution: 'lognormal', mean: 5000, stddev: 3000 },
    { name: 'sessions', type: 'number', min: 400, max: 40000, distribution: 'lognormal', mean: 12000, stddev: 8000 },
    { name: 'conversion', type: 'number', min: 1.2, max: 12.8, distribution: 'uniform' },
  ],
};

const PIPELINE_SPEC: MockSpec = {
  seed: 256,
  n: 30,
  fields: [
    { name: 'stage', type: 'string', categories: ['Prospect', 'Qualified', 'Proposal', 'Negotiation', 'Closed Won', 'Closed Lost'] },
    { name: 'deals', type: 'number', min: 1, max: 45, distribution: 'poisson', lambda: 12 },
    { name: 'value', type: 'number', min: 5000, max: 250000, distribution: 'lognormal', mean: 60000, stddev: 40000 },
    { name: 'rep', type: 'string', categories: ['Alice', 'Bob', 'Carol', 'Dave', 'Eve'] },
  ],
};

function mockDataset(spec: MockSpec): { dataset: Dataset; mock: MockResult } {
  const mock = generate(spec);
  const columns: ColumnDef[] = mock.columns.map((c: { name: string; type: string }) => ({
    name: c.name,
    type: c.type as ColumnDef['type'],
  }));
  return { dataset: { columns, rows: mock.rows }, mock };
}

// ---------------------------------------------------------------------------
// Store state (module singleton)
// ---------------------------------------------------------------------------

function buildDataSources(): DataSource[] {
  const r = mockDataset(REVENUE_SPEC);
  const u = mockDataset(USER_SPEC);
  const p = mockDataset(PIPELINE_SPEC);

  return [
    {
      id: 'ds-revenue',
      name: 'Revenue Metrics',
      kind: 'mock',
      freshness: 'fresh',
      lastUpdated: Date.now(),
      dataset: r.dataset,
      columns: r.dataset.columns,
      rowCount: r.mock.rows.length,
    },
    {
      id: 'ds-users',
      name: 'User Analytics',
      kind: 'mock',
      freshness: 'fresh',
      lastUpdated: Date.now(),
      dataset: u.dataset,
      columns: u.dataset.columns,
      rowCount: u.mock.rows.length,
    },
    {
      id: 'ds-pipeline',
      name: 'Sales Pipeline',
      kind: 'mock',
      freshness: 'fresh',
      lastUpdated: Date.now(),
      dataset: p.dataset,
      columns: p.dataset.columns,
      rowCount: p.mock.rows.length,
    },
  ];
}

let _sources: DataSource[] = buildDataSources();
let _scenarios: Scenario[] = [
  { id: 'scenario-base', name: 'Base', parentId: null, isBase: true, overrides: {} },
];
let _activeScenarioId: string = 'scenario-base';
let _listeners: Array<() => void> = [];

function notify() {
  for (const fn of _listeners) fn();
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function getDataSources(): DataSource[] {
  return _sources;
}

export function getDataSource(id: string): DataSource | undefined {
  return _sources.find((s) => s.id === id);
}

export function addMockDataset(name: string, seed: number, rowCount: number): DataSource {
  const spec: MockSpec = {
    seed,
    n: Math.min(rowCount, 500),
    fields: [
      { name: 'label', type: 'string', categories: ['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon', 'Zeta'] },
      { name: 'value', type: 'number', min: 10, max: 990, distribution: 'uniform' },
      { name: 'metric', type: 'number', min: 0, max: 100, distribution: 'normal', mean: 50, stddev: 20 },
    ],
  };
  const { dataset, mock } = mockDataset(spec);
  const ds: DataSource = {
    id: `ds-mock-${Date.now()}`,
    name,
    kind: 'mock',
    freshness: 'fresh',
    lastUpdated: Date.now(),
    dataset,
    columns: dataset.columns,
    rowCount: mock.rows.length,
  };
  _sources = [..._sources, ds];
  notify();
  return ds;
}

export function removeDataSource(id: string): void {
  _sources = _sources.filter((s) => s.id !== id);
  notify();
}

/** Simulate freshness tick — advances stale/offline on mock sources. */
export function tickFreshness(): void {
  _sources = _sources.map((s) => {
    if (s.kind !== 'mock') return s;
    const age = Date.now() - s.lastUpdated;
    if (age < 30_000) return { ...s, freshness: 'fresh' as const };
    if (age < 120_000) return { ...s, freshness: 'stale' as const };
    return { ...s, freshness: 'offline' as const };
  });
  notify();
}

export function refreshSource(id: string): void {
  _sources = _sources.map((s) =>
    s.id === id ? { ...s, freshness: 'loading' as const } : s,
  );
  notify();
  // Simulate network delay
  setTimeout(() => {
    _sources = _sources.map((s) =>
      s.id === id ? { ...s, freshness: 'fresh' as const, lastUpdated: Date.now() } : s,
    );
    notify();
  }, 800);
}

// ---------------------------------------------------------------------------
// Scenarios
// ---------------------------------------------------------------------------

export function getScenarios(): Scenario[] {
  return _scenarios;
}

export function getActiveScenarioId(): string {
  return _activeScenarioId;
}

export function getActiveScenario(): Scenario | undefined {
  return _scenarios.find((s) => s.id === _activeScenarioId);
}

export function createScenario(name: string, parentId: string): Scenario {
  const scenario: Scenario = {
    id: `scenario-${Date.now()}`,
    name,
    parentId,
    isBase: false,
    overrides: {},
  };
  _scenarios = [..._scenarios, scenario];
  notify();
  return scenario;
}

export function setActiveScenario(id: string): void {
  _activeScenarioId = id;
  notify();
}

// ---------------------------------------------------------------------------
// Binding helpers
// ---------------------------------------------------------------------------

export function getBindingSchema(chartType: ChartType): BindingSchema {
  return {
    type: chartType,
    columns: requiredBindings(chartType).map((r: { role: string; columnType: string }) => ({
      role: r.role as BindingSchema['columns'][number]['role'],
      column: '', // unassigned
    })),
  };
}

export function getRequiredRoles(chartType: ChartType): Array<{ role: string; columnType: string }> {
  return requiredBindings(chartType).map((r: { role: string; columnType: string }) => ({
    role: r.role,
    columnType: r.columnType,
  }));
}

// ---------------------------------------------------------------------------
// Subscription API
// ---------------------------------------------------------------------------

export function subscribe(listener: () => void): () => void {
  _listeners = [..._listeners, listener];
  return () => {
    _listeners = _listeners.filter((l) => l !== listener);
  };
}

/** Reset store for tests. */
export function resetStore(): void {
  _sources = buildDataSources();
  _scenarios = [
    { id: 'scenario-base', name: 'Base', parentId: null, isBase: true, overrides: {} },
  ];
  _activeScenarioId = 'scenario-base';
  _listeners = [];
}
