import { describe, it, expect } from 'vitest';
import { selectAdapter, type AdapterProbe, type RenderCapabilities } from '../src/renderer/gpu-adapter.js';

class StubProbe implements AdapterProbe {
  constructor(private readonly caps: RenderCapabilities) {}
  capabilities(): RenderCapabilities {
    return this.caps;
  }
}

describe('selectAdapter', () => {
  it('picks WebGPU when available', () => {
    const result = selectAdapter({ webgpu: true, webgl2: true, canvas2d: true });
    expect(result.kind).toBe('webgpu');
    expect(result.warning).toBeUndefined();
  });

  it('falls back to WebGL2 when WebGPU is unavailable', () => {
    const result = selectAdapter({ webgpu: false, webgl2: true, canvas2d: true });
    expect(result.kind).toBe('webgl2');
    expect(result.warning).toBeUndefined();
  });

  it('falls back to Canvas2D and warns the user', () => {
    const result = selectAdapter({ webgpu: false, webgl2: false, canvas2d: true });
    expect(result.kind).toBe('canvas2d');
    expect(result.warning).toBeDefined();
    expect(result.warning).toContain('Canvas2D');
  });

  it('honors force=webgpu and falls back with a warning when unavailable', () => {
    const result = selectAdapter(
      { webgpu: false, webgl2: true, canvas2d: true },
      { force: 'webgpu' },
    );
    expect(result.kind).toBe('canvas2d');
    expect(result.fallbackReason).toBeDefined();
    expect(result.warning).toContain('WebGPU');
  });

  it('honors force=webgl2 and falls back with a warning when unavailable', () => {
    const result = selectAdapter(
      { webgpu: false, webgl2: false, canvas2d: true },
      { force: 'webgl2' },
    );
    expect(result.kind).toBe('canvas2d');
    expect(result.warning).toContain('WebGL2');
  });

  it('warns on Canvas2D when warnOnCanvas2D is true', () => {
    const result = selectAdapter(
      { webgpu: false, webgl2: false, canvas2d: true },
      { force: 'canvas2d' },
    );
    expect(result.kind).toBe('canvas2d');
    expect(result.warning).toBeDefined();
  });

  it('suppresses the Canvas2D warning when warnOnCanvas2D is false', () => {
    const result = selectAdapter(
      { webgpu: false, webgl2: false, canvas2d: true },
      { force: 'canvas2d', warnOnCanvas2D: false },
    );
    expect(result.kind).toBe('canvas2d');
    expect(result.warning).toBeUndefined();
  });

  it('is deterministic across calls with the same capabilities', () => {
    const caps: RenderCapabilities = { webgpu: false, webgl2: true, canvas2d: true };
    const a = selectAdapter(caps);
    const b = selectAdapter(caps);
    expect(a).toEqual(b);
  });

  it('exposes a probe-driven selector with the same behavior', () => {
    const probe = new StubProbe({ webgpu: false, webgl2: false, canvas2d: true });
    const caps = probe.capabilities();
    expect(selectAdapter(caps).kind).toBe('canvas2d');
  });
});