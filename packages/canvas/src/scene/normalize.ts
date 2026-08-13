/**
 * Scene graph → render command list normalizer.
 *
 * Pure transform: takes the scene graph and the layout-emitted transforms
 * and emits a `RenderCommandList` for the renderer. No mutation of the
 * graph; no scene-graph state reads outside what's already on the nodes.
 */

import type { Color, DeckDocument, Element } from '@domio/schema';
import type {
  DrawImageCommand,
  DrawPathCommand,
  DrawRectCommand,
  DrawTextCommand,
  RenderCommand,
  RenderCommandList,
} from '../renderer/commands.js';
import type { SceneGraph } from './scene-graph.js';
import { expandComponent } from '@domio/components';

export interface NormalizeOptions {
  /** Excludes hidden layers from the emitted command list. */
  skipHidden?: boolean;
}

export function normalize(
  doc: DeckDocument,
  graph: SceneGraph,
  options: NormalizeOptions = {},
): RenderCommandList {
  const commands: RenderCommand[] = [];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const slide of doc.slides) {
    const slideCommands: RenderCommand[] = [];
    for (const element of slide.elements) {
      if (options.skipHidden && element.hidden) continue;
      const cmd = elementToCommand(element);
      if (!cmd) continue;
      slideCommands.push(cmd);
      const node = graph.byId(element.id);
      if (node) {
        const b = node.bounds;
        if (b.x < minX) minX = b.x;
        if (b.y < minY) minY = b.y;
        if (b.x + b.w > maxX) maxX = b.x + b.w;
        if (b.y + b.h > maxY) maxY = b.y + b.h;
      }
    }
    commands.push({
      kind: 'drawGroup',
      id: slide.id,
      children: slideCommands,
    });
  }
  if (!Number.isFinite(minX)) {
    minX = 0;
    minY = 0;
    maxX = 0;
    maxY = 0;
  }
  return {
    commands,
    bounds: { x: minX, y: minY, w: maxX - minX, h: maxY - minY },
  };
}

export function elementToCommand(element: Element): RenderCommand | null {
  switch (element.type) {
    case 'frame':
      return rectFor(element, { strokeWidth: 1 });
    case 'autoLayout':
      return rectFor(element, { strokeWidth: 1 });
    case 'group':
      return null;
    case 'text':
      return textFor(element);
    case 'image':
      return imageFor(element);
    case 'vector':
      return pathFor(element);
    case 'boolean':
      return null;
    case 'component': {
      // Component layers expand (deterministically) into their scene-graph
      // children via the shared @domio/components pack, then normalize each.
      const children = expandComponent(element)
        .map(elementToCommand)
        .filter((c): c is RenderCommand => c !== null);
      return {
        kind: 'drawGroup',
        id: element.id,
        children,
      };
    }
    // Phase 11 rich-media kinds render through their own viewports/players
    // (WebGL viewport, video/audio element, iframe, code block, KaTeX,
    // map canvas), not the 2D normalizer — no render command here.
    case 'model3d':
    case 'video':
    case 'audio':
    case 'lottie':
    case 'embed':
    case 'codeBlock':
    case 'latex':
    case 'map':
      return null;
  }
}

function rectFor(
  element: Element,
  opts: { fillColor?: string; strokeWidth?: number },
): DrawRectCommand | null {
  const t = element.transform;
  if (!t) return null;
  const cmd: DrawRectCommand = {
    kind: 'drawRect',
    id: element.id,
    x: t.x,
    y: t.y,
    w: t.w,
    h: t.h,
  };
  // Component builders paint fills/strokes on frame layers directly.
  if (element.type === 'frame' && element.fill?.color) {
    cmd.fill = rgbaToColor(element.fill.color);
  } else if (opts.fillColor) {
    cmd.fill = { colorSpace: 'srgb', value: opts.fillColor };
  }
  const strokeWidth =
    element.type === 'frame' && element.stroke?.width != null
      ? element.stroke.width
      : opts.strokeWidth;
  if (strokeWidth) {
    const strokeColor =
      element.type === 'frame' && element.stroke?.color
        ? rgbaToColor(element.stroke.color)
        : { colorSpace: 'srgb' as const, value: '#60A5FA' };
    cmd.stroke = { color: strokeColor, width: strokeWidth };
  }
  return cmd;
}

function textFor(element: Element & { type: 'text' }): DrawTextCommand | null {
  const t = element.transform;
  if (!t) return null;
  const runs = element.text.runs ?? [];
  const firstRun = runs[0];
  const fillColor = readColor(element.style?.fill);
  const cmd: DrawTextCommand = {
    kind: 'drawText',
    id: element.id,
    x: t.x,
    y: t.y,
    w: t.w,
    h: t.h,
    content: element.text.content,
    fontFamily: (firstRun?.style?.fontFamily as string | undefined) ?? 'Inter',
    fontSize: (firstRun?.style?.fontSize as number | undefined) ?? 32,
    fontWeight: (firstRun?.style?.fontWeight as number | undefined) ?? 400,
  };
  if (fillColor) {
    cmd.fill = fillColor;
  }
  return cmd;
}

function imageFor(element: Element & { type: 'image' }): DrawImageCommand | null {
  const t = element.transform;
  if (!t) return null;
  const cmd: DrawImageCommand = {
    kind: 'drawImage',
    id: element.id,
    x: t.x,
    y: t.y,
    w: t.w,
    h: t.h,
    assetId: element.assetId,
  };
  if (element.fit) cmd.fit = element.fit;
  if (element.alt) cmd.alt = element.alt;
  return cmd;
}

function pathFor(element: Element & { type: 'vector' }): DrawPathCommand | null {
  const t = element.transform;
  if (!t) return null;
  const d = element.paths.join(' ');
  const cmd: DrawPathCommand = {
    kind: 'drawPath',
    id: element.id,
    d,
  };
  if (element.fill?.color) cmd.fill = rgbaToColor(element.fill.color);
  if (element.stroke) {
    cmd.stroke = { color: rgbaToColor(element.stroke.color), width: element.stroke.width ?? 1 };
  }
  return cmd;
}

function rgbaToColor(c: { r: number; g: number; b: number; a: number }): Color {
  const r = Math.round(c.r);
  const g = Math.round(c.g);
  const b = Math.round(c.b);
  const a = Math.round(c.a * 255);
  return {
    colorSpace: 'srgb',
    value: `rgba(${r}, ${g}, ${b}, ${a})`,
  };
}

function readColor(
  styleValue: unknown,
): { colorSpace: 'srgb' | 'display-p3'; value: string } | undefined {
  if (!styleValue || typeof styleValue !== 'object') return undefined;
  const candidate = styleValue as { color?: { colorSpace?: string; value?: string } };
  if (candidate.color?.value) {
    return {
      colorSpace: candidate.color.colorSpace === 'display-p3' ? 'display-p3' : 'srgb',
      value: candidate.color.value,
    };
  }
  return undefined;
}
