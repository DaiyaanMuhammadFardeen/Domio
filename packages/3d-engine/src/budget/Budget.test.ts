import { describe, it, expect } from 'vitest';
import {
  getEffectiveBudget,
  enforcePolygonBudget,
  getTierBudgets,
} from './PolygonBudget.js';
import {
  getTextureBudget,
  checkTextureBudget,
} from './TextureBudget.js';

// ---------------------------------------------------------------------------
// PolygonBudget tests
// ---------------------------------------------------------------------------

describe('PolygonBudget', () => {
  it('hero tier budget is 1.5M tris', () => {
    const budget = getEffectiveBudget('hero');
    expect(budget.maxTriangles).toBe(1_500_000);
    expect(budget.maxLights).toBe(4);
  });

  it('standard tier budget is 250k tris', () => {
    const budget = getEffectiveBudget('standard');
    expect(budget.maxTriangles).toBe(250_000);
  });

  it('background tier budget is 50k tris', () => {
    const budget = getEffectiveBudget('background');
    expect(budget.maxTriangles).toBe(50_000);
  });

  it('org override is honored', () => {
    const budget = getEffectiveBudget('hero', {
      orgOverrides: { hero: { maxTriangles: 2_000_000 } },
    });
    expect(budget.maxTriangles).toBe(2_000_000);
    // Non-overridden fields stay from base
    expect(budget.maxLights).toBe(4);
  });

  it('decimation toast message formatting (M tris)', () => {
    const result = enforcePolygonBudget(4_200_000, 'hero');
    expect(result.decimated).toBe(true);
    expect(result.targetTriangles).toBe(1_500_000);
    expect(result.toastMessage).toContain('4.2M');
    expect(result.toastMessage).toContain('1.5M');
    expect(result.toastMessage).toContain('restore original');
  });

  it('no decimation when within budget', () => {
    const result = enforcePolygonBudget(1_000_000, 'hero');
    expect(result.decimated).toBe(false);
    expect(result.targetTriangles).toBe(1_000_000);
    expect(result.toastMessage).toBe('');
  });

  it('toast data includes original and target', () => {
    const result = enforcePolygonBudget(4_200_000, 'hero');
    expect(result.toastData.originalTriangles).toBe(4_200_000);
    expect(result.toastData.targetTriangles).toBe(1_500_000);
  });

  it('getTierBudgets returns all tiers', () => {
    const budgets = getTierBudgets();
    expect(budgets.hero).toBeDefined();
    expect(budgets.standard).toBeDefined();
    expect(budgets.background).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// TextureBudget tests
// ---------------------------------------------------------------------------

describe('TextureBudget', () => {
  it('hero tier texture budget is 512 MB', () => {
    const budget = getTextureBudget('hero');
    expect(budget.maxTextureBytes).toBe(512 * 1024 * 1024);
    expect(budget.maxTextureDimension).toBe(4096);
    expect(budget.maxTextureCount).toBe(32);
  });

  it('standard tier texture budget is 128 MB', () => {
    const budget = getTextureBudget('standard');
    expect(budget.maxTextureBytes).toBe(128 * 1024 * 1024);
  });

  it('background tier texture budget is 32 MB', () => {
    const budget = getTextureBudget('background');
    expect(budget.maxTextureBytes).toBe(32 * 1024 * 1024);
  });

  it('org override is honored', () => {
    const budget = getTextureBudget('hero', {
      orgOverrides: { hero: { maxTextureBytes: 1024 * 1024 * 1024 } },
    });
    expect(budget.maxTextureBytes).toBe(1024 * 1024 * 1024);
    expect(budget.maxTextureDimension).toBe(4096); // non-overridden
  });

  it('within budget when usage is acceptable', () => {
    const result = checkTextureBudget(
      { totalBytes: 100 * 1024 * 1024, maxDimension: 2048, count: 8 },
      'hero',
    );
    expect(result.withinBudget).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it('reports violations for exceeding budget', () => {
    const result = checkTextureBudget(
      { totalBytes: 600 * 1024 * 1024, maxDimension: 8192, count: 50 },
      'hero',
    );
    expect(result.withinBudget).toBe(false);
    expect(result.violations.length).toBe(3);
    expect(result.violations.some((v) => v.includes('memory'))).toBe(true);
    expect(result.violations.some((v) => v.includes('dimension'))).toBe(true);
    expect(result.violations.some((v) => v.includes('count'))).toBe(true);
  });
});
