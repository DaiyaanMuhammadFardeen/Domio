/**
 * Normalized SVG element model.
 *
 * All chart renderers emit SvgElement[] which can later plug into
 * the scene-graph renderer in @domio/components.
 */

import type { SvgElement, SvgElementKind } from '../types.js';

let _counter = 0;

/** Reset the internal counter (useful for deterministic tests). */
export function resetIdCounter(): void {
  _counter = 0;
}

/** Generate a unique element id. */
function nextId(): string {
  return `el-${++_counter}`;
}

export interface ElementSpec {
  kind: SvgElementKind;
  semanticId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fill?: string | undefined;
  stroke?: string | undefined;
  strokeWidth?: number | undefined;
  opacity?: number | undefined;
  text?: string | undefined;
  fontSize?: number | undefined;
  fontFamily?: string | undefined;
  fontWeight?: number | undefined;
  textAnchor?: 'start' | 'middle' | 'end' | undefined;
  visible?: boolean | undefined;
  points?: Array<{ x: number; y: number }> | undefined;
  d?: string | undefined;
  rx?: number | undefined;
  ry?: number | undefined;
  children?: SvgElement[] | undefined;
}

/** Create a normalized SVG element. */
export function createElement(spec: ElementSpec): SvgElement {
  const el: SvgElement = {
    id: nextId(),
    kind: spec.kind,
    semanticId: spec.semanticId,
    x: spec.x,
    y: spec.y,
    width: spec.width,
    height: spec.height,
  };
  if (spec.fill !== undefined) el.fill = spec.fill;
  if (spec.stroke !== undefined) el.stroke = spec.stroke;
  if (spec.strokeWidth !== undefined) el.strokeWidth = spec.strokeWidth;
  if (spec.opacity !== undefined) el.opacity = spec.opacity;
  if (spec.text !== undefined) el.text = spec.text;
  if (spec.fontSize !== undefined) el.fontSize = spec.fontSize;
  if (spec.fontFamily !== undefined) el.fontFamily = spec.fontFamily;
  if (spec.fontWeight !== undefined) el.fontWeight = spec.fontWeight;
  if (spec.textAnchor !== undefined) el.textAnchor = spec.textAnchor;
  if (spec.visible !== undefined) el.visible = spec.visible;
  if (spec.points !== undefined) el.points = spec.points;
  if (spec.d !== undefined) el.d = spec.d;
  if (spec.rx !== undefined) el.rx = spec.rx;
  if (spec.ry !== undefined) el.ry = spec.ry;
  if (spec.children !== undefined) el.children = spec.children;
  return el;
}

/** Create a rect element. */
export function rect(
  x: number,
  y: number,
  w: number,
  h: number,
  semanticId: string,
  opts: {
    fill?: string | undefined;
    stroke?: string | undefined;
    strokeWidth?: number | undefined;
    rx?: number | undefined;
    opacity?: number | undefined;
  } = {},
): SvgElement {
  return createElement({
    kind: 'rect',
    semanticId,
    x,
    y,
    width: w,
    height: h,
    fill: opts.fill,
    stroke: opts.stroke,
    strokeWidth: opts.strokeWidth,
    rx: opts.rx,
    opacity: opts.opacity,
  });
}

/** Create a text element. */
export function text(
  x: number,
  y: number,
  content: string,
  semanticId: string,
  opts: {
    width?: number | undefined;
    height?: number | undefined;
    fontSize?: number | undefined;
    fontFamily?: string | undefined;
    fontWeight?: number | undefined;
    fill?: string | undefined;
    textAnchor?: 'start' | 'middle' | 'end' | undefined;
  } = {},
): SvgElement {
  return createElement({
    kind: 'text',
    semanticId,
    x,
    y,
    width: opts.width ?? 0,
    height: opts.height ?? 0,
    text: content,
    fontSize: opts.fontSize,
    fontFamily: opts.fontFamily,
    fontWeight: opts.fontWeight,
    fill: opts.fill,
    textAnchor: opts.textAnchor,
  });
}

/** Create a line element. */
export function line(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  semanticId: string,
  opts: { stroke?: string | undefined; strokeWidth?: number | undefined } = {},
): SvgElement {
  return createElement({
    kind: 'line',
    semanticId,
    x: x1,
    y: y1,
    width: x2 - x1,
    height: y2 - y1,
    stroke: opts.stroke,
    strokeWidth: opts.strokeWidth,
  });
}

/** Create a polyline element. */
export function polyline(
  points: Array<{ x: number; y: number }>,
  semanticId: string,
  opts: {
    stroke?: string | undefined;
    strokeWidth?: number | undefined;
    fill?: string | undefined;
  } = {},
): SvgElement {
  return createElement({
    kind: 'polyline',
    semanticId,
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    points,
    stroke: opts.stroke,
    strokeWidth: opts.strokeWidth,
    fill: opts.fill,
  });
}

/** Create a group element. */
export function group(
  semanticId: string,
  children: SvgElement[],
  opts: { x?: number | undefined; y?: number | undefined; opacity?: number | undefined } = {},
): SvgElement {
  return createElement({
    kind: 'group',
    semanticId,
    x: opts.x ?? 0,
    y: opts.y ?? 0,
    width: 0,
    height: 0,
    opacity: opts.opacity,
    children,
  });
}
