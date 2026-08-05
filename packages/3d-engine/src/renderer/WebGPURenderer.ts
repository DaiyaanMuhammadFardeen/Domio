/**
 * @domio/3d-engine — WebGPU renderer backend.
 *
 * Implements RendererLike for WebGPU.  Provides 5x particle uplift
 * compared to WebGL2.  Draw calls are stubbed; budget enforcement is real.
 */

import type {
  RendererLike,
  RendererCapabilities,
  RenderPlan,
} from '../contracts/renderer.v1.js';

export class WebGPURenderer implements RendererLike {
  readonly kind = 'webgpu' as const;
  readonly capabilities: RendererCapabilities;
  private _disposed = false;
  private _contextLost = false;

  constructor() {
    this.capabilities = {
      kind: 'webgpu',
      maxTriangles: 10_000_000,
      maxParticles: 1_250_000,
      extensions: [],
      particleUplift: 5,
    };
  }

  render(plan: RenderPlan): void {
    if (this._disposed) throw new Error('WebGPURenderer: disposed');
    if (this._contextLost) throw new Error('WebGPURenderer: context lost');
    void plan;
  }

  /**
   * WebGPU context loss is rarer than WebGL2 but still possible.
   * Signals the caller to create a new renderer instance.
   */
  onContextLost(): boolean {
    this._contextLost = true;
    return true;
  }

  dispose(): void {
    this._disposed = true;
  }
}
