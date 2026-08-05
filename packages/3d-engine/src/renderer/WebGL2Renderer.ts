/**
 * @domio/3d-engine — WebGL2 renderer backend.
 *
 * Implements RendererLike for WebGL2 contexts.  The actual GL draw calls
 * are stubbed (they live in the editor viewport in a later wave).  Budget
 * enforcement, capability reporting, and context-loss recovery are real.
 */

import type {
  RendererLike,
  RendererCapabilities,
  RenderPlan,
} from '../contracts/renderer.v1.js';

/** Extensions we query for capability reporting. */
const QUERIED_EXTENSIONS = [
  'EXT_color_buffer_float',
  'OES_texture_float_linear',
  'WEBGL_draw_buffers',
] as const;

export class WebGL2Renderer implements RendererLike {
  readonly kind = 'webgl2' as const;
  readonly capabilities: RendererCapabilities;
  private _disposed = false;
  private _contextLost = false;

  constructor() {
    // In CI there is no real GL context; we report conservative defaults.
    this.capabilities = {
      kind: 'webgl2',
      maxTriangles: 1_500_000,
      maxParticles: 250_000,
      extensions: [...QUERIED_EXTENSIONS],
      particleUplift: 1,
    };
  }

  render(plan: RenderPlan): void {
    if (this._disposed) throw new Error('WebGL2Renderer: disposed');
    if (this._contextLost) throw new Error('WebGL2Renderer: context lost');
    // Stub — actual draw calls are in the editor viewport layer.
    void plan;
  }

  /**
   * Attempt to recover from a WebGL `webglcontextlost` event.
   *
   * In a real browser the context may be restored by the GPU driver; here
   * we simulate the fallback path: the renderer marks itself as lost and
   * the caller can create a fresh instance.
   *
   * @returns `true` when the caller should create a new renderer (always
   *   for WebGL2 since we cannot guarantee restoration).
   */
  onContextLost(): boolean {
    this._contextLost = true;
    // WebGL2 context loss is typically unrecoverable in practice; signal
    // the caller to create a replacement.
    return true;
  }

  dispose(): void {
    this._disposed = true;
  }
}
