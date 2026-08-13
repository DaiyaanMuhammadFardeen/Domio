/**
 * Inheritance service — typed client for the editor's master/derived
 * deck tree.
 *
 * Per Wave 11 §S11.8 of docs/frontend-roadmap/11-wave-novel-frontier.md:
 *   - Show every deck derived from a master.
 *   - Selective push: pick which slides update downstream.
 *   - Conflict resolver for slides that diverged.
 *
 * Today the implementation returns deterministic offline seed data
 * (one master + 3-4 derived decks + 5-10 slide conflicts) so the UI
 * is fully verifiable without the inheritance backend. When the
 * `inheritance-svc` worker lands, only the request/response shapes
 * need to stay stable — implementation swaps behind the scenes.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SyncStatus = 'in_sync' | 'diverged' | 'pending';

export interface DeckNode {
  readonly id: string;
  readonly title: string;
  readonly version: string;
  /** null when this is the root master; otherwise the parent deck id. */
  readonly parent_id: string | null;
  /** Unix epoch milliseconds — last time this node was synced with its parent. */
  readonly last_synced_at_ms: number;
  readonly sync_status: SyncStatus;
  readonly slide_count: number;
}

export interface InheritanceEdge {
  readonly parent_id: string;
  readonly child_id: string;
  readonly inherited_slide_ids: readonly string[];
  readonly diverged_slide_ids: readonly string[];
  readonly last_pushed_at_ms: number | null;
}

export interface SlideConflict {
  readonly slide_id: string;
  readonly slide_title: string;
  readonly kind: 'added' | 'removed' | 'modified';
  readonly master_version: Record<string, unknown>;
  readonly downstream_version: Record<string, unknown>;
  readonly downstream_decks: readonly string[];
}

export interface PushResult {
  readonly pushed_at_ms: number;
  readonly affected_decks: readonly string[];
}

export type ConflictResolution = 'master' | 'downstream' | 'both';

// ---------------------------------------------------------------------------
// Internals (seed data + state mutation)
// ---------------------------------------------------------------------------

const DEFAULT_API_BASE: string =
  (typeof process !== 'undefined'
    ? (process.env['NEXT_PUBLIC_API_URL'] as string | undefined)
    : undefined) ?? 'http://localhost:8080';

const NOW = (): number =>
  (typeof process !== 'undefined' && typeof process.hrtime === 'function'
    ? // deterministic-ish reference for tests — Date.now() is fine here
      Date.now()
    : Date.now());

interface InternalTreeState {
  readonly nodes: DeckNode[];
  readonly edges: InheritanceEdge[];
  readonly conflicts: SlideConflict[];
  /** edges that have been push'd at least once */
  readonly pushLog: Map<string, number>;
}

function seedNodes(): DeckNode[] {
  const ms = NOW();
  return [
    {
      id: 'deck-master',
      title: 'Master Sales Deck',
      version: 'v18.2',
      parent_id: null,
      last_synced_at_ms: ms - 3 * 60 * 60 * 1000,
      sync_status: 'in_sync',
      slide_count: 24,
    },
    {
      id: 'deck-acme-q3',
      title: 'Acme Corp — Q3 Pitch',
      version: 'v18.2',
      parent_id: 'deck-master',
      last_synced_at_ms: ms - 6 * 60 * 60 * 1000,
      sync_status: 'diverged',
      slide_count: 26,
    },
    {
      id: 'deck-initech-onboard',
      title: 'Initech — Onboarding',
      version: 'v17.9',
      parent_id: 'deck-master',
      last_synced_at_ms: ms - 24 * 60 * 60 * 1000,
      sync_status: 'pending',
      slide_count: 22,
    },
    {
      id: 'deck-globex-launch',
      title: 'Globex — Launch Briefing',
      version: 'v18.2',
      parent_id: 'deck-master',
      last_synced_at_ms: ms - 4 * 60 * 60 * 1000,
      sync_status: 'in_sync',
      slide_count: 24,
    },
    {
      id: 'deck-hooli-roadshow',
      title: 'Hooli — Roadshow Variant',
      version: 'v17.5',
      parent_id: 'deck-master',
      last_synced_at_ms: ms - 72 * 60 * 60 * 1000,
      sync_status: 'diverged',
      slide_count: 21,
    },
  ];
}

function seedEdges(): InheritanceEdge[] {
  const ms = NOW();
  const baseDate = ms - 6 * 60 * 60 * 1000;
  return [
    {
      parent_id: 'deck-master',
      child_id: 'deck-acme-q3',
      inherited_slide_ids: ['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8', 's9', 's10'],
      diverged_slide_ids: ['s3', 's7'],
      last_pushed_at_ms: baseDate,
    },
    {
      parent_id: 'deck-master',
      child_id: 'deck-initech-onboard',
      inherited_slide_ids: ['s1', 's2', 's3', 's4', 's5', 's6'],
      diverged_slide_ids: ['s5'],
      last_pushed_at_ms: baseDate,
    },
    {
      parent_id: 'deck-master',
      child_id: 'deck-globex-launch',
      inherited_slide_ids: ['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8', 's9', 's10'],
      diverged_slide_ids: [],
      last_pushed_at_ms: baseDate,
    },
    {
      parent_id: 'deck-master',
      child_id: 'deck-hooli-roadshow',
      inherited_slide_ids: ['s1', 's2', 's3', 's4', 's5', 's6'],
      diverged_slide_ids: ['s4', 's5'],
      last_pushed_at_ms: ms - 72 * 60 * 60 * 1000,
    },
  ];
}

function seedConflicts(): SlideConflict[] {
  return [
    {
      slide_id: 's3',
      slide_title: 'Pricing tiers overview',
      kind: 'modified',
      master_version: { headline: 'Pricing tiers — 2026', tiers: 3, currency: 'USD' },
      downstream_version: { headline: 'Acme exclusive pricing', tiers: 4, currency: 'USD' },
      downstream_decks: ['deck-acme-q3', 'deck-hooli-roadshow'],
    },
    {
      slide_id: 's4',
      slide_title: 'Customer logos wall',
      kind: 'modified',
      master_version: { layout: 'grid', logos_count: 24 },
      downstream_version: { layout: 'carousel', logos_count: 12, featured: ['Acme'] },
      downstream_decks: ['deck-hooli-roadshow'],
    },
    {
      slide_id: 's5',
      slide_title: 'Security & compliance',
      kind: 'modified',
      master_version: { badges: ['SOC2', 'ISO27001', 'GDPR'], date: '2026-Q1' },
      downstream_version: { badges: ['SOC2', 'HIPAA'], date: '2025-Q4' },
      downstream_decks: ['deck-initech-onboard', 'deck-hooli-roadshow'],
    },
    {
      slide_id: 's7',
      slide_title: 'Integration partners',
      kind: 'modified',
      master_version: { partners: ['Slack', 'Salesforce', 'HubSpot', 'Snowflake'] },
      downstream_version: { partners: ['Slack', 'Salesforce'], pinned: true },
      downstream_decks: ['deck-acme-q3'],
    },
    {
      slide_id: 's11',
      slide_title: 'New: AI Copilot teaser',
      kind: 'added',
      master_version: {},
      downstream_version: { headline: 'AI Copilot teaser', source: 'globex-only' },
      downstream_decks: ['deck-acme-q3'],
    },
    {
      slide_id: 's12',
      slide_title: 'Executive bios',
      kind: 'removed',
      master_version: { heading: 'Meet the leadership team', count: 4 },
      downstream_version: {},
      downstream_decks: ['deck-globex-launch'],
    },
    {
      slide_id: 's13',
      slide_title: 'Roadshow footer',
      kind: 'added',
      master_version: {},
      downstream_version: { tag: 'Q3 roadshow', gradient: 'sunset' },
      downstream_decks: ['deck-hooli-roadshow'],
    },
  ];
}

const STATE: InternalTreeState = {
  nodes: seedNodes(),
  edges: seedEdges(),
  conflicts: seedConflicts(),
  pushLog: new Map<string, number>(),
};

/** Test helper: reset the seed state. Not exported on the public API. */
export function __resetInheritanceStateForTests(): void {
  STATE.nodes.splice(0, STATE.nodes.length, ...seedNodes());
  STATE.edges.splice(0, STATE.edges.length, ...seedEdges());
  STATE.conflicts.splice(0, STATE.conflicts.length, ...seedConflicts());
  STATE.pushLog.clear();
}

/** Test helper: peek internal state. */
export function __getInheritanceStateForTests(): {
  readonly nodes: readonly DeckNode[];
  readonly edges: readonly InheritanceEdge[];
  readonly conflicts: readonly SlideConflict[];
  readonly pushLog: Map<string, number>;
} {
  return {
    nodes: STATE.nodes,
    edges: STATE.edges,
    conflicts: STATE.conflicts,
    pushLog: STATE.pushLog,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface ListInheritanceTreeResult {
  readonly nodes: readonly DeckNode[];
  readonly edges: readonly InheritanceEdge[];
}

/**
 * Fetch the full inheritance tree rooted at masterDeckId.
 * Falls back to offline seed data on error.
 */
export async function listInheritanceTree(
  masterDeckId: string,
  baseUrl: string = DEFAULT_API_BASE,
): Promise<ListInheritanceTreeResult> {
  try {
    const res = await fetch(
      `${baseUrl}/v1/inheritance/trees/${encodeURIComponent(masterDeckId)}`,
    );
    if (!res.ok) throw new Error(`inheritance API ${res.status}`);
    const data = (await res.json()) as ListInheritanceTreeResult;
    return data;
  } catch {
    // Offline fallback — include the master + every derived deck.
    const nodes = STATE.nodes.filter(
      (n) => n.id === masterDeckId || n.parent_id === masterDeckId,
    );
    const nodeIds = new Set(nodes.map((n) => n.id));
    const edges = STATE.edges.filter(
      (e) => nodeIds.has(e.parent_id) && nodeIds.has(e.child_id),
    );
    return { nodes, edges };
  }
}

/**
 * Push a set of slides from the master to every derived deck.
 * Returns the wall-clock push time and the list of affected deck IDs.
 */
export async function pushSlides(
  masterDeckId: string,
  slideIds: readonly string[],
  baseUrl: string = DEFAULT_API_BASE,
): Promise<PushResult> {
  try {
    const res = await fetch(
      `${baseUrl}/v1/inheritance/trees/${encodeURIComponent(masterDeckId)}/push`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ slide_ids: slideIds }),
      },
    );
    if (!res.ok) throw new Error(`inheritance API ${res.status}`);
    return (await res.json()) as PushResult;
  } catch {
    const ms = NOW();
    // Mutate in-memory seed so subsequent reads reflect the push.
    const slideSet = new Set(slideIds);
    const affected: string[] = [];
    for (let i = 0; i < STATE.edges.length; i++) {
      const edge = STATE.edges[i];
      if (!edge || edge.parent_id !== masterDeckId) continue;
      const merged = new Set<string>(edge.inherited_slide_ids);
      slideIds.forEach((id) => merged.add(id));
      // Diverged slides that are being pushed will be re-synced.
      const remainingDiverged = edge.diverged_slide_ids.filter((id) => !slideSet.has(id));
      STATE.edges[i] = {
        parent_id: edge.parent_id,
        child_id: edge.child_id,
        inherited_slide_ids: Array.from(merged),
        diverged_slide_ids: remainingDiverged,
        last_pushed_at_ms: ms,
      };
      STATE.pushLog.set(edge.child_id, ms);
      const childNodeIdx = STATE.nodes.findIndex((n) => n.id === edge.child_id);
      if (childNodeIdx >= 0) {
        const old = STATE.nodes[childNodeIdx];
        if (old) {
          STATE.nodes[childNodeIdx] = {
            id: old.id,
            title: old.title,
            version: old.version,
            parent_id: old.parent_id,
            last_synced_at_ms: ms,
            sync_status: remainingDiverged.length === 0 ? 'in_sync' : old.sync_status,
            slide_count: old.slide_count,
          };
        }
      }
      affected.push(edge.child_id);
    }
    return { pushed_at_ms: ms, affected_decks: affected };
  }
}

/**
 * List slide conflicts (master vs. downstream) for a master deck.
 */
export async function listConflictingSlides(
  masterDeckId: string,
  baseUrl: string = DEFAULT_API_BASE,
): Promise<readonly SlideConflict[]> {
  try {
    const res = await fetch(
      `${baseUrl}/v1/inheritance/trees/${encodeURIComponent(masterDeckId)}/conflicts`,
    );
    if (!res.ok) throw new Error(`inheritance API ${res.status}`);
    return (await res.json()) as SlideConflict[];
  } catch {
    // Filter to conflicts whose downstream_decks intersect this master's edges.
    const derived = new Set(
      STATE.edges.filter((e) => e.parent_id === masterDeckId).map((e) => e.child_id),
    );
    return STATE.conflicts.filter((c) =>
      c.downstream_decks.some((id) => derived.has(id)),
    );
  }
}

/**
 * Apply a resolution to a single diverged slide.
 * Resolution `master` replaces downstream with master content.
 * Resolution `downstream` keeps the downstream content unchanged.
 * Resolution `both` keeps both copies side-by-side (creates a clone).
 *
 * Auto-resolves to master by default when no resolution is supplied —
 * this matches the editor's "safe default" behavior.
 */
export async function resolveConflict(
  masterDeckId: string,
  slideId: string,
  resolution: ConflictResolution = 'master',
  baseUrl: string = DEFAULT_API_BASE,
): Promise<void> {
  try {
    const res = await fetch(
      `${baseUrl}/v1/inheritance/trees/${encodeURIComponent(masterDeckId)}/conflicts/${encodeURIComponent(slideId)}/resolve`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ resolution }),
      },
    );
    if (!res.ok) throw new Error(`inheritance API ${res.status}`);
  } catch {
    // Mutate in-memory state — remove the resolved conflict.
    const idx = STATE.conflicts.findIndex((c) => c.slide_id === slideId);
    if (idx >= 0) {
      STATE.conflicts.splice(idx, 1);
    }
  }
}

// ---------------------------------------------------------------------------
// Pure helpers (handy for components + tests)
// ---------------------------------------------------------------------------

/** Group flat edges into a parent → children map for tree rendering. */
export function groupChildrenByParent(
  edges: readonly InheritanceEdge[],
): ReadonlyMap<string, readonly InheritanceEdge[]> {
  const map = new Map<string, InheritanceEdge[]>();
  for (const edge of edges) {
    const bucket = map.get(edge.parent_id);
    if (bucket) bucket.push(edge);
    else map.set(edge.parent_id, [edge]);
  }
  return map;
}

/** Find the master node (parent_id === null) inside a node list. */
export function findMaster(nodes: readonly DeckNode[]): DeckNode | null {
  for (const n of nodes) {
    if (n.parent_id === null) return n;
  }
  return null;
}

/** Pretty-print a sync_status for badge labels. */
export function describeSyncStatus(status: SyncStatus): string {
  switch (status) {
    case 'in_sync':
      return 'In sync';
    case 'diverged':
      return 'Diverged';
    case 'pending':
      return 'Pending';
    default: {
      const exhaustive: never = status;
      return exhaustive;
    }
  }
}
