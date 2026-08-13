/**
 * Tests for nav-sitemap.
 *
 * Per Wave 13. The sitemap is the single source of truth for the
 * landing surface, so it must:
 *   - have unique ids (no duplicate nodes)
 *   - have unique hrefs (no two nodes pointing at the same URL)
 *   - every parent reference must resolve to a known node
 *   - every sibling/seeAlso must resolve
 *   - feature deep-dive nodes' parents must all be `features-index`
 *
 * Plus a smoke test for `landingBreadcrumbs` that the chain walks
 * root → leaf.
 */

import { describe, expect, it } from 'vitest';
import {
  ALL_LANDING_NODES,
  NAV_SITEMAP,
  footerColumns,
  landingBreadcrumbs,
  landingNodeById,
} from './nav-sitemap';
import { listAllFeatures } from './feature-catalog';

describe('nav-sitemap', () => {
  it('NAV_SITEMAP is frozen', () => {
    expect(Object.isFrozen(NAV_SITEMAP)).toBe(true);
  });

  it('every node has a unique id', () => {
    const ids = NAV_SITEMAP.map((n) => n.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it('every node has a unique href within the landing surface', () => {
    const hrefs = NAV_SITEMAP.map((n) => n.href);
    const unique = new Set(hrefs);
    expect(unique.size).toBe(hrefs.length);
  });

  it('every parent reference resolves to a known node', () => {
    const ids = new Set(NAV_SITEMAP.map((n) => n.id));
    for (const node of NAV_SITEMAP) {
      if (node.parent) {
        expect(ids.has(node.parent)).toBe(true);
      }
    }
  });

  it('every seeAlso reference resolves to a known node', () => {
    const ids = new Set(NAV_SITEMAP.map((n) => n.id));
    for (const node of NAV_SITEMAP) {
      for (const ref of node.seeAlso ?? []) {
        expect(ids.has(ref)).toBe(true);
      }
    }
  });

  it('home is the root (no parent)', () => {
    const home = landingNodeById('home');
    expect(home).toBeTruthy();
    expect(home?.parent).toBeUndefined();
  });

  it('every feature deep-dive node has features-index as its parent', () => {
    const features = listAllFeatures();
    expect(features.length).toBeGreaterThan(0);
    for (const feature of features) {
      const node = landingNodeById(`feature-${feature.slug}`);
      expect(node).toBeTruthy();
      expect(node?.parent).toBe('features-index');
    }
  });

  it('every feature node has at least one sibling and seeAlso link', () => {
    const features = listAllFeatures();
    for (const feature of features) {
      const node = landingNodeById(`feature-${feature.slug}`);
      expect(node?.siblings?.length ?? 0).toBeGreaterThan(0);
      expect(node?.seeAlso?.length ?? 0).toBeGreaterThan(0);
    }
  });

  it('landingBreadcrumbs returns root → leaf chain', () => {
    const features = listAllFeatures();
    const first = features[0]!;
    const chain = landingBreadcrumbs(`feature-${first.slug}`);
    expect(chain.length).toBeGreaterThanOrEqual(3);
    expect(chain[0]?.id).toBe('home');
    expect(chain[chain.length - 1]?.id).toBe(`feature-${first.slug}`);
  });

  it('landingBreadcrumbs returns [home] for the home node', () => {
    const chain = landingBreadcrumbs('home');
    expect(chain.map((n) => n.id)).toEqual(['home']);
  });

  it('landingBreadcrumbs returns empty for unknown ids', () => {
    const chain = landingBreadcrumbs('does-not-exist');
    expect(chain).toEqual([]);
  });

  it('ALL_LANDING_NODES is the union of static + feature nodes', () => {
    expect(ALL_LANDING_NODES.length).toBeGreaterThan(NAV_SITEMAP.length);
    const features = listAllFeatures();
    for (const feature of features) {
      expect(ALL_LANDING_NODES.some((n) => n.id === `feature-${feature.slug}`)).toBe(true);
    }
  });

  it('footerColumns partitions the sitemap into 5 columns', () => {
    const columns = footerColumns();
    const headings = columns.map((c) => c.heading);
    expect(headings).toEqual(['Product', 'Resources', 'Company', 'Legal', 'Apps']);
    for (const col of columns) {
      for (const link of col.links) {
        expect(link.label).toBeTruthy();
        expect(link.href).toBeTruthy();
      }
    }
  });
});
