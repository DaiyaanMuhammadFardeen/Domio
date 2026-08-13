/**
 * Tests for the feature deep-dive catalogue.
 *
 * Guards against regressions in the lookup helpers and the catalogue
 * contract. Every feature must have the required tutorial surface
 * (4-6 steps) and 2-4 related slugs; every lookup must return the
 * correct detail object or null.
 */

import { describe, expect, it } from 'vitest';
import { getFeature, listAllFeatures, type FeatureDetail } from './feature-catalog';

describe('feature-catalog', () => {
  it('exposes at least 24 features (one per major capability)', () => {
    const all = listAllFeatures();
    expect(all.length).toBeGreaterThanOrEqual(24);
  });

  it('every feature has the required field shape', () => {
    for (const feature of listAllFeatures()) {
      expect(feature.slug.length).toBeGreaterThan(0);
      expect(feature.title.length).toBeGreaterThan(0);
      expect(feature.tagline.length).toBeGreaterThan(0);
      expect(feature.hero_description.length).toBeGreaterThan(0);
      expect(feature.try_cta_href).toBe(`/signup?feature=${encodeURIComponent(feature.slug)}`);
    }
  });

  it('every feature ships between 4 and 6 tutorial steps', () => {
    for (const feature of listAllFeatures()) {
      expect(feature.steps.length).toBeGreaterThanOrEqual(4);
      expect(feature.steps.length).toBeLessThanOrEqual(6);
    }
  });

  it('every tutorial step has a non-empty title, description, and alt text', () => {
    for (const feature of listAllFeatures()) {
      for (const step of feature.steps) {
        expect(step.title.length).toBeGreaterThan(0);
        expect(step.description.length).toBeGreaterThan(0);
        expect(step.screenshot_alt.length).toBeGreaterThan(0);
      }
    }
  });

  it('every feature lists between 2 and 4 related slugs', () => {
    for (const feature of listAllFeatures()) {
      expect(feature.related_slugs.length).toBeGreaterThanOrEqual(2);
      expect(feature.related_slugs.length).toBeLessThanOrEqual(4);
    }
  });

  it('related slugs always point to real features in the catalogue', () => {
    const known = new Set(listAllFeatures().map((f) => f.slug));
    for (const feature of listAllFeatures()) {
      for (const slug of feature.related_slugs) {
        expect(known.has(slug)).toBe(true);
      }
    }
  });

  it('a feature never lists itself as related', () => {
    for (const feature of listAllFeatures()) {
      expect(feature.related_slugs).not.toContain(feature.slug);
    }
  });

  it('catalog is de-duplicated by slug', () => {
    const slugs = listAllFeatures().map((f) => f.slug);
    const unique = new Set(slugs);
    expect(unique.size).toBe(slugs.length);
  });

  it('getFeature returns the matching detail for a known slug', () => {
    const all = listAllFeatures();
    expect(all.length).toBeGreaterThan(0);
    const target: FeatureDetail = all[0]!;
    const found = getFeature(target.slug);
    expect(found).not.toBeNull();
    expect(found?.slug).toBe(target.slug);
    expect(found?.title).toBe(target.title);
  });

  it('getFeature returns null for an unknown slug', () => {
    expect(getFeature('this-slug-does-not-exist')).toBeNull();
  });

  it('every try_cta_href points at /signup with a feature query param', () => {
    for (const feature of listAllFeatures()) {
      expect(feature.try_cta_href.startsWith('/signup?feature=')).toBe(true);
    }
  });
});
