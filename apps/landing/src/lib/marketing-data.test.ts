/**
 * Sanity tests for the marketing data layer.
 *
 * Per Wave 12 §S12.1 — the marketing page must be backed by:
 *   - 24 feature cards covering 8 categories (3 per category)
 *   - 20+ FAQ items
 *   - 3 pricing tiers with non-empty feature lists
 *
 * If any of those contracts break, these tests fail loudly so the
 * homepage does not silently ship thin content.
 */

import { describe, expect, it } from 'vitest';
import {
  FEATURES,
  FAQS,
  PRICING_TIERS,
  CUSTOMER_LOGOS,
  FEATURE_CATEGORIES,
  type FeatureCategory,
  type PricingTierId,
} from './marketing-data';

describe('marketing-data', () => {
  it('exports exactly 24 feature cards', () => {
    expect(FEATURES.length).toBe(24);
  });

  it('exports exactly 8 feature categories', () => {
    expect(FEATURE_CATEGORIES.length).toBe(8);
  });

  it('exports exactly 3 pricing tiers', () => {
    expect(PRICING_TIERS.length).toBe(3);
  });

  it('exports 20+ FAQ items', () => {
    expect(FAQS.length).toBeGreaterThanOrEqual(20);
  });

  it('exports at least 8 customer logos', () => {
    expect(CUSTOMER_LOGOS.length).toBeGreaterThanOrEqual(8);
  });

  it('every feature has non-empty required fields', () => {
    for (const f of FEATURES) {
      expect(f.slug.length).toBeGreaterThan(0);
      expect(f.title.length).toBeGreaterThan(0);
      expect(f.description.length).toBeGreaterThan(0);
      expect(f.icon.length).toBeGreaterThan(0);
      expect(f.category.length).toBeGreaterThan(0);
    }
  });

  it('every feature slug is unique', () => {
    const slugs = new Set(FEATURES.map((f) => f.slug));
    expect(slugs.size).toBe(FEATURES.length);
  });

  it('every category contributes exactly 3 features', () => {
    const counts = new Map<FeatureCategory, number>();
    for (const f of FEATURES) {
      counts.set(f.category, (counts.get(f.category) ?? 0) + 1);
    }
    expect(counts.size).toBe(8);
    for (const cat of FEATURE_CATEGORIES) {
      expect(counts.get(cat.id) ?? 0).toBe(3);
    }
  });

  it('every category in FEATURES is declared in FEATURE_CATEGORIES', () => {
    const declared = new Set(FEATURE_CATEGORIES.map((c) => c.id));
    for (const f of FEATURES) {
      expect(declared.has(f.category)).toBe(true);
    }
  });

  it('pricing tier ids are unique and cover free/pro/enterprise', () => {
    const ids = new Set<PricingTierId>(PRICING_TIERS.map((t) => t.id));
    expect(ids.size).toBe(PRICING_TIERS.length);
    expect(ids.has('free')).toBe(true);
    expect(ids.has('pro')).toBe(true);
    expect(ids.has('enterprise')).toBe(true);
  });

  it('every pricing tier has a non-empty name + tagline + feature list', () => {
    for (const tier of PRICING_TIERS) {
      expect(tier.name.length).toBeGreaterThan(0);
      expect(tier.tagline.length).toBeGreaterThan(0);
      expect(tier.features.length).toBeGreaterThan(0);
      expect(tier.cta_label.length).toBeGreaterThan(0);
      expect(tier.cta_href.length).toBeGreaterThan(0);
      for (const f of tier.features) {
        expect(f.length).toBeGreaterThan(0);
      }
    }
  });

  it('free tier is $0/mo', () => {
    const free = PRICING_TIERS.find((t) => t.id === 'free');
    expect(free).toBeDefined();
    expect(free!.price_monthly_usd).toBe(0);
    expect(free!.price_yearly_usd).toBe(0);
  });

  it('pro tier has both monthly and yearly prices', () => {
    const pro = PRICING_TIERS.find((t) => t.id === 'pro');
    expect(pro).toBeDefined();
    expect(typeof pro!.price_monthly_usd).toBe('number');
    expect(typeof pro!.price_yearly_usd).toBe('number');
    expect((pro!.price_yearly_usd as number) > 0).toBe(true);
  });

  it('enterprise tier prices are null', () => {
    const ent = PRICING_TIERS.find((t) => t.id === 'enterprise');
    expect(ent).toBeDefined();
    expect(ent!.price_monthly_usd).toBeNull();
    expect(ent!.price_yearly_usd).toBeNull();
  });

  it('exactly one pricing tier is highlighted', () => {
    const highlighted = PRICING_TIERS.filter((t) => t.highlighted);
    expect(highlighted.length).toBe(1);
    expect(highlighted[0]!.id).toBe('pro');
  });

  it('every FAQ has non-empty question and answer', () => {
    for (const item of FAQS) {
      expect(item.q.length).toBeGreaterThan(0);
      expect(item.a.length).toBeGreaterThan(0);
      expect(item.category.length).toBeGreaterThan(0);
    }
  });

  it('FAQs cover the required topic set', () => {
    const topics = new Set(FAQS.map((f) => f.category));
    const required = [
      'pricing',
      'security',
      'integrations',
      'support',
      'migration',
      'data export',
      'version history',
      'accessibility',
      'mobile',
      'offline',
      'custom branding',
      'AI training data',
      'multi-region',
      'API access',
      'rate limits',
      'billing changes',
      'cancellation',
      'SLAs',
    ];
    for (const r of required) {
      expect(topics.has(r), `FAQ category "${r}" missing`).toBe(true);
    }
  });

  it('every customer logo has non-empty name and initials', () => {
    for (const c of CUSTOMER_LOGOS) {
      expect(c.name.length).toBeGreaterThan(0);
      expect(c.initials.length).toBeGreaterThan(0);
      expect(c.initials.length).toBeLessThanOrEqual(3);
    }
  });
});
