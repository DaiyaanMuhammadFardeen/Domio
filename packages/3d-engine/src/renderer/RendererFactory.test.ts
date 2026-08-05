import { describe, it, expect } from 'vitest';
import { DomioRendererFactory, detectRendererKind } from './RendererFactory.js';
import { WebGL2Renderer } from './WebGL2Renderer.js';
import { WebGPURenderer } from './WebGPURenderer.js';
import { enforceBudget } from './BudgetEnforcer.js';
import { DRAW_CALL_BUDGETS } from '../contracts/renderer.v1.js';
import type { RenderPlan } from '../contracts/renderer.v1.js';

// ---------------------------------------------------------------------------
// Factory tests
// ---------------------------------------------------------------------------

describe('DomioRendererFactory', () => {
  it('creates WebGPU renderer when gpu is present', () => {
    const factory = new DomioRendererFactory();
    const renderer = factory.create({
      gpu: { requestAdapter: () => ({}) },
      canvas: {},
    });
    expect(renderer).toBeInstanceOf(WebGPURenderer);
    expect(renderer?.kind).toBe('webgpu');
    expect(renderer?.capabilities.particleUplift).toBe(5);
    renderer?.dispose();
  });

  it('falls back to WebGL2 when gpu is absent', () => {
    const factory = new DomioRendererFactory();
    const renderer = factory.create({ canvas: {} });
    expect(renderer).toBeInstanceOf(WebGL2Renderer);
    expect(renderer?.kind).toBe('webgl2');
    expect(renderer?.capabilities.particleUplift).toBe(1);
    renderer?.dispose();
  });

  it('returns null when neither gpu nor canvas is present', () => {
    const factory = new DomioRendererFactory();
    const renderer = factory.create({ canvas: undefined });
    expect(renderer).toBeNull();
  });

  it('context loss on WebGL2 signals fallback needed', () => {
    const renderer = new WebGL2Renderer();
    const needsFallback = renderer.onContextLost();
    expect(needsFallback).toBe(true);
  });

  it('context loss on WebGPU signals fallback needed', () => {
    const renderer = new WebGPURenderer();
    const needsFallback = renderer.onContextLost();
    expect(needsFallback).toBe(true);
  });

  it('WebGPU has 5x particle uplift vs WebGL2', () => {
    const webgl2 = new WebGL2Renderer();
    const webgpu = new WebGPURenderer();
    expect(webgpu.capabilities.maxParticles).toBe(
      webgl2.capabilities.maxParticles * 5,
    );
    webgl2.dispose();
    webgpu.dispose();
  });

  it('attaches webglcontextlost handler via addEventListener', () => {
    let handler: (() => void) | undefined;
    const ctx = {
      canvas: {},
      addEventListener: (_type: string, h: () => void) => {
        handler = h;
      },
    };
    const factory = new DomioRendererFactory();
    const renderer = factory.create(ctx);
    expect(renderer).toBeInstanceOf(WebGL2Renderer);
    // Simulate context loss event
    handler?.();
    expect(renderer?.onContextLost()).toBe(true);
    renderer?.dispose();
  });
});

describe('detectRendererKind', () => {
  it('returns webgpu when gpu is present', () => {
    expect(detectRendererKind({ gpu: {}, canvas: {} })).toBe('webgpu');
  });

  it('returns webgl2 when only canvas is present', () => {
    expect(detectRendererKind({ canvas: {} })).toBe('webgl2');
  });

  it('returns null when nothing is available', () => {
    expect(detectRendererKind({ canvas: undefined })).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Renderer capability / interface tests
// ---------------------------------------------------------------------------

describe('WebGL2Renderer', () => {
  it('throws on render after dispose', () => {
    const r = new WebGL2Renderer();
    r.dispose();
    const plan: RenderPlan = {
      lodSelection: {},
      lights: [],
      camera: { position: { x: 0, y: 0, z: 0 }, target: { x: 0, y: 0, z: 0 }, fovDeg: 60, rollDeg: 0 },
      particleCounts: {},
      degraded: false,
      tier: 'hero',
    };
    expect(() => r.render(plan)).toThrow('disposed');
  });

  it('throws on render after context loss', () => {
    const r = new WebGL2Renderer();
    r.onContextLost();
    const plan: RenderPlan = {
      lodSelection: {},
      lights: [],
      camera: { position: { x: 0, y: 0, z: 0 }, target: { x: 0, y: 0, z: 0 }, fovDeg: 60, rollDeg: 0 },
      particleCounts: {},
      degraded: false,
      tier: 'hero',
    };
    expect(() => r.render(plan)).toThrow('context lost');
  });
});

describe('WebGPURenderer', () => {
  it('throws on render after dispose', () => {
    const r = new WebGPURenderer();
    r.dispose();
    const plan: RenderPlan = {
      lodSelection: {},
      lights: [],
      camera: { position: { x: 0, y: 0, z: 0 }, target: { x: 0, y: 0, z: 0 }, fovDeg: 60, rollDeg: 0 },
      particleCounts: {},
      degraded: false,
      tier: 'hero',
    };
    expect(() => r.render(plan)).toThrow('disposed');
  });
});

// ---------------------------------------------------------------------------
// BudgetEnforcer tests
// ---------------------------------------------------------------------------

function makePlan(overrides: Partial<RenderPlan> = {}): RenderPlan {
  return {
    lodSelection: {},
    lights: [],
    camera: {
      position: { x: 0, y: 0, z: 0 },
      target: { x: 0, y: 0, z: 0 },
      fovDeg: 60,
      rollDeg: 0,
    },
    particleCounts: {},
    degraded: false,
    tier: 'hero',
    ...overrides,
  };
}

describe('BudgetEnforcer', () => {
  it('hero model 1.5M tris fits hero budget — not degraded', () => {
    const plan = makePlan();
    const budget = DRAW_CALL_BUDGETS.hero;
    const caps = new WebGL2Renderer().capabilities;
    const result = enforceBudget(plan, budget, caps, { hero_mesh: 1_500_000 }, { hero_mesh: 5 });
    expect(result.degraded).toBe(false);
    expect(result.plan.lodSelection.hero_mesh?.level).toBe(0);
    expect(result.plan.lodSelection.hero_mesh?.triangleCount).toBe(1_500_000);
  });

  it('4.2M tris → auto-decimation to ~1.5M with decimated flag', () => {
    const plan = makePlan();
    const budget = DRAW_CALL_BUDGETS.hero;
    const caps = new WebGL2Renderer().capabilities;
    const result = enforceBudget(plan, budget, caps, { hero_mesh: 4_200_000 });
    expect(result.degraded).toBe(true);
    expect(result.decimationTargets.hero_mesh).toBeLessThanOrEqual(1_500_000);
    // The ratio should bring it down to the budget level
    const targetTriangles = result.decimationTargets.hero_mesh ?? 0;
    expect(targetTriangles).toBeGreaterThan(0);
    expect(targetTriangles).toBeLessThanOrEqual(budget.maxTriangles);
  });

  it('>4 lights warns with baking suggestion', () => {
    const plan = makePlan({
      lights: [
        { kind: 'directional', color: '#fff', intensity: 1 },
        { kind: 'point', color: '#fff', intensity: 1, position: { x: 0, y: 0, z: 0 } },
        { kind: 'spot', color: '#fff', intensity: 1, position: { x: 0, y: 0, z: 0 }, direction: { x: 0, y: -1, z: 0 } },
        { kind: 'ambient', color: '#fff', intensity: 0.3 },
        { kind: 'point', color: '#fff', intensity: 1, position: { x: 5, y: 0, z: 0 } },
      ],
    });
    const budget = DRAW_CALL_BUDGETS.hero;
    const caps = new WebGL2Renderer().capabilities;
    const result = enforceBudget(plan, budget, caps, {});
    expect(result.warnings.some((w) => w.includes('consider baking'))).toBe(true);
    expect(result.degraded).toBe(true);
  });

  it('1M particles in WebGL2 → degraded', () => {
    const plan = makePlan({
      particleCounts: { emitter1: 1_000_000 },
    });
    const budget = DRAW_CALL_BUDGETS.hero;
    const caps = new WebGL2Renderer().capabilities; // maxParticles: 250k, particleUplift: 1
    const result = enforceBudget(plan, budget, caps, {});
    expect(result.degraded).toBe(true);
  });

  it('1M particles in WebGPU → ok (5x uplift)', () => {
    const plan = makePlan({
      particleCounts: { emitter1: 1_000_000 },
    });
    const budget = DRAW_CALL_BUDGETS.hero;
    const caps = new WebGPURenderer().capabilities; // maxParticles: 1.25M, particleUplift: 5
    const result = enforceBudget(plan, budget, caps, {});
    expect(result.degraded).toBe(false);
  });

  it('standard tier respects lower triangle budget', () => {
    const plan = makePlan({ tier: 'standard' });
    const budget = DRAW_CALL_BUDGETS.standard; // 250k
    const caps = new WebGL2Renderer().capabilities;
    // 500k > 250k standard budget
    const result = enforceBudget(plan, budget, caps, { mesh: 500_000 });
    expect(result.degraded).toBe(true);
    expect(result.decimationTargets.mesh).toBeLessThanOrEqual(250_000);
  });
});
