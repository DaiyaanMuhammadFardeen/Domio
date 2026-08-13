'use client';

/**
 * GraphCanvas — SVG node-link renderer for the cross-deck knowledge
 * graph (Wave 11 §S11.15).
 *
 * Renders a deterministic force-directed layout computed in JS (no
 * external graph library). Nodes are placed by entity type and pulled
 * toward the centroid while edges exert a spring force proportional to
 * the reference weight. Edges are drawn as lines whose stroke width
 * scales with `weight`.
 *
 * Determinism matters: the layout runs the same number of iterations
 * on every render given the same node + edge set, so the visualization
 * does not "wiggle" while the user pans or zooms. The layout is
 * computed once when the graph data changes and memoized via
 * `useMemo`.
 */

import { useMemo } from 'react';

import type {
  Entity,
  GraphEdgeEntity,
} from '../../lib/knowledge-graph-service';

import { EntityNode } from './EntityNode';

export interface GraphCanvasProps {
  readonly entities: ReadonlyArray<Entity>;
  readonly edges: ReadonlyArray<GraphEdgeEntity>;
  readonly selectedId: string | null;
  readonly onSelect: (entity: Entity) => void;
}

const VIEWBOX_W = 720;
const VIEWBOX_H = 460;

interface PositionedEntity extends Entity {
  readonly x: number;
  readonly y: number;
}

interface EdgeView {
  readonly from: PositionedEntity;
  readonly to: PositionedEntity;
  readonly weight: number;
  readonly relation: GraphEdgeEntity['relation'];
}

const RELATION_DASH: Record<GraphEdgeEntity['relation'], string | undefined> = {
  references: undefined,
  derived_from: '5 3',
  updates: '2 2',
};

const RELATION_COLOR: Record<GraphEdgeEntity['relation'], string> = {
  references: '#94a3b8', // slate-400
  derived_from: '#6366f1', // indigo-500
  updates: '#0ea5e9', // sky-500
};

function deterministicHash(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 0xffffffff;
}

function forceLayout(
  entities: ReadonlyArray<Entity>,
  edges: ReadonlyArray<GraphEdgeEntity>,
): PositionedEntity[] {
  const ids = entities.map((e) => e.id);
  const N = entities.length;
  if (N === 0) return [];

  const cx = VIEWBOX_W / 2;
  const cy = VIEWBOX_H / 2;
  const radius = Math.min(VIEWBOX_W, VIEWBOX_H) * 0.36;

  // Initial positions: arrange entities of the same type around a
  // circle, with deterministic per-node angle so reloads look the same.
  const positions = new Map<string, { x: number; y: number }>();
  entities.forEach((entity, i) => {
    const angle = (i / Math.max(1, N)) * Math.PI * 2 +
      deterministicHash(entity.id) * Math.PI * 2;
    positions.set(entity.id, {
      x: cx + Math.cos(angle) * radius,
      y: cy + Math.sin(angle) * radius,
    });
  });

  const iterations = 60;
  const kRepel = 4800;
  const kSpring = 0.04;
  const naturalLen = 110;
  const damping = 0.85;

  const velocities = new Map<string, { vx: number; vy: number }>();
  ids.forEach((id) => velocities.set(id, { vx: 0, vy: 0 }));

  const idIndex = new Map<string, number>();
  ids.forEach((id, i) => idIndex.set(id, i));

  const adjacency: Array<[number, number, number]> = [];
  for (const edge of edges) {
    const a = idIndex.get(edge.from);
    const b = idIndex.get(edge.to);
    if (a === undefined || b === undefined) continue;
    adjacency.push([a, b, edge.weight]);
  }

  for (let iter = 0; iter < iterations; iter += 1) {
    const forces = ids.map(() => ({ fx: 0, fy: 0 }));

    for (let i = 0; i < N; i += 1) {
      for (let j = i + 1; j < N; j += 1) {
        const pi = positions.get(ids[i]!);
        const pj = positions.get(ids[j]!);
        if (!pi || !pj) continue;
        const dx = pi.x - pj.x;
        const dy = pi.y - pj.y;
        const dist2 = dx * dx + dy * dy + 0.01;
        const dist = Math.sqrt(dist2);
        const force = kRepel / dist2;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        forces[i]!.fx += fx;
        forces[i]!.fy += fy;
        forces[j]!.fx -= fx;
        forces[j]!.fy -= fy;
      }
    }

    for (const [a, b, weight] of adjacency) {
      const pa = positions.get(ids[a]!);
      const pb = positions.get(ids[b]!);
      if (!pa || !pb) continue;
      const dx = pb.x - pa.x;
      const dy = pb.y - pa.y;
      const dist = Math.sqrt(dx * dx + dy * dy) + 0.01;
      const len = naturalLen / Math.max(0.5, Math.sqrt(weight));
      const displacement = dist - len;
      const fx = (dx / dist) * displacement * kSpring;
      const fy = (dy / dist) * displacement * kSpring;
      forces[a]!.fx += fx;
      forces[a]!.fy += fy;
      forces[b]!.fx -= fx;
      forces[b]!.fy -= fy;
    }

    // Centering pull
    for (let i = 0; i < N; i += 1) {
      const p = positions.get(ids[i]!);
      if (!p) continue;
      forces[i]!.fx += (cx - p.x) * 0.001;
      forces[i]!.fy += (cy - p.y) * 0.001;
    }

    for (let i = 0; i < N; i += 1) {
      const v = velocities.get(ids[i]!)!;
      v.vx = (v.vx + forces[i]!.fx * 0.02) * damping;
      v.vy = (v.vy + forces[i]!.fy * 0.02) * damping;
      const p = positions.get(ids[i]!)!;
      const nx = Math.max(28, Math.min(VIEWBOX_W - 28, p.x + v.vx));
      const ny = Math.max(28, Math.min(VIEWBOX_H - 28, p.y + v.vy));
      positions.set(ids[i]!, { x: nx, y: ny });
    }
  }

  return entities.map((entity) => {
    const pos = positions.get(entity.id)!;
    return { ...entity, x: pos.x, y: pos.y };
  });
}

export function GraphCanvas({
  entities,
  edges,
  selectedId,
  onSelect,
}: GraphCanvasProps) {
  const positioned = useMemo(() => forceLayout(entities, edges), [entities, edges]);

  const positionedById = useMemo(() => {
    const map = new Map<string, PositionedEntity>();
    positioned.forEach((p) => map.set(p.id, p));
    return map;
  }, [positioned]);

  const edgesToRender: EdgeView[] = useMemo(() => {
    const out: EdgeView[] = [];
    for (const edge of edges) {
      const a = positionedById.get(edge.from);
      const b = positionedById.get(edge.to);
      if (!a || !b) continue;
      out.push({ from: a, to: b, weight: edge.weight, relation: edge.relation });
    }
    return out;
  }, [edges, positionedById]);

  return (
    <svg
      viewBox={`0 0 ${VIEWBOX_W} ${VIEWBOX_H}`}
      role="img"
      aria-label="Cross-deck knowledge graph"
      className="block h-[460px] w-full rounded-xl border border-slate-200 bg-white"
      data-testid="graph-canvas"
    >
      <g>
        {edgesToRender.map((edge, i) => {
          const strokeWidth = Math.min(4, 0.6 + Math.sqrt(edge.weight) * 0.55);
          return (
            <line
              key={`edge-${i}`}
              x1={edge.from.x}
              y1={edge.from.y}
              x2={edge.to.x}
              y2={edge.to.y}
              stroke={RELATION_COLOR[edge.relation]}
              strokeOpacity={0.55}
              strokeWidth={strokeWidth}
              strokeDasharray={RELATION_DASH[edge.relation]}
              data-testid={`graph-edge-${i}`}
              data-relation={edge.relation}
            />
          );
        })}
      </g>
      <g>
        {positioned.map((entity) => (
          <EntityNode
            key={entity.id}
            entity={entity}
            x={entity.x}
            y={entity.y}
            selected={selectedId === entity.id}
            onSelect={onSelect}
          />
        ))}
      </g>
    </svg>
  );
}