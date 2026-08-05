/**
 * Scene light manager.
 *
 * Maintains a list of up to 8 lights without warning; adding a 9th
 * returns a warning suggesting baking.  8-bit UI values (0–255) are
 * linearised internally; hex colours go through sRGB → linear.
 */

import type { SceneLight, LightKind, Vec3 } from '../contracts/renderer.v1.js';

// ---------------------------------------------------------------------------
// Types local to this module (promote if the orchestrator sees fit)
// ---------------------------------------------------------------------------

export interface LightAddResult {
  ok: boolean;
  warning?: string;
}

export interface LinearizedLight {
  kind: LightKind;
  position?: Vec3;
  direction?: Vec3;
  /** Linear RGB components [0–1]. */
  colorLinear: { r: number; g: number; b: number };
  /** Linear intensity [0–1]. */
  intensityLinear: number;
  angleDeg?: number;
}

// ---------------------------------------------------------------------------
// sRGB → linear conversion (IEC 61966-2-1)
// ---------------------------------------------------------------------------

function srgbToLinear(u8: number): number {
  const v = u8 / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

function parseHexColor(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace(/^#/, '');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return { r, g, b };
}

// ---------------------------------------------------------------------------
// LightManager
// ---------------------------------------------------------------------------

const MAX_LIGHTS = 8;

export class LightManager {
  private lights: SceneLight[] = [];

  /** Current number of lights. */
  get count(): number {
    return this.lights.length;
  }

  /** Read-only view of the current lights. */
  get all(): readonly SceneLight[] {
    return this.lights;
  }

  /**
   * Add a light. Returns `{ ok: true }` for lights 1–8 and
   * `{ ok: true, warning: '...' }` when adding the 9th.
   */
  add(light: SceneLight): LightAddResult {
    if (this.lights.length >= MAX_LIGHTS) {
      this.lights.push(light);
      return {
        ok: true,
        warning: 'Scene lights add GPU cost; consider baking',
      };
    }
    this.lights.push(light);
    return { ok: true };
  }

  /** Update a light at the given index. Returns false if out of range. */
  update(index: number, light: SceneLight): boolean {
    if (index < 0 || index >= this.lights.length) return false;
    this.lights[index] = light;
    return true;
  }

  /** Remove a light by index. Returns false if out of range. */
  remove(index: number): boolean {
    if (index < 0 || index >= this.lights.length) return false;
    this.lights.splice(index, 1);
    return true;
  }

  /**
   * Linearise all lights for GPU consumption.
   * - Hex colours → sRGB → linear RGB.
   * - 8-bit intensity (u8 0–255) → linear 0–1.
   */
  getLinearized(): LinearizedLight[] {
    return this.lights.map((l) => {
      const c = parseHexColor(l.color);
      return {
        kind: l.kind,
        ...(l.position !== undefined && { position: l.position }),
        ...(l.direction !== undefined && { direction: l.direction }),
        colorLinear: {
          r: srgbToLinear(c.r),
          g: srgbToLinear(c.g),
          b: srgbToLinear(c.b),
        },
        intensityLinear: l.intensity <= 1 ? l.intensity : srgbToLinear(l.intensity),
        ...(l.angleDeg !== undefined && { angleDeg: l.angleDeg }),
      };
    });
  }

  /** Remove all lights. */
  clear(): void {
    this.lights = [];
  }
}
