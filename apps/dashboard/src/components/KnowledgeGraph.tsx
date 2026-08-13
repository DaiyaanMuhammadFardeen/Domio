'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  fetchKnowledgeGraph,
  type GraphEdge,
  type GraphNode,
  type KnowledgeGraph,
} from '../lib/knowledge-graph-service';

export interface KnowledgeGraphProps {
  workspaceId: string;
  initial?: KnowledgeGraph;
  onClaimClick?: (node: GraphNode) => void;
}

interface PositionedNode extends GraphNode {
  readonly x: number;
  readonly y: number;
}

const VIEWBOX_W = 800;
const VIEWBOX_H = 480;

function layoutNodes(nodes: ReadonlyArray<GraphNode>): Map<string, PositionedNode> {
  // Place claims in a horizontal band; related slides + citations
  // dangle below each claim.
  const claims = nodes.filter((n) => n.kind === 'claim');
  const others = nodes.filter((n) => n.kind !== 'claim');
  const positions = new Map<string, PositionedNode>();
  const claimSpacing = claims.length > 0 ? VIEWBOX_W / (claims.length + 1) : 0;
  claims.forEach((claim, i) => {
    const x = claimSpacing * (i + 1);
    const y = VIEWBOX_H * 0.32;
    positions.set(claim.id, { ...claim, x, y });
  });
  // Distribute other nodes below their closest claim (by index).
  others.forEach((node, i) => {
    const claimIdx = i % Math.max(1, claims.length);
    const parent = claims[claimIdx];
    if (!parent) return;
    const parentX = (positions.get(parent.id)?.x) ?? VIEWBOX_W / 2;
    const offset = ((i % 5) - 2) * 60;
    const x = Math.max(20, Math.min(VIEWBOX_W - 20, parentX + offset));
    const y = VIEWBOX_H * 0.7 + ((i % 3) - 1) * 36;
    positions.set(node.id, { ...node, x, y });
  });
  return positions;
}

function nodeRadius(kind: GraphNode['kind']): number {
  switch (kind) {
    case 'claim':
      return 14;
    case 'slide':
      return 9;
    case 'citation':
      return 7;
    case 'deck':
      return 11;
  }
}

function nodeFill(kind: GraphNode['kind']): string {
  switch (kind) {
    case 'claim':
      return 'fill-brand-600';
    case 'slide':
      return 'fill-slate-500';
    case 'citation':
      return 'fill-amber-500';
    case 'deck':
      return 'fill-emerald-500';
  }
}

function edgeStroke(kind: GraphEdge['kind']): string {
  switch (kind) {
    case 'source_slide':
      return 'stroke-slate-400';
    case 'cites':
      return 'stroke-amber-500';
    case 'cross_deck':
      return 'stroke-emerald-500';
  }
}

/**
 * KnowledgeGraph — interactive node-link diagram.
 *
 * Renders the graph as inline SVG with claim nodes centered. Click a
 * claim to surface the source slide preview; cross-deck edges
 * highlight decks that share the claim.
 */
export function KnowledgeGraph({
  workspaceId,
  initial,
  onClaimClick,
}: KnowledgeGraphProps) {
  const [data, setData] = useState<KnowledgeGraph>(
    initial ?? { nodes: [], edges: [], claims: [] },
  );
  const [selected, setSelected] = useState<GraphNode | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (initial !== undefined) return;
    let cancelled = false;
    async function load() {
      const graph = await fetchKnowledgeGraph(workspaceId, {
        ...(search ? { search } : {}),
      });
      if (!cancelled) setData(graph);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [workspaceId, search, initial]);

  const positions = useMemo(
    () => layoutNodes(data.nodes),
    [data.nodes],
  );

  function handleClick(node: GraphNode) {
    setSelected(node);
    if (node.kind === 'claim') onClaimClick?.(node);
  }

  if (data.nodes.length === 0) {
    return (
      <div
        className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500"
        role="status"
        data-testid="knowledge-graph-empty"
      >
        No graph data yet. Once the warehouse publishes cross-deck
        claims + citations, they will render here.
      </div>
    );
  }

  const slideForClaim = selected
    ? data.nodes.find(
        (n) =>
          n.kind === 'slide' &&
          data.edges.some(
            (e) =>
              e.kind === 'source_slide' &&
              e.from === selected.id &&
              e.to === n.id,
          ),
      )
    : null;
  const citationForClaim = selected
    ? data.nodes.find(
        (n) =>
          n.kind === 'citation' &&
          data.edges.some(
            (e) =>
              e.kind === 'cites' &&
              e.from === selected.id &&
              e.to === n.id,
          ),
      )
    : null;
  const crossDecks = selected
    ? data.nodes.filter(
        (n) =>
          n.kind === 'deck' &&
          data.edges.some(
            (e) =>
              e.kind === 'cross_deck' &&
              e.from === selected.id &&
              e.to === n.id,
          ),
      )
    : [];

  return (
    <div className="space-y-4" data-testid="knowledge-graph">
      <div className="flex items-center justify-between">
        <input
          type="search"
          data-testid="knowledge-graph-search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search claims (e.g. Q3 revenue)"
          className="w-full max-w-md rounded-md border border-slate-300 px-3 py-1.5 text-sm"
        />
        <span className="text-xs text-slate-500">
          {data.nodes.length} nodes · {data.edges.length} edges
        </span>
      </div>

      <svg
        viewBox={`0 0 ${VIEWBOX_W} ${VIEWBOX_H}`}
        role="img"
        aria-label="Knowledge graph"
        className="block h-[480px] w-full rounded-xl border border-slate-200 bg-white"
        data-testid="knowledge-graph-svg"
      >
        <g>
          {data.edges.map((edge, i) => {
            const a = positions.get(edge.from);
            const b = positions.get(edge.to);
            if (!a || !b) return null;
            return (
              <line
                key={`edge-${i}`}
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                className={`${edgeStroke(edge.kind)} stroke-1`}
                strokeDasharray={edge.kind === 'cross_deck' ? '4 2' : undefined}
              />
            );
          })}
        </g>
        <g>
          {Array.from(positions.values()).map((node) => (
            <g
              key={node.id}
              transform={`translate(${node.x} ${node.y})`}
              className="cursor-pointer"
              onClick={() => handleClick(node)}
              data-testid={`knowledge-node-${node.kind}`}
            >
              <circle
                r={nodeRadius(node.kind)}
                className={nodeFill(node.kind)}
                stroke="white"
                strokeWidth={2}
              />
              <text
                y={nodeRadius(node.kind) + 12}
                textAnchor="middle"
                className="fill-slate-700 text-[10px] font-medium"
              >
                {truncate(node.label, 22)}
              </text>
            </g>
          ))}
        </g>
      </svg>

      {selected ? (
        <section
          className="rounded-xl border border-slate-200 bg-white p-4"
          data-testid="knowledge-graph-preview"
        >
          <h3 className="text-sm font-semibold text-slate-900">
            {selected.label}
          </h3>
          <dl className="mt-2 grid grid-cols-1 gap-2 text-xs sm:grid-cols-3">
            <div>
              <dt className="font-medium uppercase tracking-wide text-slate-500">
                Source slide
              </dt>
              <dd className="text-slate-700">
                {slideForClaim?.label ?? '—'}
              </dd>
            </div>
            <div>
              <dt className="font-medium uppercase tracking-wide text-slate-500">
                Citation
              </dt>
              <dd className="text-slate-700">
                {citationForClaim?.label ?? '—'}
              </dd>
            </div>
            <div>
              <dt className="font-medium uppercase tracking-wide text-slate-500">
                Cross-deck
              </dt>
              <dd className="text-slate-700">
                {crossDecks.length > 0
                  ? crossDecks.map((d) => d.label).join(', ')
                  : '—'}
              </dd>
            </div>
          </dl>
        </section>
      ) : (
        <p className="text-xs text-slate-500">
          Click a claim (large brand-colored node) to see its source slide, citation, and
          cross-deck links.
        </p>
      )}
    </div>
  );
}

function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  return value.slice(0, max - 1) + '…';
}