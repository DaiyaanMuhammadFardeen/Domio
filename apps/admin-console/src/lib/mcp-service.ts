/**
 * MCP (Model Context Protocol) server admin service — Wave 10 §S10.1.
 *
 * Surfaced from `apps/admin-console/src/app/mcp/**`:
 *   - `mcp/page.tsx`            — server status overview
 *   - `mcp/tools/page.tsx`      — tool registry browser
 *   - `mcp/permissions/page.tsx`— per-agent scopes + token rotation
 *   - `mcp/audit/page.tsx`      — agent action audit log
 *
 * The platform-api does not yet expose MCP endpoints, so each function
 * tries `fetcher<T>` and falls back to a deterministic seed. Mirrors the
 * `audit-service` / `api-key-service` pattern: resilient read APIs with
 * a fixed dev seed.
 */

import { fetcher } from './fetcher';

// Anchor "now" so the seed is stable across reloads in dev. Tests only
// rely on relative ordering / counts, not absolute timestamps.
const NOW = Date.UTC(2026, 7, 13); // 2026-08-13
const HOUR_MS = 60 * 60 * 1000;

// ── Types ────────────────────────────────────────────────────────────────

export interface MCPServerStatus {
  running: boolean;
  version: string;
  uptime_hours: number;
  last_restarted_ms: number;
  requests_per_min: number;
}

export interface MCPTool {
  name: string;
  description: string;
  params_schema: Record<string, unknown>;
  return_schema: Record<string, unknown>;
  rate_limit_class: 'low' | 'medium' | 'high';
  enabled: boolean;
}

export interface MCPAgentPermission {
  agent_id: string;
  agent_name: string;
  scopes: string[];
  token_last_rotated_ms: number;
  status: 'active' | 'revoked';
}

export interface MCPAuditEntry {
  id: string;
  timestamp_ms: number;
  agent_id: string;
  agent_name: string;
  tool: string;
  args: Record<string, unknown>;
  result_status: number;
  result_summary: string;
  latency_ms: number;
  trace_id: string;
}

export interface ListMCPAuditOptions {
  agentId?: string;
  tool?: string;
  sinceMs?: number;
}

// ── Seed: server status ─────────────────────────────────────────────────

const SEED_STATUS: MCPServerStatus = {
  running: true,
  version: '1.4.2',
  uptime_hours: 312,
  last_restarted_ms: NOW - 312 * HOUR_MS,
  requests_per_min: 48,
};

// ── Seed: tools ─────────────────────────────────────────────────────────

const TOOL_PARAMS_DECK_SUMMARIZE: Record<string, unknown> = {
  type: 'object',
  properties: {
    deck_id: { type: 'string', description: 'Deck identifier.' },
    max_slides: { type: 'integer', minimum: 1, maximum: 50, default: 10 },
    style: { type: 'string', enum: ['concise', 'detailed'], default: 'concise' },
  },
  required: ['deck_id'],
  additionalProperties: false,
};

const TOOL_RETURN_DECK_SUMMARIZE: Record<string, unknown> = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    slide_count: { type: 'integer' },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
  },
  required: ['summary', 'slide_count'],
};

const TOOL_PARAMS_BRAND_CHECK: Record<string, unknown> = {
  type: 'object',
  properties: {
    deck_id: { type: 'string' },
    region: { type: 'string', description: 'ISO-3166 region code.' },
    strict: { type: 'boolean', default: false },
  },
  required: ['deck_id', 'region'],
};

const TOOL_RETURN_BRAND_CHECK: Record<string, unknown> = {
  type: 'object',
  properties: {
    violations: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          rule_id: { type: 'string' },
          slide: { type: 'integer' },
          message: { type: 'string' },
        },
      },
    },
    passed: { type: 'boolean' },
  },
};

const TOOL_PARAMS_DATA_BIND: Record<string, unknown> = {
  type: 'object',
  properties: {
    deck_id: { type: 'string' },
    binding_id: { type: 'string' },
    sample_value: { type: 'string' },
  },
  required: ['deck_id', 'binding_id'],
};

const TOOL_RETURN_DATA_BIND: Record<string, unknown> = {
  type: 'object',
  properties: {
    ok: { type: 'boolean' },
    bound_slide: { type: 'integer' },
    bound_element: { type: 'string' },
  },
};

const TOOL_PARAMS_EXPORT: Record<string, unknown> = {
  type: 'object',
  properties: {
    deck_id: { type: 'string' },
    format: { type: 'string', enum: ['pdf', 'pptx', 'png'] },
    include_notes: { type: 'boolean', default: false },
  },
  required: ['deck_id', 'format'],
};

const TOOL_RETURN_EXPORT: Record<string, unknown> = {
  type: 'object',
  properties: {
    job_id: { type: 'string' },
    url: { type: 'string' },
    size_bytes: { type: 'integer' },
  },
};

const TOOL_PARAMS_PIPELINE: Record<string, unknown> = {
  type: 'object',
  properties: {
    pipeline: { type: 'string' },
    inputs: { type: 'object' },
    replay: { type: 'boolean', default: false },
  },
  required: ['pipeline', 'inputs'],
};

const TOOL_RETURN_PIPELINE: Record<string, unknown> = {
  type: 'object',
  properties: {
    run_id: { type: 'string' },
    stages: { type: 'array', items: { type: 'object' } },
    duration_ms: { type: 'integer' },
  },
};

const SEED_TOOLS: readonly MCPTool[] = [
  {
    name: 'deck.summarize',
    description:
      'Returns a textual summary of a deck plus slide count and a confidence score.',
    params_schema: TOOL_PARAMS_DECK_SUMMARIZE,
    return_schema: TOOL_RETURN_DECK_SUMMARIZE,
    rate_limit_class: 'high',
    enabled: true,
  },
  {
    name: 'brand.check',
    description:
      'Validates a deck against brand-lock rules for a given region.',
    params_schema: TOOL_PARAMS_BRAND_CHECK,
    return_schema: TOOL_RETURN_BRAND_CHECK,
    rate_limit_class: 'medium',
    enabled: true,
  },
  {
    name: 'data.bind',
    description:
      'Binds a sample value to a data-binding slot inside a deck.',
    params_schema: TOOL_PARAMS_DATA_BIND,
    return_schema: TOOL_RETURN_DATA_BIND,
    rate_limit_class: 'medium',
    enabled: true,
  },
  {
    name: 'deck.export',
    description:
      'Queues an export job that converts a deck to PDF, PPTX, or PNG.',
    params_schema: TOOL_PARAMS_EXPORT,
    return_schema: TOOL_RETURN_EXPORT,
    rate_limit_class: 'low',
    enabled: false,
  },
  {
    name: 'pipeline.run',
    description:
      'Runs a multi-stage agent pipeline (research → deck-builder → brand-compliance).',
    params_schema: TOOL_PARAMS_PIPELINE,
    return_schema: TOOL_RETURN_PIPELINE,
    rate_limit_class: 'high',
    enabled: true,
  },
];

// ── Seed: agents ────────────────────────────────────────────────────────

const SEED_AGENTS: readonly MCPAgentPermission[] = [
  {
    agent_id: 'agent-researcher',
    agent_name: 'Researcher',
    scopes: ['this-deck-only', 'read-only'],
    token_last_rotated_ms: NOW - 6 * 24 * HOUR_MS,
    status: 'active',
  },
  {
    agent_id: 'agent-deck-builder',
    agent_name: 'Deck builder',
    scopes: ['this-deck-only', 'data-binding-only', 'no-brand-locked-regions'],
    token_last_rotated_ms: NOW - 18 * HOUR_MS,
    status: 'active',
  },
  {
    agent_id: 'agent-brand-compliance',
    agent_name: 'Brand compliance',
    scopes: ['read-only'],
    token_last_rotated_ms: NOW - 30 * 24 * HOUR_MS,
    status: 'active',
  },
  {
    agent_id: 'agent-rehearsal-coach',
    agent_name: 'Rehearsal coach',
    scopes: ['this-deck-only'],
    token_last_rotated_ms: NOW - 2 * 24 * HOUR_MS,
    status: 'revoked',
  },
];

// Mutable working copy for rotate / revoke side-effects (reset between
// test runs because vitest resets module state).
const AGENT_STORE: MCPAgentPermission[] = SEED_AGENTS.map((a) => ({
  ...a,
  scopes: a.scopes.slice(),
}));

// ── Seed: audit log ─────────────────────────────────────────────────────

interface SeedAuditSpec {
  readonly hours_ago: number;
  readonly minute: number;
  readonly agent_id: string;
  readonly agent_name: string;
  readonly tool: string;
  readonly args: Record<string, unknown>;
  readonly result_status: number;
  readonly result_summary: string;
  readonly latency_ms: number;
}

const SEED_AUDIT_SPECS: ReadonlyArray<SeedAuditSpec> = [
  { hours_ago: 0, minute: 5, agent_id: 'agent-researcher', agent_name: 'Researcher', tool: 'deck.summarize', args: { deck_id: 'd-001', max_slides: 12 }, result_status: 200, result_summary: 'OK — 12 slides summarized', latency_ms: 412 },
  { hours_ago: 0, minute: 14, agent_id: 'agent-deck-builder', agent_name: 'Deck builder', tool: 'data.bind', args: { deck_id: 'd-001', binding_id: 'kpi.revenue', sample_value: '$4.2M' }, result_status: 200, result_summary: 'Bound to slide 7', latency_ms: 38 },
  { hours_ago: 0, minute: 33, agent_id: 'agent-brand-compliance', agent_name: 'Brand compliance', tool: 'brand.check', args: { deck_id: 'd-001', region: 'EU', strict: true }, result_status: 200, result_summary: '0 violations', latency_ms: 188 },
  { hours_ago: 1, minute: 12, agent_id: 'agent-researcher', agent_name: 'Researcher', tool: 'deck.summarize', args: { deck_id: 'd-002' }, result_status: 200, result_summary: 'OK — 8 slides', latency_ms: 354 },
  { hours_ago: 1, minute: 47, agent_id: 'agent-deck-builder', agent_name: 'Deck builder', tool: 'pipeline.run', args: { pipeline: 'deck-build-v3', inputs: { topic: 'Q3 review' } }, result_status: 200, result_summary: 'Run r-441 completed', latency_ms: 4230 },
  { hours_ago: 2, minute: 18, agent_id: 'agent-researcher', agent_name: 'Researcher', tool: 'deck.summarize', args: { deck_id: 'd-002', style: 'detailed' }, result_status: 429, result_summary: 'rate_limited — try again in 30s', latency_ms: 22 },
  { hours_ago: 3, minute: 9, agent_id: 'agent-brand-compliance', agent_name: 'Brand compliance', tool: 'brand.check', args: { deck_id: 'd-009', region: 'US' }, result_status: 200, result_summary: '3 violations (minor)', latency_ms: 211 },
  { hours_ago: 4, minute: 22, agent_id: 'agent-deck-builder', agent_name: 'Deck builder', tool: 'data.bind', args: { deck_id: 'd-003', binding_id: 'kpi.margin' }, result_status: 422, result_summary: 'missing binding', latency_ms: 18 },
  { hours_ago: 5, minute: 51, agent_id: 'agent-rehearsal-coach', agent_name: 'Rehearsal coach', tool: 'deck.summarize', args: { deck_id: 'd-004' }, result_status: 401, result_summary: 'token revoked', latency_ms: 9 },
  { hours_ago: 7, minute: 3, agent_id: 'agent-researcher', agent_name: 'Researcher', tool: 'pipeline.run', args: { pipeline: 'research-v2', inputs: { query: 'market trends' } }, result_status: 200, result_summary: 'Run r-422 completed', latency_ms: 1944 },
  { hours_ago: 9, minute: 18, agent_id: 'agent-brand-compliance', agent_name: 'Brand compliance', tool: 'brand.check', args: { deck_id: 'd-005', region: 'APAC' }, result_status: 200, result_summary: '1 violation', latency_ms: 174 },
  { hours_ago: 11, minute: 41, agent_id: 'agent-deck-builder', agent_name: 'Deck builder', tool: 'data.bind', args: { deck_id: 'd-006', binding_id: 'kpi.users' }, result_status: 200, result_summary: 'Bound to slide 2', latency_ms: 41 },
  { hours_ago: 14, minute: 27, agent_id: 'agent-researcher', agent_name: 'Researcher', tool: 'deck.summarize', args: { deck_id: 'd-007' }, result_status: 200, result_summary: 'OK — 16 slides', latency_ms: 489 },
  { hours_ago: 17, minute: 9, agent_id: 'agent-brand-compliance', agent_name: 'Brand compliance', tool: 'brand.check', args: { deck_id: 'd-007', region: 'EU' }, result_status: 200, result_summary: '0 violations', latency_ms: 156 },
  { hours_ago: 19, minute: 38, agent_id: 'agent-deck-builder', agent_name: 'Deck builder', tool: 'pipeline.run', args: { pipeline: 'deck-build-v3', inputs: { topic: 'Roadmap' } }, result_status: 200, result_summary: 'Run r-389 completed', latency_ms: 3672 },
  { hours_ago: 20, minute: 51, agent_id: 'agent-researcher', agent_name: 'Researcher', tool: 'deck.summarize', args: { deck_id: 'd-008' }, result_status: 500, result_summary: 'upstream_timeout', latency_ms: 5000 },
  { hours_ago: 22, minute: 14, agent_id: 'agent-brand-compliance', agent_name: 'Brand compliance', tool: 'brand.check', args: { deck_id: 'd-008', region: 'US', strict: false }, result_status: 200, result_summary: '2 violations', latency_ms: 198 },
  { hours_ago: 23, minute: 33, agent_id: 'agent-deck-builder', agent_name: 'Deck builder', tool: 'data.bind', args: { deck_id: 'd-008', binding_id: 'kpi.revenue' }, result_status: 200, result_summary: 'Bound to slide 11', latency_ms: 44 },
];

function buildAuditEntry(spec: SeedAuditSpec, index: number): MCPAuditEntry {
  const ts = NOW - spec.hours_ago * HOUR_MS - spec.minute * 60_000;
  // 32-hex-char trace id, deterministic per spec index.
  const hex = ((index + 1) * 2654435761) >>> 0;
  const base = hex.toString(16).padStart(8, '0');
  const trace_id = `${base}${base}${base}${base}`.slice(0, 32);
  return {
    id: `audit-${String(index + 1).padStart(4, '0')}`,
    timestamp_ms: ts,
    agent_id: spec.agent_id,
    agent_name: spec.agent_name,
    tool: spec.tool,
    args: { ...spec.args },
    result_status: spec.result_status,
    result_summary: spec.result_summary,
    latency_ms: spec.latency_ms,
    trace_id,
  };
}

const SEED_AUDIT: ReadonlyArray<MCPAuditEntry> = SEED_AUDIT_SPECS.map((s, i) =>
  buildAuditEntry(s, i),
);

// ── Public API ──────────────────────────────────────────────────────────

export async function getMCPStatus(): Promise<MCPServerStatus> {
  try {
    const remote = await fetcher<MCPServerStatus>('/v1/mcp/status');
    if (remote) return remote;
  } catch {
    // fall through to seed
  }
  return { ...SEED_STATUS };
}

export async function listMCPTools(): Promise<MCPTool[]> {
  try {
    const json = await fetcher<{ items?: MCPTool[] }>('/v1/mcp/tools');
    const items = json.items ?? [];
    if (items.length > 0) return items;
  } catch {
    // fall through to seed
  }
  return SEED_TOOLS.map((t) => ({
    ...t,
    params_schema: { ...t.params_schema },
    return_schema: { ...t.return_schema },
  }));
}

export async function listMCPAgents(): Promise<MCPAgentPermission[]> {
  try {
    const json = await fetcher<{ items?: MCPAgentPermission[] }>(
      '/v1/mcp/agents',
    );
    const items = json.items ?? [];
    if (items.length > 0) return items;
  } catch {
    // fall through to seed
  }
  return AGENT_STORE.map((a) => ({ ...a, scopes: a.scopes.slice() }));
}

export async function rotateAgentToken(agentId: string): Promise<void> {
  const idx = AGENT_STORE.findIndex((a) => a.agent_id === agentId);
  if (idx >= 0) {
    const prev = AGENT_STORE[idx];
    if (prev) {
      AGENT_STORE[idx] = { ...prev, token_last_rotated_ms: NOW, status: 'active' };
    }
  }
  try {
    await fetcher<void>(
      `/v1/mcp/agents/${encodeURIComponent(agentId)}/rotate-token`,
      { method: 'POST' },
    );
  } catch {
    // best-effort — local state already updated.
  }
}

export async function revokeAgent(agentId: string): Promise<void> {
  const idx = AGENT_STORE.findIndex((a) => a.agent_id === agentId);
  if (idx >= 0) {
    const prev = AGENT_STORE[idx];
    if (prev) {
      AGENT_STORE[idx] = { ...prev, status: 'revoked' };
    }
  }
  try {
    await fetcher<void>(
      `/v1/mcp/agents/${encodeURIComponent(agentId)}/revoke`,
      { method: 'POST' },
    );
  } catch {
    // best-effort
  }
}

export async function listMCPAudit(
  opts: ListMCPAuditOptions = {},
): Promise<MCPAuditEntry[]> {
  let items: MCPAuditEntry[];
  try {
    const params = new URLSearchParams();
    if (opts.agentId) params.set('agent_id', opts.agentId);
    if (opts.tool) params.set('tool', opts.tool);
    if (opts.sinceMs !== undefined) params.set('since_ms', String(opts.sinceMs));
    const qs = params.toString();
    const json = await fetcher<{ items?: MCPAuditEntry[] }>(
      `/v1/mcp/audit${qs.length > 0 ? `?${qs}` : ''}`,
    );
    items = json.items ?? [];
    if (items.length > 0) {
      return items;
    }
  } catch {
    // fall through to seed
  }
  items = SEED_AUDIT.map((e) => ({ ...e, args: { ...e.args } }));
  if (opts.agentId) {
    items = items.filter((e) => e.agent_id === opts.agentId);
  }
  if (opts.tool) {
    items = items.filter((e) => e.tool === opts.tool);
  }
  if (opts.sinceMs !== undefined) {
    items = items.filter((e) => e.timestamp_ms >= (opts.sinceMs ?? 0));
  }
  // Most-recent first — matches what an operator scanning a log expects.
  items.sort((a, b) => b.timestamp_ms - a.timestamp_ms);
  return items;
}
