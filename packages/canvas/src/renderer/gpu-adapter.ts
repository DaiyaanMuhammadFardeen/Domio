/**
 * Renderer adapter selection — picks WebGPU → WebGL2 → Canvas2D in that order.
 *
 * The editor boots with the best adapter available; users on a fully featured
 * Chromium get WebGPU, Safari/Firefox fall back to WebGL2, and headless or
 * unsupported environments fall back to Canvas2D. A user-visible warning is
 * surfaced when forced to Canvas2D.
 *
 * The selector is deterministic and unit-tested — the contract is:
 *   "Given the same capability hints, the selector returns the same
 *    adapter kind."
 *
 * See docs/development_phases/phase-03-canvas-editor-mvp.md §B.1.
 */

export type RendererKind = 'webgpu' | 'webgl2' | 'canvas2d';

export interface RenderCapabilities {
  webgpu: boolean;
  webgl2: boolean;
  canvas2d: boolean;
}

export interface AdapterProbe {
  capabilities(): RenderCapabilities;
}

/**
 * Default probe. Uses DOM globals where available. Tests can inject a stub
 * probe to make the selection deterministic across browsers and CI.
 */
export class DefaultAdapterProbe implements AdapterProbe {
  capabilities(): RenderCapabilities {
    if (typeof navigator === 'undefined') {
      return { webgpu: false, webgl2: false, canvas2d: true };
    }
    const nav = navigator as Navigator & {
      gpu?: { requestAdapter?: () => Promise<unknown | null> };
    };
    const webgpu = typeof nav.gpu?.requestAdapter === 'function';
    const webgl2 = typeof WebGL2RenderingContext !== 'undefined';
    const canvas2d = typeof HTMLCanvasElement !== 'undefined';
    return { webgpu, webgl2, canvas2d };
  }
}

export interface AdapterSelection {
  kind: RendererKind;
  fallbackReason?: string | undefined;
  warning?: string | undefined;
}

export interface AdapterSelectorOptions {
  /** When set, forces this kind regardless of probe results. */
  force?: RendererKind;
  /** When true, surfaces a warning if Canvas2D is selected. */
  warnOnCanvas2D?: boolean;
}

/**
 * Pure selection logic. Pure so tests can verify ordering without DOM.
 */
export function selectAdapter(
  capabilities: RenderCapabilities,
  options: AdapterSelectorOptions = {},
): AdapterSelection {
  if (options.force) {
    if (options.force === 'webgpu' && !capabilities.webgpu) {
      return {
        kind: 'canvas2d',
        fallbackReason: 'forced webgpu not supported',
        warning:
          'WebGPU was requested but the browser does not support it; falling back to Canvas2D.',
      };
    }
    if (options.force === 'webgl2' && !capabilities.webgl2) {
      return {
        kind: 'canvas2d',
        fallbackReason: 'forced webgl2 not supported',
        warning: 'WebGL2 was requested but is unavailable; using Canvas2D.',
      };
    }
    if (options.force === 'canvas2d') {
      return {
        kind: 'canvas2d',
        warning:
          options.warnOnCanvas2D ?? true
            ? 'Editing in Canvas2D mode — performance and effects are reduced.'
            : undefined,
      };
    }
    return { kind: options.force };
  }
  if (capabilities.webgpu) return { kind: 'webgpu' };
  if (capabilities.webgl2) return { kind: 'webgl2' };
  return {
    kind: 'canvas2d',
    warning:
      options.warnOnCanvas2D ?? true
        ? 'Editing in Canvas2D mode — performance and effects are reduced.'
        : undefined,
  };
}

export class AdapterSelector {
  constructor(
    private readonly probe: AdapterProbe = new DefaultAdapterProbe(),
    private readonly options: AdapterSelectorOptions = {},
  ) {}

  select(): AdapterSelection {
    return selectAdapter(this.probe.capabilities(), this.options);
  }
}