'use client';

/**
 * Pipeline graph renderer — Wave 10 §S10.8.
 *
 * Renders an inline SVG graph of agents (nodes) connected by handoff
 * edges (arrows). Nodes are circles colored by their status; edges
 * are straight lines with arrow markers. Clicking a node invokes
 * `onSelectNode` with its id so the parent can show detail.
 *
 * The layout is a simple horizontal left-to-right flow: nodes are
 * placed at evenly spaced x-coordinates, edges are drawn as straight
 * lines. No fancy force layout — kept deterministic and inspectable.
 *
 * All SVG fills reference the design tokens from @domio/ui/tokens.css
 * so light/dark themes stay in sync.
 */

import { useMemo } from 'react';
import { clsx } from 'clsx';
import type { AgentNode, AgentNodeStatus, AgentEdge } from '../../lib/agent-handoff-service';

export interface PipelineGraphProps {
  nodes: ReadonlyArray<AgentNode>;
  edges: ReadonlyArray<AgentEdge>;
  selectedNodeId?: string | null;
  onSelectNode?: (nodeId: string) => void;
}

const NODE_RADIUS = 28;
const LEFT_PAD = 60;
const RIGHT_PAD = 60;
const TOP_PAD = 40;
const VERTICAL_CENTER = 110;
const SVG_WIDTH_DEFAULT = 640;
const SVG_HEIGHT = 220;

function statusColors(status: AgentNodeStatus): {
  fill: string;
  stroke: string;
  text: string;
  edge: string;
} {
  switch (status) {
    case 'running':
      return {
        fill: 'var(--warning)',
        stroke: 'var(--warning)',
        text: 'var(--surface-0)',
        edge: 'var(--content-muted)',
      };
    case 'done':
      return {
        fill: 'var(--success)',
        stroke: 'var(--success)',
        text: 'var(--surface-0)',
        edge: 'var(--success)',
      };
    case 'error':
      return {
        fill: 'var(--danger)',
        stroke: 'var(--danger)',
        text: 'var(--surface-0)',
        edge: 'var(--danger)',
      };
    case 'idle':
    default:
      return {
        fill: 'var(--surface-3)',
        stroke: 'var(--border-strong)',
        text: 'var(--content-primary)',
        edge: 'var(--border-default)',
      };
  }
}

function statusAccent(status: AgentNodeStatus): string {
  switch (status) {
    case 'running':
      return 'animate-pulse';
    default:
      return '';
  }
}

export function PipelineGraph({
  nodes,
  edges,
  selectedNodeId,
  onSelectNode,
}: PipelineGraphProps) {
  const positions = useMemo(() => {
    const map = new Map<string, { x: number; y: number }>();
    if (nodes.length === 0) return map;
    const usable = SVG_WIDTH_DEFAULT - LEFT_PAD - RIGHT_PAD;
    const step = nodes.length === 1 ? 0 : usable / (nodes.length - 1);
    nodes.forEach((node, idx) => {
      map.set(node.id, {
        x: LEFT_PAD + idx * step,
        y: VERTICAL_CENTER,
      });
    });
    return map;
  }, [nodes]);

  const width = SVG_WIDTH_DEFAULT;
  const height = SVG_HEIGHT;

  if (nodes.length === 0) {
    return (
      <div
        data-testid="pipeline-graph-empty"
        className="flex h-40 items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white text-sm text-slate-500"
      >
        No agents in this pipeline.
      </div>
    );
  }

  return (
    <div
      data-testid="pipeline-graph"
      className="overflow-x-auto rounded-xl border border-slate-200 bg-white p-2"
    >
      <svg
        role="img"
        aria-label="Agent pipeline graph"
        viewBox={`0 0 ${width} ${height}`}
        width={width}
        height={height}
        className="block min-w-full"
      >
        <defs>
          <marker
            id="arrow"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--border-strong)" />
          </marker>
          <marker
            id="arrow-active"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--content-primary)" />
          </marker>
        </defs>

        {/* Edges */}
        {edges.map((edge, i) => {
          const from = positions.get(edge.from);
          const to = positions.get(edge.to);
          if (!from || !to) return null;
          const isActive = selectedNodeId === edge.from || selectedNodeId === edge.to;
          const midX = (from.x + to.x) / 2;
          const midY = (from.y + to.y) / 2 - 14;
          return (
            <g key={`edge-${i}`}>
              <line
                x1={from.x + NODE_RADIUS}
                y1={from.y}
                x2={to.x - NODE_RADIUS - 4}
                y2={to.y}
                stroke={isActive ? 'var(--content-primary)' : 'var(--border-strong)'}
                strokeWidth={isActive ? 2 : 1.5}
                markerEnd={isActive ? 'url(#arrow-active)' : 'url(#arrow)'}
              />
              {edge.label && (
                <text
                  x={midX}
                  y={midY}
                  textAnchor="middle"
                  className="fill-slate-500"
                  fontSize={11}
                >
                  {edge.label}
                </text>
              )}
            </g>
          );
        })}

        {/* Nodes */}
        {nodes.map((node) => {
          const pos = positions.get(node.id);
          if (!pos) return null;
          const colors = statusColors(node.status);
          const selected = selectedNodeId === node.id;
          return (
            <g
              key={node.id}
              data-testid={`pipeline-graph-node-${node.id}`}
              data-status={node.status}
              data-selected={selected ? 'true' : 'false'}
              transform={`translate(${pos.x}, ${pos.y})`}
              onClick={() => onSelectNode?.(node.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelectNode?.(node.id);
                }
              }}
              tabIndex={0}
              role="button"
              aria-label={`${node.name} (${node.status})`}
              className={clsx('cursor-pointer focus:outline-none', statusAccent(node.status))}
            >
              <circle
                r={NODE_RADIUS}
                fill={colors.fill}
                stroke={selected ? 'var(--content-primary)' : colors.stroke}
                strokeWidth={selected ? 3 : 2}
              />
              <text
                textAnchor="middle"
                y={4}
                className="select-none"
                fontSize={11}
                fontWeight={600}
                fill={colors.text}
              >
                {node.name.split(' ')[0]}
              </text>
              <text
                textAnchor="middle"
                y={NODE_RADIUS + 14}
                className="select-none fill-slate-500"
                fontSize={10}
              >
                {node.status}
              </text>
              {selected && (
                <circle
                  r={NODE_RADIUS + 6}
                  fill="none"
                  stroke="var(--content-primary)"
                  strokeWidth={1}
                  strokeDasharray="3 3"
                />
              )}
            </g>
          );
        })}

        {/* Top label */}
        <text
          x={width / 2}
          y={TOP_PAD - 14}
          textAnchor="middle"
          className="fill-slate-400"
          fontSize={11}
        >
          input
        </text>
      </svg>
    </div>
  );
}
