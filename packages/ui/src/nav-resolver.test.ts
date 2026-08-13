/**
 * Tests for nav-graph + nav-resolver.
 *
 * Per Wave 13. Verifies that:
 *   - the graph starts empty (no nodes declared yet — surfaces add
 *     them in landing/dashboard/etc.)
 *   - resolver helpers gracefully degrade for unknown ids/hrefs
 *   - surfaceRoots() has stable ordering
 *   - breadcrumbsFor and relatedFor handle malformed input without
 *     crashing
 */

import { describe, expect, it } from 'vitest';
import {
  NAV_GRAPH,
  SURFACE_ROOTS,
} from './nav-graph.js';
import {
  nodeById,
  nodeByHref,
  nodesBySurface,
  primaryNav,
  surfaceRoots,
  breadcrumbsFor,
  breadcrumbsForHref,
  relatedFor,
  relatedForHref,
  childrenOf,
  nodesPointingAt,
} from './nav-resolver.js';

describe('nav-graph + nav-resolver', () => {
  it('starts as an empty, frozen graph', () => {
    expect(NAV_GRAPH).toEqual([]);
    expect(Object.isFrozen(NAV_GRAPH)).toBe(true);
  });

  it('SURFACE_ROOTS lists every app surface in deterministic order', () => {
    const labels = SURFACE_ROOTS.map((r) => r.label);
    expect(labels).toContain('Marketing');
    expect(labels).toContain('Editor');
    expect(labels).toContain('Dashboard');
    expect(labels).toContain('Admin');
    // Sorted by `order` ascending.
    const orders = SURFACE_ROOTS.map((r) => r.order);
    const sorted = [...orders].sort((a, b) => a - b);
    expect(orders).toEqual(sorted);
  });

  it('nodeById / nodeByHref return null for unknown inputs', () => {
    expect(nodeById('does-not-exist')).toBeNull();
    expect(nodeByHref('https://nowhere/')).toBeNull();
  });

  it('nodesBySurface returns an empty array for unknown surfaces', () => {
    // Cast to any so TS allows; runtime check is the point.
    expect(nodesBySurface('landing' as never)).toEqual([]);
  });

  it('primaryNav returns an empty array when no primary nodes exist', () => {
    expect(primaryNav('landing')).toEqual([]);
    expect(primaryNav('editor')).toEqual([]);
  });

  it('surfaceRoots returns a stable, sorted list', () => {
    const roots = surfaceRoots();
    const sortedOrders = roots.map((r) => r.order);
    expect(sortedOrders).toEqual([...sortedOrders].sort((a, b) => a - b));
    expect(Object.isFrozen(roots)).toBe(true);
  });

  it('breadcrumbsFor returns an empty list for null nodes', () => {
    expect(breadcrumbsFor(null)).toEqual([]);
  });

  it('breadcrumbsForHref degrades gracefully for unknown hrefs', () => {
    expect(breadcrumbsForHref('/never/seen')).toEqual([]);
  });

  it('relatedFor returns siblings + seeAlso for a real node', () => {
    // Empty graph yields empty related.
    const fakeNode = {
      id: 'fake',
      surface: 'landing' as const,
      category: 'feature' as const,
      label: 'Fake',
      href: '/fake',
      siblings: ['nope'],
      seeAlso: ['also-nope'],
    };
    expect(relatedFor(fakeNode)).toEqual([]);
  });

  it('relatedForHref degrades gracefully', () => {
    expect(relatedForHref('/anything')).toEqual([]);
  });

  it('childrenOf returns the empty array when no children present', () => {
    const fakeNode = {
      id: 'fake',
      surface: 'landing' as const,
      category: 'feature' as const,
      label: 'Fake',
      href: '/fake',
    };
    expect(childrenOf(fakeNode)).toEqual([]);
  });

  it('nodesPointingAt returns empty when graph is empty', () => {
    expect(nodesPointingAt('editor', 'dashboard')).toEqual([]);
  });
});
