/**
 * nav-resolver — query helpers over `NAV_GRAPH`.
 *
 * Per Wave 13. Every consumer (Breadcrumbs, RelatedLinks, Pager,
 * AppNav) goes through these helpers so the graph stays the single
 * source of truth.
 */

import type { NavNode, NavSurface } from './nav-graph.js';
import { NAV_GRAPH, SURFACE_ROOTS } from './nav-graph.js';

/** Index of nodes by id (built once, frozen). */
const BY_ID: ReadonlyMap<string, NavNode> = new Map(
  NAV_GRAPH.map((node) => [node.id, node] as const),
);

/** Index of nodes by href (built once, frozen). */
const BY_HREF: ReadonlyMap<string, NavNode> = new Map(
  NAV_GRAPH.map((node) => [node.href, node] as const),
);

/** Index of nodes by surface (preserves insertion order). */
const BY_SURFACE: ReadonlyMap<NavSurface, ReadonlyArray<NavNode>> = (() => {
  const acc = new Map<NavSurface, NavNode[]>();
  for (const node of NAV_GRAPH) {
    const list = acc.get(node.surface) ?? [];
    list.push(node);
    acc.set(node.surface, list);
  }
  const out = new Map<NavSurface, ReadonlyArray<NavNode>>();
  for (const [surface, list] of acc) {
    out.set(surface, Object.freeze(list));
  }
  return out;
})();

/**
 * Resolve a node by its `id`. Returns `null` for unknown ids so
 * callers can degrade gracefully (e.g. drop an orphan link).
 */
export function nodeById(id: string): NavNode | null {
  return BY_ID.get(id) ?? null;
}

/**
 * Resolve a node by its `href`. Returns `null` for unknown URLs.
 * Both absolute and relative URLs are matched as stored.
 */
export function nodeByHref(href: string): NavNode | null {
  return BY_HREF.get(href) ?? null;
}

/**
 * All nodes belonging to a surface, in registration order.
 * Returns an empty array (not null) if the surface has no nodes.
 */
export function nodesBySurface(surface: NavSurface): ReadonlyArray<NavNode> {
  return BY_SURFACE.get(surface) ?? [];
}

/**
 * The primary nav list for a surface — nodes with `primary: true`,
 * sorted by their `order` field (lower first).
 */
export function primaryNav(surface: NavSurface): ReadonlyArray<NavNode> {
  const list = nodesBySurface(surface).filter((node) => node.primary === true);
  return Object.freeze([...list].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)));
}

/**
 * The cross-app switcher roots, sorted by their `order` field.
 */
export function surfaceRoots(): ReadonlyArray<(typeof SURFACE_ROOTS)[number]> {
  return Object.freeze([...SURFACE_ROOTS].sort((a, b) => a.order - b.order));
}

/**
 * Walk the parent chain from `node` all the way back to the root.
 * Returns the chain in *root → leaf* order so it can be rendered
 * directly as breadcrumbs (Home first, current last).
 *
 * Stops at 32 hops as a defensive guard against cycles.
 */
export function breadcrumbsFor(node: NavNode | null): ReadonlyArray<NavNode> {
  const chain: NavNode[] = [];
  if (!node) return Object.freeze(chain);
  const seen = new Set<string>();
  let current: NavNode | null = node;
  let hops = 0;
  while (current && hops < 32) {
    if (seen.has(current.id)) break; // cycle guard
    seen.add(current.id);
    chain.unshift(current);
    if (!current.parent) break;
    current = nodeById(current.parent);
    hops += 1;
  }
  return Object.freeze(chain);
}

/** Convenience: resolve breadcrumbs by href. */
export function breadcrumbsForHref(href: string): ReadonlyArray<NavNode> {
  const node = nodeByHref(href);
  return node ? breadcrumbsFor(node) : Object.freeze([]);
}

/**
 * Related nodes for `node` — siblings (deduplicated) plus seeAlso
 * (deduplicated). Order is stable: siblings first, then seeAlso.
 * Any unresolved id is silently dropped.
 */
export function relatedFor(node: NavNode): ReadonlyArray<NavNode> {
  const out: NavNode[] = [];
  const seen = new Set<string>();
  const push = (id: string) => {
    if (seen.has(id)) return;
    const n = nodeById(id);
    if (!n || n.id === node.id) return;
    seen.add(id);
    out.push(n);
  };
  for (const id of node.siblings ?? []) push(id);
  for (const id of node.seeAlso ?? []) push(id);
  return Object.freeze(out);
}

/** Convenience: resolve related by href. */
export function relatedForHref(href: string): ReadonlyArray<NavNode> {
  const node = nodeByHref(href);
  return node ? relatedFor(node) : Object.freeze([]);
}

/**
 * Children of a node — used by feature deep-dives and docs drill-down
 * surfaces. Returns an empty array when the node has no children.
 */
export function childrenOf(node: NavNode): ReadonlyArray<NavNode> {
  if (!node.children) return Object.freeze([]);
  const out: NavNode[] = [];
  for (const id of node.children) {
    const n = nodeById(id);
    if (n) out.push(n);
  }
  return Object.freeze(out);
}

/**
 * Resolve every node that points at any of the given surfaces via
 * `crossApp`. Used by the cross-app "Related" section on landing
 * pages.
 */
export function nodesPointingAt(...surfaces: ReadonlyArray<NavSurface>): ReadonlyArray<NavNode> {
  const set = new Set(surfaces);
  const out: NavNode[] = [];
  for (const node of NAV_GRAPH) {
    if (!node.crossApp || node.crossApp.length === 0) continue;
    if (node.crossApp.some((s) => set.has(s))) out.push(node);
  }
  return Object.freeze(out);
}
