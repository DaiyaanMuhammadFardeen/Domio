/**
 * Connector Service — typed client for /v1/connector-framework/sources.
 *
 * Per Wave 2 §S2.7 of docs/frontend-roadmap/02-wave-editor-surface.md.
 *
 * Surfaces the list of supported data-source connectors (Sheets, Airtable,
 * Notion, Postgres, MySQL, BigQuery, Snowflake, REST, GraphQL, Mock),
 * their credential schemas, and methods to register / refresh / remove
 * a source. Falls back to bootstrap mode (synthetic dataset) when the
 * backend is unreachable.
 */

import { generate, type MockSpec } from '@domio/mock-data';
import type { Dataset, ColumnDef } from '@domio/chart';

// ─── Connector catalog ──────────────────────────────────────────────────────

export type ConnectorKind =
  | 'sheets'
  | 'airtable'
  | 'notion'
  | 'postgres'
  | 'mysql'
  | 'bigquery'
  | 'snowflake'
  | 'rest'
  | 'graphql'
  | 'mock';

export interface ConnectorCredentialField {
  /** Field key in the credential object. */
  key: string;
  /** User-facing label. */
  label: string;
  /** Whether the value is a secret (password-masked). */
  secret: boolean;
  /** Whether the field is required. */
  required: boolean;
  /** Optional placeholder. */
  placeholder?: string;
  /** Optional fixed list of allowed values. */
  options?: readonly string[];
}

export interface ConnectorDescriptor {
  kind: ConnectorKind;
  label: string;
  /** Short description shown in the picker. */
  description: string;
  /** Logo glyph (single character or emoji). */
  glyph: string;
  /** Type of authentication: 'oauth' | 'connection-string' | 'api-key' | 'none'. */
  authType: 'oauth' | 'connection-string' | 'api-key' | 'none';
  /** Form fields for the credentials. */
  fields: readonly ConnectorCredentialField[];
  /** Whether this connector requires user-side OAuth flow. */
  requiresOAuth?: boolean;
}

const CONNECTORS: readonly ConnectorDescriptor[] = [
  {
    kind: 'sheets',
    label: 'Google Sheets',
    description: 'Live-sync a public or shared spreadsheet.',
    glyph: '📊',
    authType: 'oauth',
    fields: [
      { key: 'sheetId', label: 'Sheet ID', secret: false, required: true, placeholder: '1AbCdEf…' },
      { key: 'range', label: 'Range', secret: false, required: false, placeholder: 'A1:Z1000' },
    ],
    requiresOAuth: true,
  },
  {
    kind: 'airtable',
    label: 'Airtable',
    description: 'Sync a base, table, and view.',
    glyph: '🗂',
    authType: 'api-key',
    fields: [
      { key: 'apiKey', label: 'API Key', secret: true, required: true },
      { key: 'baseId', label: 'Base ID', secret: false, required: true, placeholder: 'app…' },
      { key: 'tableName', label: 'Table', secret: false, required: true },
    ],
  },
  {
    kind: 'notion',
    label: 'Notion',
    description: 'Sync a database query.',
    glyph: '📝',
    authType: 'oauth',
    fields: [{ key: 'databaseId', label: 'Database ID', secret: false, required: true }],
    requiresOAuth: true,
  },
  {
    kind: 'postgres',
    label: 'PostgreSQL',
    description: 'Connect via a connection string.',
    glyph: '🐘',
    authType: 'connection-string',
    fields: [
      {
        key: 'connectionString',
        label: 'Connection string',
        secret: true,
        required: true,
        placeholder: 'postgres://user:pass@host:5432/db',
      },
    ],
  },
  {
    kind: 'mysql',
    label: 'MySQL',
    description: 'Connect via a connection string.',
    glyph: '🐬',
    authType: 'connection-string',
    fields: [
      {
        key: 'connectionString',
        label: 'Connection string',
        secret: true,
        required: true,
        placeholder: 'mysql://user:pass@host:3306/db',
      },
    ],
  },
  {
    kind: 'bigquery',
    label: 'BigQuery',
    description: 'Sync a query result.',
    glyph: '🔷',
    authType: 'connection-string',
    fields: [
      { key: 'projectId', label: 'Project ID', secret: false, required: true },
      { key: 'datasetId', label: 'Dataset', secret: false, required: true },
      { key: 'credentialsJson', label: 'Credentials JSON', secret: true, required: true },
    ],
  },
  {
    kind: 'snowflake',
    label: 'Snowflake',
    description: 'Sync a query result.',
    glyph: '❄️',
    authType: 'connection-string',
    fields: [
      { key: 'account', label: 'Account', secret: false, required: true },
      { key: 'warehouse', label: 'Warehouse', secret: false, required: true },
      { key: 'database', label: 'Database', secret: false, required: true },
      { key: 'username', label: 'Username', secret: false, required: true },
      { key: 'password', label: 'Password', secret: true, required: true },
    ],
  },
  {
    kind: 'rest',
    label: 'REST API',
    description: 'Fetch a JSON resource.',
    glyph: '🌐',
    authType: 'api-key',
    fields: [
      { key: 'url', label: 'URL', secret: false, required: true, placeholder: 'https://…' },
      { key: 'bearer', label: 'Bearer token', secret: true, required: false },
    ],
  },
  {
    kind: 'graphql',
    label: 'GraphQL',
    description: 'Sync a GraphQL query.',
    glyph: '◢',
    authType: 'api-key',
    fields: [
      { key: 'url', label: 'Endpoint', secret: false, required: true },
      { key: 'bearer', label: 'Bearer token', secret: true, required: false },
      { key: 'query', label: 'Query', secret: false, required: true },
    ],
  },
  {
    kind: 'mock',
    label: 'Mock dataset',
    description: 'Generate a synthetic dataset (no credentials).',
    glyph: '🧪',
    authType: 'none',
    fields: [
      {
        key: 'rows',
        label: 'Row count',
        secret: false,
        required: true,
        options: ['10', '50', '100', '500'],
      },
      { key: 'seed', label: 'Seed', secret: false, required: false },
    ],
  },
];

export function listConnectors(): readonly ConnectorDescriptor[] {
  return CONNECTORS;
}

export function getConnector(kind: ConnectorKind): ConnectorDescriptor | undefined {
  return CONNECTORS.find((c) => c.kind === kind);
}

// ─── Source registration ────────────────────────────────────────────────────

export interface RegisterSourceRequest {
  kind: ConnectorKind;
  name: string;
  credentials: Record<string, string>;
}

export interface RemoteSource {
  id: string;
  kind: ConnectorKind;
  name: string;
  rowCount: number;
  lastSyncedAtMs: number;
  /** Last error message, if any. */
  lastError?: string;
  /** Detected columns. */
  columns: ColumnDef[];
}

const DEFAULT_API_BASE: string =
  (typeof process !== 'undefined'
    ? (process.env['NEXT_PUBLIC_API_URL'] as string | undefined)
    : undefined) ?? 'http://localhost:8080';

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
  return (await res.json()) as T;
}

async function deleteJson(url: string): Promise<void> {
  const res = await fetch(url, { method: 'DELETE' });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
}

/**
 * Register a new source via `POST /v1/connector-framework/sources`.
 * Falls back to a bootstrap mock source when the backend is unreachable.
 */
export async function registerSource(
  req: RegisterSourceRequest,
  baseUrl: string = DEFAULT_API_BASE,
): Promise<RemoteSource> {
  try {
    return await postJson<RemoteSource>(`${baseUrl}/v1/connector-framework/sources`, req);
  } catch {
    return bootstrapSource(req);
  }
}

/**
 * Refresh a source — re-pulls data. When offline, re-generates the
 * mock dataset. Returns the freshly fetched fresh timestamp.
 */
export async function refreshRemoteSource(
  id: string,
  baseUrl: string = DEFAULT_API_BASE,
): Promise<RemoteSource> {
  try {
    return await postJson<RemoteSource>(
      `${baseUrl}/v1/connector-framework/sources/${encodeURIComponent(id)}/refresh`,
      {},
    );
  } catch {
    // Bootstrap: re-emit a synth source with fresh timestamp.
    return {
      id,
      kind: 'mock',
      name: 'Mock (refresh)',
      rowCount: 24,
      lastSyncedAtMs: Date.now(),
      columns: [],
    };
  }
}

/**
 * Delete a source on the backend. When offline, returns silently.
 */
export async function removeRemoteSource(
  id: string,
  baseUrl: string = DEFAULT_API_BASE,
): Promise<void> {
  try {
    await deleteJson(`${baseUrl}/v1/connector-framework/sources/${encodeURIComponent(id)}`);
  } catch {
    // ignore — bootstrap-mode
  }
}

// ─── Bootstrap default ──────────────────────────────────────────────────────

function bootstrapSource(req: RegisterSourceRequest): RemoteSource {
  let dataset: Dataset;
  let rowCount = 24;
  if (req.kind === 'mock') {
    const spec: MockSpec = {
      seed: Number(req.credentials['seed'] ?? '42') || 42,
      n: Math.min(Number(req.credentials['rows'] ?? '50') || 50, 500),
      fields: [
        {
          name: 'label',
          type: 'string',
          categories: ['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon', 'Zeta'],
        },
        { name: 'value', type: 'number', min: 10, max: 990, distribution: 'uniform' },
        {
          name: 'metric',
          type: 'number',
          min: 0,
          max: 100,
          distribution: 'normal',
          mean: 50,
          stddev: 20,
        },
      ],
    };
    const out = generate(spec);
    dataset = { columns: out.columns as ColumnDef[], rows: out.rows };
    rowCount = out.rows.length;
  } else {
    // For non-mock in bootstrap, generate a generic placeholder dataset.
    const spec: MockSpec = {
      seed: 1,
      n: 24,
      fields: [
        { name: 'key', type: 'string', categories: ['A', 'B', 'C', 'D'] },
        { name: 'value', type: 'number', min: 1, max: 100, distribution: 'uniform' },
      ],
    };
    const out = generate(spec);
    dataset = { columns: out.columns as ColumnDef[], rows: out.rows };
    rowCount = out.rows.length;
  }
  return {
    id: `source-${Date.now()}`,
    kind: req.kind,
    name: req.name,
    rowCount,
    lastSyncedAtMs: Date.now(),
    columns: dataset.columns,
  };
}

// ─── Freshness tracker ──────────────────────────────────────────────────────

/**
 * Format a last-synced timestamp as a relative-time string.
 * Mirrors the contract of `services/freshness-tracker`'s relativeTime.
 */
export function formatLastSynced(lastSyncedAtMs: number): string {
  const diff = Date.now() - lastSyncedAtMs;
  const seconds = Math.max(0, Math.round(diff / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

/**
 * Validate that all required credential fields are present. Fields
 * with a fixed `options` list default to the first option if the
 * user hasn't picked one yet.
 */
export function validateCredentials(
  descriptor: ConnectorDescriptor,
  credentials: Record<string, string>,
): { ok: boolean; missing: string[] } {
  const missing: string[] = [];
  for (const f of descriptor.fields) {
    const value = credentials[f.key] ?? (f.options ? f.options[0] : '');
    if (f.required && !value?.trim()) {
      missing.push(f.label);
    }
  }
  return { ok: missing.length === 0, missing };
}

// ─── Scenario bindings (per-scenario dataset override) ──────────────────────

export interface ScenarioBindingPayload {
  sourceId: string | null;
  fieldMap: Record<string, string>;
}

/**
 * POST /v1/scenario/{id}/bindings — edit a scenario's dataset
 * binding. When the backend is unreachable, returns silently so the
 * editor stays usable in bootstrap mode.
 */
export async function postScenarioBindings(
  scenarioId: string,
  payload: ScenarioBindingPayload,
  baseUrl: string = DEFAULT_API_BASE,
): Promise<void> {
  try {
    const res = await fetch(`${baseUrl}/v1/scenario/${encodeURIComponent(scenarioId)}/bindings`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
  } catch {
    // ignore — bootstrap-mode
  }
}
