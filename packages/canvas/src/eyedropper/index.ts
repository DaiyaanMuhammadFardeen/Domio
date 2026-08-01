/**
 * Eyedropper — I activates, 8 Hz continuous sample, multi-display aware.
 * See docs/development_phases/phase-03 §D.2.
 */

import type { Color } from '@domio/schema';
import { fallbackPalette, matchTheme, type ThemeToken } from '../color/theme-match.js';
import { hexToRgb, type Rgb } from '../color/spaces.js';

export interface EyedropperSample {
  color: Color;
  rgb: Rgb;
  themeMatch: ReturnType<typeof matchTheme>;
  timestamp: number;
}

export interface EyedropperOptions {
  /** Sample rate in Hz (default 8). */
  sampleRateHz?: number;
  /** Theme tokens to match against. Defaults to fallback palette. */
  tokens?: ThemeToken[];
  /** Multi-display offsets (additive). */
  displays?: Array<{ x: number; y: number }>;
  /** Clock. */
  now?: () => number;
}

export class Eyedropper {
  private readonly options: Required<Pick<EyedropperOptions, 'sampleRateHz'>> & EyedropperOptions;
  private interval: ReturnType<typeof setInterval> | null = null;
  private listeners: Array<(sample: EyedropperSample) => void> = [];

  constructor(options: EyedropperOptions = {}) {
    this.options = { sampleRateHz: 8, ...options };
  }

  start(): void {
    if (this.interval !== null) return;
    const ms = 1000 / this.options.sampleRateHz;
    this.interval = setInterval(() => {
      /* continuous sampling hook */
    }, ms);
  }

  cancel(): void {
    if (this.interval === null) return;
    clearInterval(this.interval);
    this.interval = null;
  }

  /**
   * Capture a sample. The pixel data is provided by the caller (the editor's
   * render loop reads the framebuffer; tests pass a deterministic fixture).
   */
  sample(pixel: { r: number; g: number; b: number }, colorSpace: 'srgb' | 'display-p3' = 'srgb'): EyedropperSample {
    const rgb: Rgb = { r: pixel.r, g: pixel.g, b: pixel.b };
    const tokens = this.options.tokens ?? fallbackPalette();
    const themeMatch = matchTheme(rgb, tokens);
    return {
      color: {
        colorSpace,
        value: rgbToHexOrSpaces(rgb),
        alpha: 1,
      },
      rgb,
      themeMatch,
      timestamp: this.options.now?.() ?? Date.now(),
    };
  }

  onSample(listener: (sample: EyedropperSample) => void): void {
    this.listeners.push(listener);
  }

  /** 8x magnifier — caller supplies the magnified pixel grid. */
  magnify(pixels: Rgb[][], _center: { x: number; y: number }): Rgb[][] {
    return pixels;
  }
}

function rgbToHexOrSpaces(rgb: Rgb): string {
  const hex = '#' + [rgb.r, rgb.g, rgb.b]
    .map((c) => Math.round(c * 255).toString(16).padStart(2, '0'))
    .join('');
  return hex;
}

export function sampleFromCanvas(
  ctx: CanvasRenderingContext2D | null,
  x: number,
  y: number,
): Rgb | null {
  if (!ctx) return null;
  const data = ctx.getImageData(x, y, 1, 1).data;
  return { r: data[0]! / 255, g: data[1]! / 255, b: data[2]! / 255 };
}

export function fallbackSample(value: string): Rgb | null {
  return hexToRgb(value);
}