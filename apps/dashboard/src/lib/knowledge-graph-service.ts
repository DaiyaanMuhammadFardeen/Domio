/**
 * knowledge-graph-service — typed client for the cross-deck
 * knowledge graph endpoint.
 *
 * Per Wave 7 §S7.12 of docs/frontend-roadmap/07-wave-analytics-insights.md
 * (initial claim/slide/citation graph) and Wave 11 §S11.15 (full
 * entity-level cross-deck graph).
 *
 * Wraps `/v1/analytics/graph` on the analytics-warehouse. The graph
 * is claim-centric: each claim node has source slides and citations,
 * and edges link claims to decks + citations.
 *
 * In addition, Wave 11 adds an entity-centric view (people, products,
 * KPIs, companies, metrics) with cross-deck edges. Both views are
 * exposed from this module for backward compatibility.
 */

import { fetcher } from './fetcher';

export type GraphNodeKind = 'claim' | 'slide' | 'citation' | 'deck';

export interface GraphNode {
  readonly id: string;
  readonly kind: GraphNodeKind;
  readonly label: string;
  readonly deckId?: string;
  readonly slideId?: string;
  readonly citationId?: string;
  readonly deckIds?: ReadonlyArray<string>;
}

export interface GraphEdge {
  readonly from: string;
  readonly to: string;
  readonly kind: 'source_slide' | 'cites' | 'cross_deck';
}

export interface KnowledgeGraph {
  readonly nodes: ReadonlyArray<GraphNode>;
  readonly edges: ReadonlyArray<GraphEdge>;
  readonly claims: ReadonlyArray<GraphNode>;
}

interface GraphNodeWire {
  id?: string;
  kind?: string;
  label?: string;
  deck_id?: string;
  slide_id?: string;
  citation_id?: string;
  deck_ids?: string[];
}

interface GraphEdgeWire {
  from?: string;
  to?: string;
  kind?: string;
}

interface KnowledgeGraphWire {
  nodes?: GraphNodeWire[];
  edges?: GraphEdgeWire[];
}

const VALID_KINDS: ReadonlyArray<GraphNodeKind> = ['claim', 'slide', 'citation', 'deck'];

const VALID_EDGE_KINDS: ReadonlyArray<GraphEdge['kind']> = ['source_slide', 'cites', 'cross_deck'];

function asNodeKind(value: string | undefined): GraphNodeKind {
  return (VALID_KINDS as readonly string[]).includes(value ?? '')
    ? (value as GraphNodeKind)
    : 'claim';
}

function asEdgeKind(value: string | undefined): GraphEdge['kind'] {
  return (VALID_EDGE_KINDS as readonly string[]).includes(value ?? '')
    ? (value as GraphEdge['kind'])
    : 'source_slide';
}

function nodeFromWire(wire: GraphNodeWire): GraphNode {
  return {
    id: String(wire.id ?? ''),
    kind: asNodeKind(wire.kind),
    label: String(wire.label ?? ''),
    ...(wire.deck_id ? { deckId: String(wire.deck_id) } : {}),
    ...(wire.slide_id ? { slideId: String(wire.slide_id) } : {}),
    ...(wire.citation_id ? { citationId: String(wire.citation_id) } : {}),
    ...(wire.deck_ids ? { deckIds: wire.deck_ids.map(String) } : {}),
  };
}

function edgeFromWire(wire: GraphEdgeWire): GraphEdge {
  return {
    from: String(wire.from ?? ''),
    to: String(wire.to ?? ''),
    kind: asEdgeKind(wire.kind),
  };
}

const DEFAULT_BASE: string =
  (typeof process !== 'undefined' ? process.env['WAREHOUSE_URL'] : undefined) ??
  'http://localhost:8088';

export interface FetchGraphOpts {
  readonly deckId?: string;
  readonly search?: string;
  readonly baseUrl?: string;
}

/**
 * Fetch the workspace's knowledge graph.
 *
 * Returns an empty graph on any failure.
 */
export async function fetchKnowledgeGraph(
  workspaceId: string,
  opts: FetchGraphOpts = {},
): Promise<KnowledgeGraph> {
  const baseUrl = opts.baseUrl ?? DEFAULT_BASE;
  try {
    const path = opts.deckId
      ? `/v1/analytics/graph?deck_id=${encodeURIComponent(opts.deckId)}`
      : '/v1/analytics/graph';
    const json = await fetcher<KnowledgeGraphWire>(baseUrl, path, {
      workspaceId,
      ...(opts.search ? { headers: { 'x-search-query': opts.search } } : {}),
    });
    const nodes = (json.nodes ?? []).map(nodeFromWire);
    const edges = (json.edges ?? []).map(edgeFromWire);
    return {
      nodes,
      edges,
      claims: nodes.filter((n) => n.kind === 'claim'),
    };
  } catch {
    return { nodes: [], edges: [], claims: [] };
  }
}

/* -------------------------------------------------------------------------
 * Wave 11 §S11.15 — Entity-centric cross-deck graph
 * ----------------------------------------------------------------------- */

export type EntityType = 'person' | 'product' | 'kpi' | 'company' | 'metric';

export interface Entity {
  readonly id: string;
  readonly name: string;
  readonly type: EntityType;
  readonly reference_count: number;
  readonly team: string;
}

export interface GraphEdgeEntity {
  readonly from: string;
  readonly to: string;
  readonly weight: number;
  readonly relation: 'references' | 'derived_from' | 'updates';
}

export interface GraphView {
  readonly entities: ReadonlyArray<Entity>;
  readonly edges: ReadonlyArray<GraphEdgeEntity>;
  readonly total_entities: number;
  readonly total_edges: number;
}

export interface EntityReference {
  readonly deck_id: string;
  readonly deck_title: string;
  readonly slide_id: string;
  readonly slide_title: string;
  readonly freshness: 'fresh' | 'stale' | 'outdated';
  readonly last_referenced_at_ms: number;
}

const ALL_ENTITY_TYPES: ReadonlyArray<EntityType> = [
  'person',
  'product',
  'kpi',
  'company',
  'metric',
];

const VALID_ENTITY_TYPES: ReadonlySet<EntityType> = new Set(ALL_ENTITY_TYPES);

function asEntityType(value: string | undefined): EntityType {
  return value && VALID_ENTITY_TYPES.has(value as EntityType) ? (value as EntityType) : 'metric';
}

const SEED_ENTITIES: ReadonlyArray<Entity> = [
  { id: 'ent-acme', name: 'Acme Corp', type: 'company', reference_count: 18, team: 'sales' },
  {
    id: 'ent-globex',
    name: 'Globex Industries',
    type: 'company',
    reference_count: 9,
    team: 'sales',
  },
  { id: 'ent-initech', name: 'Initech', type: 'company', reference_count: 6, team: 'partnerships' },
  {
    id: 'ent-orion',
    name: 'Orion Analytics',
    type: 'product',
    reference_count: 22,
    team: 'product',
  },
  { id: 'ent-pulsar', name: 'Pulsar CRM', type: 'product', reference_count: 14, team: 'product' },
  { id: 'ent-quasar', name: 'Quasar BI', type: 'product', reference_count: 11, team: 'data' },
  { id: 'ent-nova', name: 'Nova Engine', type: 'product', reference_count: 8, team: 'engineering' },
  { id: 'ent-alice', name: 'Alice Tan', type: 'person', reference_count: 16, team: 'sales' },
  { id: 'ent-bob', name: 'Bob Reyes', type: 'person', reference_count: 12, team: 'product' },
  { id: 'ent-carol', name: 'Carol Chen', type: 'person', reference_count: 10, team: 'data' },
  { id: 'ent-david', name: 'David Park', type: 'person', reference_count: 7, team: 'engineering' },
  { id: 'ent-erin', name: 'Erin Walsh', type: 'person', reference_count: 5, team: 'partnerships' },
  {
    id: 'ent-arr',
    name: 'Annual Recurring Revenue',
    type: 'kpi',
    reference_count: 24,
    team: 'finance',
  },
  { id: 'ent-nrr', name: 'Net Retention', type: 'kpi', reference_count: 17, team: 'finance' },
  { id: 'ent-csat', name: 'CSAT Score', type: 'kpi', reference_count: 13, team: 'support' },
  { id: 'ent-churn', name: 'Logo Churn', type: 'kpi', reference_count: 11, team: 'support' },
  {
    id: 'ent-pipeline',
    name: 'Sales Pipeline Value',
    type: 'metric',
    reference_count: 15,
    team: 'sales',
  },
  {
    id: 'ent-ctr',
    name: 'Click-through Rate',
    type: 'metric',
    reference_count: 9,
    team: 'marketing',
  },
  {
    id: 'ent-conversion',
    name: 'Conversion Rate',
    type: 'metric',
    reference_count: 12,
    team: 'marketing',
  },
  {
    id: 'ent-mau',
    name: 'Monthly Active Users',
    type: 'metric',
    reference_count: 8,
    team: 'product',
  },
];

const SEED_EDGES: ReadonlyArray<GraphEdgeEntity> = [
  { from: 'ent-orion', to: 'ent-acme', weight: 8, relation: 'references' },
  { from: 'ent-orion', to: 'ent-globex', weight: 4, relation: 'references' },
  { from: 'ent-orion', to: 'ent-arr', weight: 6, relation: 'updates' },
  { from: 'ent-orion', to: 'ent-nrr', weight: 5, relation: 'updates' },
  { from: 'ent-pulsar', to: 'ent-initech', weight: 3, relation: 'references' },
  { from: 'ent-pulsar', to: 'ent-csat', weight: 4, relation: 'updates' },
  { from: 'ent-pulsar', to: 'ent-alice', weight: 5, relation: 'references' },
  { from: 'ent-quasar', to: 'ent-acme', weight: 2, relation: 'references' },
  { from: 'ent-quasar', to: 'ent-conversion', weight: 5, relation: 'updates' },
  { from: 'ent-quasar', to: 'ent-ctr', weight: 4, relation: 'updates' },
  { from: 'ent-nova', to: 'ent-mau', weight: 3, relation: 'updates' },
  { from: 'ent-nova', to: 'ent-bob', weight: 2, relation: 'references' },
  { from: 'ent-alice', to: 'ent-pipeline', weight: 6, relation: 'updates' },
  { from: 'ent-alice', to: 'ent-acme', weight: 4, relation: 'references' },
  { from: 'ent-bob', to: 'ent-pulsar', weight: 3, relation: 'derived_from' },
  { from: 'ent-carol', to: 'ent-quasar', weight: 4, relation: 'derived_from' },
  { from: 'ent-carol', to: 'ent-churn', weight: 3, relation: 'updates' },
  { from: 'ent-david', to: 'ent-nova', weight: 5, relation: 'derived_from' },
  { from: 'ent-erin', to: 'ent-initech', weight: 2, relation: 'references' },
  { from: 'ent-erin', to: 'ent-globex', weight: 3, relation: 'references' },
  { from: 'ent-arr', to: 'ent-acme', weight: 7, relation: 'references' },
  { from: 'ent-arr', to: 'ent-globex', weight: 3, relation: 'references' },
  { from: 'ent-nrr', to: 'ent-acme', weight: 5, relation: 'references' },
  { from: 'ent-nrr', to: 'ent-globex', weight: 2, relation: 'references' },
  { from: 'ent-csat', to: 'ent-acme', weight: 4, relation: 'references' },
  { from: 'ent-csat', to: 'ent-globex', weight: 2, relation: 'references' },
  { from: 'ent-churn', to: 'ent-acme', weight: 4, relation: 'references' },
  { from: 'ent-churn', to: 'ent-globex', weight: 3, relation: 'references' },
  { from: 'ent-pipeline', to: 'ent-acme', weight: 5, relation: 'references' },
  { from: 'ent-pipeline', to: 'ent-globex', weight: 4, relation: 'references' },
  { from: 'ent-pipeline', to: 'ent-initech', weight: 2, relation: 'references' },
  { from: 'ent-ctr', to: 'ent-orion', weight: 3, relation: 'updates' },
  { from: 'ent-ctr', to: 'ent-pulsar', weight: 2, relation: 'updates' },
  { from: 'ent-conversion', to: 'ent-orion', weight: 4, relation: 'updates' },
  { from: 'ent-conversion', to: 'ent-pulsar', weight: 3, relation: 'updates' },
  { from: 'ent-mau', to: 'ent-orion', weight: 5, relation: 'updates' },
  { from: 'ent-mau', to: 'ent-pulsar', weight: 4, relation: 'updates' },
  { from: 'ent-mau', to: 'ent-quasar', weight: 2, relation: 'updates' },
  { from: 'ent-acme', to: 'ent-globex', weight: 3, relation: 'derived_from' },
  { from: 'ent-globex', to: 'ent-initech', weight: 2, relation: 'derived_from' },
];

interface GraphViewWire {
  entities?: Array<{
    id?: string;
    name?: string;
    type?: string;
    reference_count?: number;
    team?: string;
  }>;
  edges?: Array<{
    from?: string;
    to?: string;
    weight?: number;
    relation?: string;
  }>;
  total_entities?: number;
  total_edges?: number;
}

function entityFromWire(wire: NonNullable<GraphViewWire['entities']>[number]): Entity {
  return {
    id: String(wire.id ?? ''),
    name: String(wire.name ?? ''),
    type: asEntityType(wire.type),
    reference_count: Number(wire.reference_count ?? 0),
    team: String(wire.team ?? 'general'),
  };
}

function edgeEntityFromWire(wire: NonNullable<GraphViewWire['edges']>[number]): GraphEdgeEntity {
  const rel = wire.relation;
  const relation: GraphEdgeEntity['relation'] =
    rel === 'derived_from' || rel === 'updates' ? rel : 'references';
  return {
    from: String(wire.from ?? ''),
    to: String(wire.to ?? ''),
    weight: Number(wire.weight ?? 1),
    relation,
  };
}

export interface GetGraphOpts {
  readonly team?: string;
  readonly entityTypes?: ReadonlyArray<EntityType>;
  readonly sinceMs?: number;
  readonly baseUrl?: string;
}

/**
 * Fetch the entity-centric cross-deck graph view.
 *
 * Falls back to deterministic seed data when the warehouse is
 * unreachable. Filtering by `team`, `entityTypes`, and `sinceMs`
 * is applied client-side so the seed data yields a useful preview
 * without a live API.
 */
export async function getGraph(opts: GetGraphOpts = {}): Promise<GraphView> {
  const baseUrl = opts.baseUrl ?? DEFAULT_BASE;
  let rawEntities: Entity[] = [];
  let rawEdges: GraphEdgeEntity[] = [];
  try {
    const params = new URLSearchParams();
    if (opts.team) params.set('team', opts.team);
    if (opts.entityTypes && opts.entityTypes.length > 0) {
      params.set('entity_types', opts.entityTypes.join(','));
    }
    if (opts.sinceMs !== undefined) {
      params.set('since_ms', String(opts.sinceMs));
    }
    const qs = params.toString();
    const path = qs.length > 0 ? `/v1/analytics/graph?${qs}` : '/v1/analytics/graph';
    const json = await fetcher<GraphViewWire>(baseUrl, path);
    rawEntities = (json.entities ?? []).map(entityFromWire);
    rawEdges = (json.edges ?? []).map(edgeEntityFromWire);
  } catch {
    rawEntities = SEED_ENTITIES.map((e) => ({ ...e }));
    rawEdges = SEED_EDGES.map((e) => ({ ...e }));
  }

  const typeFilter =
    opts.entityTypes && opts.entityTypes.length > 0 ? new Set(opts.entityTypes) : null;
  const teamFilter = opts.team && opts.team !== 'all' ? opts.team : null;
  const filteredEntities = rawEntities.filter((e) => {
    if (typeFilter && !typeFilter.has(e.type)) return false;
    if (teamFilter && e.team !== teamFilter) return false;
    return true;
  });
  const allowedIds = new Set(filteredEntities.map((e) => e.id));
  const filteredEdges = rawEdges.filter(
    (edge) => allowedIds.has(edge.from) && allowedIds.has(edge.to),
  );

  return {
    entities: filteredEntities,
    edges: filteredEdges,
    total_entities: filteredEntities.length,
    total_edges: filteredEdges.length,
  };
}

const SEED_REFERENCES: Record<string, ReadonlyArray<EntityReference>> = {
  'ent-orion': [
    {
      deck_id: 'deck-qbr',
      deck_title: 'Q3 QBR',
      slide_id: 'sl-qbr-1',
      slide_title: 'Product adoption',
      freshness: 'fresh',
      last_referenced_at_ms: Date.UTC(2026, 7, 11),
    },
    {
      deck_id: 'deck-board',
      deck_title: 'Board update',
      slide_id: 'sl-board-3',
      slide_title: 'Engineering roadmap',
      freshness: 'stale',
      last_referenced_at_ms: Date.UTC(2026, 6, 28),
    },
    {
      deck_id: 'deck-investor',
      deck_title: 'Investor update',
      slide_id: 'sl-inv-2',
      slide_title: 'Growth metrics',
      freshness: 'outdated',
      last_referenced_at_ms: Date.UTC(2026, 5, 14),
    },
  ],
  'ent-acme': [
    {
      deck_id: 'deck-qbr',
      deck_title: 'Q3 QBR',
      slide_id: 'sl-qbr-2',
      slide_title: 'Top accounts',
      freshness: 'fresh',
      last_referenced_at_ms: Date.UTC(2026, 7, 9),
    },
    {
      deck_id: 'deck-pipe',
      deck_title: 'Pipeline review',
      slide_id: 'sl-pipe-1',
      slide_title: 'Account list',
      freshness: 'fresh',
      last_referenced_at_ms: Date.UTC(2026, 7, 12),
    },
    {
      deck_id: 'deck-board',
      deck_title: 'Board update',
      slide_id: 'sl-board-1',
      slide_title: 'Enterprise wins',
      freshness: 'stale',
      last_referenced_at_ms: Date.UTC(2026, 6, 25),
    },
  ],
  'ent-arr': [
    {
      deck_id: 'deck-qbr',
      deck_title: 'Q3 QBR',
      slide_id: 'sl-qbr-3',
      slide_title: 'ARR waterfall',
      freshness: 'fresh',
      last_referenced_at_ms: Date.UTC(2026, 7, 11),
    },
    {
      deck_id: 'deck-board',
      deck_title: 'Board update',
      slide_id: 'sl-board-2',
      slide_title: 'Financial highlights',
      freshness: 'fresh',
      last_referenced_at_ms: Date.UTC(2026, 7, 5),
    },
    {
      deck_id: 'deck-investor',
      deck_title: 'Investor update',
      slide_id: 'sl-inv-1',
      slide_title: 'KPIs',
      freshness: 'stale',
      last_referenced_at_ms: Date.UTC(2026, 6, 18),
    },
  ],
};

function deterministicReference(entityId: string, index: number): EntityReference {
  let seed = 0;
  for (let i = 0; i < entityId.length; i += 1) {
    seed = (seed * 31 + entityId.charCodeAt(i)) >>> 0;
  }
  seed = (seed + index * 17) >>> 0;
  const decks = [
    { id: 'deck-qbr', title: 'Q3 QBR' },
    { id: 'deck-board', title: 'Board update' },
    { id: 'deck-investor', title: 'Investor update' },
    { id: 'deck-pipe', title: 'Pipeline review' },
  ];
  const freshnesses: ReadonlyArray<EntityReference['freshness']> = [
    'fresh',
    'fresh',
    'stale',
    'outdated',
  ];
  const deck = decks[seed % decks.length]!;
  const freshness = freshnesses[(seed >> 3) % freshnesses.length]!;
  const day = 1 + ((seed >> 5) % 90);
  return {
    deck_id: deck.id,
    deck_title: deck.title,
    slide_id: `sl-${entityId}-${index}`,
    slide_title: `${entityId} reference #${index + 1}`,
    freshness,
    last_referenced_at_ms: Date.UTC(2026, 6, day),
  };
}

export async function getEntityReferences(entityId: string): Promise<EntityReference[]> {
  const curated = SEED_REFERENCES[entityId];
  if (curated) return curated.map((r) => ({ ...r }));
  const seedCount = (entityId.length % 2) + 2;
  return Array.from({ length: seedCount }, (_, i) => deterministicReference(entityId, i));
}

export {}; // (was: __unused re-export — removed)
