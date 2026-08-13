/**
 * knowledge-graph-service — typed client for the cross-deck
 * knowledge graph endpoint.
 *
 * Per Wave 7 §S7.12 of docs/frontend-roadmap/07-wave-analytics-insights.md.
 *
 * Wraps `/v1/analytics/graph` on the analytics-warehouse. The graph
 * is claim-centric: each claim node has source slides and citations,
 * and edges link claims to decks + citations.
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

const VALID_KINDS: ReadonlyArray<GraphNodeKind> = [
  'claim',
  'slide',
  'citation',
  'deck',
];

const VALID_EDGE_KINDS: ReadonlyArray<GraphEdge['kind']> = [
  'source_slide',
  'cites',
  'cross_deck',
];

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