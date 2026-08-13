'use client';

/**
 * EntityNode — single node visualization inside the graph canvas.
 *
 * Per Wave 11 §S11.15 of docs/frontend-roadmap/11-wave-novel-frontier.md.
 *
 * Renders a colored circle sized by reference count, plus the
 * entity name beneath. The fill color is determined by entity
 * type so people, products, KPIs, companies, and metrics are
 * visually distinguishable at a glance.
 */

import type { Entity } from '../../lib/knowledge-graph-service';

export interface EntityNodeProps {
  readonly entity: Entity;
  readonly x: number;
  readonly y: number;
  readonly selected: boolean;
  readonly onSelect: (entity: Entity) => void;
}

const TYPE_FILL: Record<Entity['type'], string> = {
  person: '#2563eb', // blue-600
  product: '#7c3aed', // violet-600
  kpi: '#db2777', // pink-600
  company: '#0d9488', // teal-600
  metric: '#ca8a04', // amber-600
};

const TYPE_STROKE: Record<Entity['type'], string> = {
  person: '#1e40af',
  product: '#5b21b6',
  kpi: '#9d174d',
  company: '#115e59',
  metric: '#92400e',
};

function radius(referenceCount: number): number {
  // Smooth scaling: clamp into a sane range so very small or very
  // large reference counts still render readably.
  const r = 8 + Math.sqrt(referenceCount) * 3.2;
  return Math.max(10, Math.min(34, r));
}

export function EntityNode({
  entity,
  x,
  y,
  selected,
  onSelect,
}: EntityNodeProps) {
  const r = radius(entity.reference_count);
  const fill = TYPE_FILL[entity.type];
  const stroke = TYPE_STROKE[entity.type];
  return (
    <g
      transform={`translate(${x} ${y})`}
      className="cursor-pointer"
      data-testid={`graph-node-${entity.id}`}
      data-entity-type={entity.type}
      onClick={() => onSelect(entity)}
      tabIndex={0}
      role="button"
      aria-label={entity.name}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect(entity);
        }
      }}
    >
      <circle
        r={r + 4}
        fill={selected ? '#0f172a' : 'transparent'}
        fillOpacity={selected ? 0.08 : 0}
      />
      <circle
        r={r}
        fill={fill}
        stroke={selected ? '#0f172a' : stroke}
        strokeWidth={selected ? 3 : 1.5}
      />
      <text
        y={r + 14}
        textAnchor="middle"
        className="fill-slate-800"
        fontSize={11}
        fontWeight={500}
      >
        {truncate(entity.name, 22)}
      </text>
    </g>
  );
}

function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  return value.slice(0, max - 1) + '…';
}