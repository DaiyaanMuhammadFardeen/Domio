/**
 * Network graph — deterministic force-directed node/edge layout.
 *
 * Uses a seeded RNG (mulberry32) with fixed iteration count for
 * deterministic output.  More than 50 unique categories triggers
 * aggregation to top-50 + "other".
 */

import type { Vec3, LODSelection } from '../contracts/renderer.v1.js';

// ---------------------------------------------------------------------------
// Local types
// ---------------------------------------------------------------------------

export interface NetworkNodeInput {
  id: string;
  category: string;
  /** Optional weight for node size. */
  weight?: number;
}

export interface NetworkEdgeInput {
  source: string;
  target: string;
  weight?: number;
}

export interface NetworkNodeOutput {
  id: string;
  category: string;
  position: Vec3;
  weight: number;
}

export interface NetworkEdgeOutput {
  source: string;
  target: string;
  weight: number;
}

export interface NetworkResult {
  nodes: NetworkNodeOutput[];
  edges: NetworkEdgeOutput[];
  /** True if categories were aggregated. */
  aggregated: boolean;
  instanceCount: number;
  lod: LODSelection;
}

// ---------------------------------------------------------------------------
// Seeded RNG (mulberry32) — deterministic
// ---------------------------------------------------------------------------

function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Category aggregation
// ---------------------------------------------------------------------------

const MAX_CATEGORIES = 50;

function aggregateCategories(
  nodes: NetworkNodeInput[],
): { nodes: NetworkNodeInput[]; aggregated: boolean } {
  const categoryCounts = new Map<string, number>();
  for (const n of nodes) {
    categoryCounts.set(n.category, (categoryCounts.get(n.category) ?? 0) + 1);
  }

  if (categoryCounts.size <= MAX_CATEGORIES) {
    return { nodes, aggregated: false };
  }

  // Keep top 50 categories by count, rename rest to "other"
  const sorted = [...categoryCounts.entries()].sort((a, b) => b[1] - a[1]);
  const topCategories = new Set(sorted.slice(0, MAX_CATEGORIES).map(([c]) => c));

  const aggregated = nodes.map((n) => ({
    ...n,
    category: topCategories.has(n.category) ? n.category : 'other',
  }));

  return { nodes: aggregated, aggregated: true };
}

// ---------------------------------------------------------------------------
// Deterministic force simulation
// ---------------------------------------------------------------------------

const FIXED_ITERATIONS = 100;

/**
 * Run a deterministic force-directed layout with fixed iterations.
 * No Math.random — uses the seeded RNG.
 */
export function forceLayout(
  nodes: NetworkNodeInput[],
  edges: NetworkEdgeInput[],
  seed: number,
  iterations = FIXED_ITERATIONS,
): Vec3[] {
  const rng = mulberry32(seed);
  const n = nodes.length;
  if (n === 0) return [];

  // Initialise positions in a circle
  const positions: Vec3[] = nodes.map((_, i) => {
    const angle = (2 * Math.PI * i) / n;
    return { x: Math.cos(angle) * 10, y: Math.sin(angle) * 10, z: 0 };
  });

  // Build adjacency for faster lookup
  const nodeIndex = new Map<string, number>();
  for (let i = 0; i < n; i++) {
    nodeIndex.set(nodes[i]!.id, i);
  }

  const repulsion = 50;
  const attraction = 0.01;
  const damping = 0.9;

  for (let iter = 0; iter < iterations; iter++) {
    const forces: Vec3[] = positions.map(() => ({ x: 0, y: 0, z: 0 }));

    // Repulsion between all pairs
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const dx = positions[i]!.x - positions[j]!.x;
        const dy = positions[i]!.y - positions[j]!.y;
        const dz = positions[i]!.z - positions[j]!.z;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz) + 0.01;
        const force = repulsion / (dist * dist);
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        const fz = (dz / dist) * force;
        forces[i]!.x += fx;
        forces[i]!.y += fy;
        forces[i]!.z += fz;
        forces[j]!.x -= fx;
        forces[j]!.y -= fy;
        forces[j]!.z -= fz;
      }
    }

    // Attraction along edges
    for (const edge of edges) {
      const si = nodeIndex.get(edge.source);
      const ti = nodeIndex.get(edge.target);
      if (si === undefined || ti === undefined) continue;
      const dx = positions[ti]!.x - positions[si]!.x;
      const dy = positions[ti]!.y - positions[si]!.y;
      const dz = positions[ti]!.z - positions[si]!.z;
      const w = edge.weight ?? 1;
      forces[si]!.x += dx * attraction * w;
      forces[si]!.y += dy * attraction * w;
      forces[si]!.z += dz * attraction * w;
      forces[ti]!.x -= dx * attraction * w;
      forces[ti]!.y -= dy * attraction * w;
      forces[ti]!.z -= dz * attraction * w;
    }

    // Apply forces with damping and small random perturbation
    for (let i = 0; i < n; i++) {
      positions[i]!.x += forces[i]!.x * damping + (rng() - 0.5) * 0.01;
      positions[i]!.y += forces[i]!.y * damping + (rng() - 0.5) * 0.01;
      positions[i]!.z += forces[i]!.z * damping + (rng() - 0.5) * 0.1;
    }
  }

  return positions;
}

// ---------------------------------------------------------------------------
// LOD scaling
// ---------------------------------------------------------------------------

function lodScale(level: LODSelection['level']): number {
  switch (level) {
    case 0: return 1.0;
    case 1: return 0.5;
    case 2: return 0.25;
    case 3: return 0.125;
  }
}

// ---------------------------------------------------------------------------
// NetworkGraph
// ---------------------------------------------------------------------------

/**
 * Generate a deterministic network graph layout.
 */
export function generateNetwork(
  nodesInput: NetworkNodeInput[],
  edgesInput: NetworkEdgeInput[],
  lod: LODSelection,
  seed = 42,
): NetworkResult {
  const { nodes: processedNodes, aggregated } = aggregateCategories(nodesInput);
  const positions = forceLayout(processedNodes, edgesInput, seed);
  const scale = lodScale(lod.level);

  const nodes: NetworkNodeOutput[] = processedNodes.map((n, i) => ({
    id: n.id,
    category: n.category,
    position: positions[i]!,
    weight: n.weight ?? 1,
  }));

  const edges: NetworkEdgeOutput[] = edgesInput.map((e) => ({
    source: e.source,
    target: e.target,
    weight: e.weight ?? 1,
  }));

  return {
    nodes,
    edges,
    aggregated,
    instanceCount: Math.round(nodes.length * scale),
    lod,
  };
}
