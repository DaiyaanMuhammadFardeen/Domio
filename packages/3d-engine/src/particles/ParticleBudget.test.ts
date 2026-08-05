import { describe, it, expect } from 'vitest';
import { computeParticleBudget, getBackendLimit } from './ParticleBudget.js';
import type { LODSelection } from '../contracts/renderer.v1.js';

function makeLod(level: 0 | 1 | 2 | 3): LODSelection {
  return { level, triangleCount: 100, screenRadiusPx: 100, distance: 10 };
}

describe('computeParticleBudget', () => {
  it('webgl2 hero tier allows 250k particles', () => {
    const result = computeParticleBudget('webgl2', 'hero', makeLod(0), 250_000);
    expect(result.maxParticles).toBe(250_000);
    expect(result.withinBudget).toBe(true);
    expect(result.suggestedCount).toBe(250_000);
  });

  it('webgpu hero tier allows 1M particles', () => {
    const result = computeParticleBudget('webgpu', 'hero', makeLod(0), 1_000_000);
    expect(result.maxParticles).toBe(1_000_000);
    expect(result.withinBudget).toBe(true);
    expect(result.suggestedCount).toBe(1_000_000);
  });

  it('exceeds budget when requested > max', () => {
    const result = computeParticleBudget('webgl2', 'hero', makeLod(0), 300_000);
    expect(result.withinBudget).toBe(false);
  });

  it('LOD level 1 halves the suggested count', () => {
    const result = computeParticleBudget('webgpu', 'hero', makeLod(1), 1_000_000);
    expect(result.suggestedCount).toBe(500_000);
    expect(result.withinBudget).toBe(true);
  });

  it('LOD level 2 quarters the suggested count', () => {
    const result = computeParticleBudget('webgpu', 'hero', makeLod(2), 1_000_000);
    expect(result.suggestedCount).toBe(250_000);
    expect(result.withinBudget).toBe(true);
  });

  it('standard tier has lower particle budget', () => {
    const result = computeParticleBudget('webgl2', 'standard', makeLod(0), 50_000);
    expect(result.tierBudget).toBe(50_000);
    expect(result.withinBudget).toBe(true);
  });
});

describe('getBackendLimit', () => {
  it('returns 250k for webgl2', () => {
    expect(getBackendLimit('webgl2')).toBe(250_000);
  });

  it('returns 1M for webgpu', () => {
    expect(getBackendLimit('webgpu')).toBe(1_000_000);
  });
});
