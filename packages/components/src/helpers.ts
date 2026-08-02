/**
 * Scene-graph element builders for component authors.
 *
 * All builders produce elements in the component's LOCAL coordinate space
 * (0..size.w × 0..size.h). `expandComponent` scales them into the layer's
 * transform box before rendering.
 *
 * Conventions shared with the renderers:
 *  - rect fills: `fill: { type: 'solid', color: rgba }`
 *  - text styling: `style.fill = { color: { colorSpace, value } }`, plus
 *    fontSize / fontWeight / fontFamily / textAlign / verticalAlign
 *  - strokes: `stroke: { color: rgba, width }`
 *  - vectors: `paths: ['M … L …']` with stroke/fill
 */

import type { FrameLayer, TextLayer, VectorLayer } from '@domio/schema';
import type { BuildContext } from './types.js';

export type FillSpec = string | { r: number; g: number; b: number; a: number };

export interface RectSpec {
  x: number;
  y: number;
  w: number;
  h: number;
  semanticId: string;
  fill?: FillSpec | undefined;
  stroke?: string | undefined;
  strokeWidth?: number | undefined;
  radius?: number | undefined;
  opacity?: number | undefined;
}

export interface TextSpec {
  x: number;
  y: number;
  w: number;
  h: number;
  content: string;
  fontSize: number;
  color: string;
  semanticId: string;
  fontWeight?: number;
  fontFamily?: string;
  align?: 'start' | 'middle' | 'end';
  verticalCenter?: boolean;
  letterSpacing?: number;
  opacity?: number;
}

export interface LineSpec {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  stroke: string;
  strokeWidth: number;
  semanticId: string;
  dash?: string | undefined;
}

export function rect(ctx: BuildContext, spec: RectSpec): FrameLayer {
  const fill = spec.fill === undefined ? undefined : toStyleFill(spec.fill);
  const stroke =
    spec.stroke === undefined
      ? undefined
      : { color: toRGBA(spec.stroke), width: spec.strokeWidth ?? 1 };
  return {
    id: ctx.id(),
    semanticId: ctx.semanticId(spec.semanticId),
    type: 'frame',
    name: spec.semanticId,
    parentId: null,
    transform: {
      x: spec.x,
      y: spec.y,
      w: spec.w,
      h: spec.h,
      rotation: 0,
    },
    aspect: { ratioW: spec.w, ratioH: spec.h },
    ...(fill === undefined ? {} : { fill }),
    ...(stroke === undefined ? {} : { stroke }),
    ...(spec.radius !== undefined ? { style: { borderRadius: spec.radius } } : {}),
    ...(spec.opacity !== undefined ? { opacity: spec.opacity } : {}),
  };
}

export function text(ctx: BuildContext, spec: TextSpec): TextLayer {
  const style: Record<string, unknown> = {
    fill: { color: { colorSpace: 'srgb', value: spec.color } },
    fontSize: spec.fontSize,
    fontWeight: spec.fontWeight ?? 400,
    fontFamily: spec.fontFamily ?? 'Inter',
    textAlign: spec.align ?? 'start',
  };
  if (spec.letterSpacing !== undefined) style.letterSpacing = spec.letterSpacing;
  if (spec.verticalCenter) style.verticalAlign = 'middle';
  return {
    id: ctx.id(),
    semanticId: ctx.semanticId(spec.semanticId),
    type: 'text',
    name: spec.semanticId,
    parentId: null,
    transform: { x: spec.x, y: spec.y, w: spec.w, h: spec.h, rotation: 0 },
    text: { content: spec.content },
    style,
    ...(spec.opacity !== undefined ? { opacity: spec.opacity } : {}),
  };
}

export function line(ctx: BuildContext, spec: LineSpec): VectorLayer {
  return {
    id: ctx.id(),
    semanticId: ctx.semanticId(spec.semanticId),
    type: 'vector',
    name: spec.semanticId,
    parentId: null,
    transform: { x: 0, y: 0, w: 0, h: 0, rotation: 0 },
    paths: [`M ${spec.x1} ${spec.y1} L ${spec.x2} ${spec.y2}`],
    stroke: { color: toRGBA(spec.stroke), width: spec.strokeWidth },
    ...(spec.dash !== undefined ? { style: { strokeDasharray: spec.dash } } : {}),
  };
}

export interface PolySpec {
  points: Array<{ x: number; y: number }>;
  stroke: string;
  strokeWidth: number;
  fill?: string | undefined;
  semanticId: string;
  closed?: boolean | undefined;
}

export function polyline(ctx: BuildContext, spec: PolySpec): VectorLayer {
  const d = spec.points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${round(p.x)} ${round(p.y)}`)
    .join(' ');
  const closed = spec.closed ? ' Z' : '';
  const layer: VectorLayer = {
    id: ctx.id(),
    semanticId: ctx.semanticId(spec.semanticId),
    type: 'vector',
    name: spec.semanticId,
    parentId: null,
    transform: { x: 0, y: 0, w: 0, h: 0, rotation: 0 },
    paths: [`${d}${closed}`],
    stroke: { color: toRGBA(spec.stroke), width: spec.strokeWidth },
  };
  if (spec.fill !== undefined) {
    layer.fill = { type: 'solid', color: toRGBA(spec.fill) };
  }
  return layer;
}

export function toRGBA(hex: string): { r: number; g: number; b: number; a: number } {
  let value = hex.trim();
  if (value.startsWith('#')) value = value.slice(1);
  if (value.length === 3) {
    value = value
      .split('')
      .map((c) => c + c)
      .join('');
  }
  const n = parseInt(value, 16);
  if (value.length === 8) {
    return { r: (n >> 24) & 0xff, g: (n >> 16) & 0xff, b: (n >> 8) & 0xff, a: (n & 0xff) / 255 };
  }
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff, a: 1 };
}

function toStyleFill(fill: FillSpec): { type: 'solid'; color: { r: number; g: number; b: number; a: number } } {
  if (typeof fill === 'string') return { type: 'solid', color: toRGBA(fill) };
  return { type: 'solid', color: fill };
}

/** Approximates the rendered width of a text run (used for auto-fit). */
export function estimateTextWidth(content: string, fontSize: number): number {
  // Inter-like average glyph advance ≈ 0.55em.
  return content.length * fontSize * 0.55;
}

/** Fits content into a width budget by trimming with an ellipsis. */
export function fitText(content: string, maxWidth: number, fontSize: number): string {
  if (estimateTextWidth(content, fontSize) <= maxWidth) return content;
  let out = content;
  while (out.length > 1 && estimateTextWidth(`${out}…`, fontSize) > maxWidth) {
    out = out.slice(0, -1);
  }
  return `${out}…`;
}

/** Clamps a number and rounds to a given precision. */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function round(value: number, precision = 1): number {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

export function asNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function asString(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}

export function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

export function asArray<T>(value: unknown, fallback: T[]): T[] {
  return Array.isArray(value) ? (value as T[]) : fallback;
}

/** Extracts the optional `accent` prop as a string (or undefined). */
export function accentOf(props: Record<string, unknown>): string | undefined {
  return typeof props.accent === 'string' ? props.accent : undefined;
}

/** Centers an element horizontally around cx within width w. */
export function centerX(x: number, w: number, contentWidth: number): number {
  return x + (w - contentWidth) / 2;
}
