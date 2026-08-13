/**
 * Agent-to-agent handoff inspector service — Wave 10 §S10.8.
 *
 * Wraps `GET /v1/admin/agent-handoff/pipelines`,
 * `GET /v1/admin/agent-handoff/pipelines/:run_id`,
 * and `POST /v1/admin/agent-handoff/pipelines/:run_id/replay`.
 *
 * Falls back to a deterministic local seed when the upstream is
 * unreachable so the inspector renders without a backend.
 *
 * The default seed pipeline walks
 * research → deck-builder → brand-compliance → rehearsal-coach
 * so the graph visualizer has the canonical four-node layout to
 * render.
 */

import { fetcher } from './fetcher';

export type AgentNodeStatus = 'idle' | 'running' | 'done' | 'error';

export interface AgentNode {
  id: string;
  name: string;
  role: string;
  status: AgentNodeStatus;
  inputs?: Record<string, unknown>;
  outputs?: Record<string, unknown>;
  handoff_tokens?: string[];
  latency_ms?: number;
  error?: string;
  started_at_ms?: number;
  completed_at_ms?: number;
}

export interface AgentEdge {
  from: string;
  to: string;
  label?: string;
}

export interface Pipeline {
  run_id: string;
  deck_id: string;
  status: 'running' | 'done' | 'error';
  nodes: AgentNode[];
  edges: AgentEdge[];
  started_at_ms: number;
  total_latency_ms?: number;
}

// Anchor "now" so the seed is deterministic in dev.
const NOW = Date.UTC(2026, 7, 13); // 2026-08-13
const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

const CANONICAL_EDGES: ReadonlyArray<AgentEdge> = [
  { from: 'research', to: 'deck-builder', label: 'facts' },
  { from: 'deck-builder', to: 'brand-compliance', label: 'outline' },
  { from: 'brand-compliance', to: 'rehearsal-coach', label: 'verified' },
];

interface NodeBlueprint {
  id: string;
  name: string;
  role: string;
  inputs: Record<string, unknown>;
  outputs: Record<string, unknown>;
  handoff_tokens: string[];
  offsetMs: number;
}

const NODE_BLUEPRINTS: ReadonlyArray<NodeBlueprint> = [
  {
    id: 'research',
    name: 'Research',
    role: 'research',
    inputs: { topic: 'Q3 launch', constraints: ['confidential', 'no-competitors'] },
    outputs: { facts: 24, citations: 11 },
    handoff_tokens: ['tok-research-9f3a'],
    offsetMs: 0,
  },
  {
    id: 'deck-builder',
    name: 'Deck Builder',
    role: 'deck-builder',
    inputs: { facts: 24, slide_target: 12 },
    outputs: { outline: { slides: 12 }, draft_id: 'draft-871' },
    handoff_tokens: ['tok-deck-builder-2c47'],
    offsetMs: 420,
  },
  {
    id: 'brand-compliance',
    name: 'Brand Compliance',
    role: 'brand-compliance',
    inputs: { draft_id: 'draft-871', brand_profile: 'acme-2026' },
    outputs: { violations: 0, score: 0.93 },
    handoff_tokens: ['tok-brand-7e2b'],
    offsetMs: 420 + 1880,
  },
  {
    id: 'rehearsal-coach',
    name: 'Rehearsal Coach',
    role: 'rehearsal-coach',
    inputs: { draft_id: 'draft-871', duration_target_min: 20 },
    outputs: { run_sheets: 3, notes: 'tighten introduction' },
    handoff_tokens: ['tok-rehearsal-4a18'],
    offsetMs: 420 + 1880 + 760,
  },
];

const NODE_LATENCY: Record<string, number> = {
  research: 420,
  'deck-builder': 1880,
  'brand-compliance': 760,
  'rehearsal-coach': 530,
};

function buildCanonicalNodes(
  status: AgentNodeStatus,
  baseLatency: number,
  startedAt: number,
  overrideStatus?: Partial<Record<string, AgentNodeStatus>>,
  overrideErrors?: Partial<Record<string, string>>,
): AgentNode[] {
  const out: AgentNode[] = [];
  let cursorMs = startedAt;
  for (const bp of NODE_BLUEPRINTS) {
    const resolvedStatus = overrideStatus?.[bp.id] ?? status;
    const latency = NODE_LATENCY[bp.id] ?? 0;
    const started = cursorMs;
    const completed = resolvedStatus === 'done' ? started + baseLatency + latency : 0;
    const node: AgentNode = {
      id: bp.id,
      name: bp.name,
      role: bp.role,
      status: resolvedStatus,
      inputs: bp.inputs,
      outputs: bp.outputs,
      handoff_tokens: bp.handoff_tokens,
    };
    if (resolvedStatus !== 'idle') {
      node.started_at_ms = started;
      node.latency_ms = baseLatency + latency;
      if (resolvedStatus === 'done') {
        node.completed_at_ms = completed;
      }
    }
    const errorMsg = overrideErrors?.[bp.id];
    if (errorMsg) {
      node.error = errorMsg;
    }
    out.push(node);
    cursorMs = started + baseLatency + latency;
  }
  return out;
}

function totalLatency(nodes: ReadonlyArray<AgentNode>): number {
  return nodes.reduce((acc, n) => acc + (n.latency_ms ?? 0), 0);
}

interface PipelineSeed {
  run_id: string;
  deck_id: string;
  status: Pipeline['status'];
  started_at_ms: number;
  /** Per-node status override by node id. */
  overrides?: Partial<Record<string, AgentNodeStatus>>;
  /** Per-node error override by node id. */
  errors?: Partial<Record<string, string>>;
  /** Per-node latency offset (added to base latency). */
  latency_offset?: number;
}

const PIPELINE_SEEDS: ReadonlyArray<PipelineSeed> = [
  {
    run_id: 'run-2026-08-13-001',
    deck_id: 'deck-q3-allhands',
    status: 'done',
    started_at_ms: NOW - 25 * MINUTE_MS,
  },
  {
    run_id: 'run-2026-08-13-002',
    deck_id: 'deck-acme-launch',
    status: 'running',
    started_at_ms: NOW - 40 * MINUTE_MS,
    overrides: {
      research: 'done',
      'deck-builder': 'done',
      'brand-compliance': 'running',
      'rehearsal-coach': 'idle',
    },
  },
  {
    run_id: 'run-2026-08-13-003',
    deck_id: 'deck-pricing-v2',
    status: 'error',
    started_at_ms: NOW - 2 * HOUR_MS,
    overrides: {
      research: 'done',
      'deck-builder': 'error',
      'brand-compliance': 'idle',
      'rehearsal-coach': 'idle',
    },
    errors: {
      'deck-builder': 'Outline generator exceeded word budget by 47%.',
    },
  },
  {
    run_id: 'run-2026-08-12-019',
    deck_id: 'deck-roadmap',
    status: 'done',
    started_at_ms: NOW - 1 * DAY_MS - 3 * HOUR_MS,
    latency_offset: 600,
  },
];

function buildPipeline(seed: PipelineSeed): Pipeline {
  const offset = seed.latency_offset ?? 0;
  const nodes = buildCanonicalNodes(
    'done',
    800 + offset,
    seed.started_at_ms,
    seed.overrides,
    seed.errors,
  );
  const hasError = nodes.some((n) => n.status === 'error');
  const anyRunning = nodes.some((n) => n.status === 'running');
  const anyIdle = nodes.some((n) => n.status === 'idle');
  const status: Pipeline['status'] = hasError
    ? 'error'
    : anyRunning || (anyIdle && nodes.some((n) => n.status === 'done'))
      ? 'running'
      : seed.status;
  return {
    run_id: seed.run_id,
    deck_id: seed.deck_id,
    status,
    nodes,
    edges: [...CANONICAL_EDGES],
    started_at_ms: seed.started_at_ms,
    total_latency_ms: totalLatency(nodes),
  };
}

// Mutable seed so replay can append a new pipeline.
let PIPELINES: Pipeline[] = PIPELINE_SEEDS.map(buildPipeline);

export async function listPipelines(): Promise<Pipeline[]> {
  try {
    const json = await fetcher<{ items?: Pipeline[] }>('/v1/admin/agent-handoff/pipelines');
    const items = json.items ?? [];
    if (items.length > 0) return items;
  } catch {
    // fall through to seed
  }
  // Recent first.
  return [...PIPELINES]
    .map((p) => ({
      ...p,
      nodes: p.nodes.map((n) => ({ ...n })),
      edges: [...p.edges],
    }))
    .sort((a, b) => b.started_at_ms - a.started_at_ms);
}

export async function getPipeline(runId: string): Promise<Pipeline | null> {
  if (!runId) return null;
  try {
    const json = await fetcher<Pipeline>(
      `/v1/admin/agent-handoff/pipelines/${encodeURIComponent(runId)}`,
    );
    if (json && json.run_id) return json;
  } catch {
    // fall through to seed
  }
  const found = PIPELINES.find((p) => p.run_id === runId);
  if (!found) return null;
  return {
    ...found,
    nodes: found.nodes.map((n) => ({ ...n })),
    edges: [...found.edges],
  };
}

export async function replayPipeline(runId: string): Promise<{ new_run_id: string }> {
  let newRunId = '';
  try {
    const json = await fetcher<{ new_run_id?: string }>(
      `/v1/admin/agent-handoff/pipelines/${encodeURIComponent(runId)}/replay`,
      { method: 'POST' },
    );
    if (json && typeof json.new_run_id === 'string') {
      newRunId = json.new_run_id;
    }
  } catch {
    // fall through — we still generate a fresh local run id.
  }
  if (!newRunId) {
    const stamp = Date.now();
    newRunId = `run-${stamp.toString(36)}`;
  }
  // Always append a new "running" pipeline locally so the user sees
  // the replay appear in the list.
  const original = PIPELINES.find((p) => p.run_id === runId);
  const deckId = original?.deck_id ?? 'deck-replay';
  const fresh = buildPipeline({
    run_id: newRunId,
    deck_id: deckId,
    status: 'running',
    started_at_ms: Date.now(),
    overrides: {
      research: 'done',
      'deck-builder': 'running',
      'brand-compliance': 'idle',
      'rehearsal-coach': 'idle',
    },
  });
  PIPELINES = [fresh, ...PIPELINES];
  return { new_run_id: newRunId };
}

/** Test-only: reset the local seed back to a fresh state. */
export function __resetAgentHandoffSeed(): void {
  PIPELINES = PIPELINE_SEEDS.map(buildPipeline);
}
