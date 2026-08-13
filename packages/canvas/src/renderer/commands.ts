/**
 * Render command list — typed zero-copy draw commands emitted by the scene
 * graph, consumed by the renderer passes. See docs/development_phases/phase-03
 * §B.2: RenderCommand is typed (drawRect, drawText, drawPath, drawImage,
 * drawGroup, clip, transform).
 */

import type { Color, ULID } from '@domio/schema';

export type RenderCommand =
  | DrawRectCommand
  | DrawTextCommand
  | DrawPathCommand
  | DrawImageCommand
  | DrawGroupCommand
  | ClipCommand
  | TransformCommand;

export interface DrawRectCommand {
  kind: 'drawRect';
  id?: ULID;
  x: number;
  y: number;
  w: number;
  h: number;
  fill?: Color;
  stroke?: { color: Color; width: number };
  radius?: number;
}

export interface DrawTextCommand {
  kind: 'drawText';
  id?: ULID;
  x: number;
  y: number;
  w: number;
  h: number;
  content: string;
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: number;
  fill?: Color;
  align?: 'left' | 'center' | 'right';
}

export interface DrawPathCommand {
  kind: 'drawPath';
  id?: ULID;
  d: string;
  fill?: Color;
  fillRule?: 'evenodd' | 'nonzero';
  stroke?: { color: Color; width: number };
}

export interface DrawImageCommand {
  kind: 'drawImage';
  id?: ULID;
  x: number;
  y: number;
  w: number;
  h: number;
  assetId: string;
  fit?: 'cover' | 'contain' | 'fill';
  alt?: string;
}

export interface DrawGroupCommand {
  kind: 'drawGroup';
  id?: ULID;
  children: RenderCommand[];
}

export interface ClipCommand {
  kind: 'clip';
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface TransformCommand {
  kind: 'transform';
  translate?: { x: number; y: number };
  rotate?: number;
  scale?: number;
}

export interface RenderCommandList {
  commands: RenderCommand[];
  bounds: { x: number; y: number; w: number; h: number };
}

export function emptyCommandList(): RenderCommandList {
  return { commands: [], bounds: { x: 0, y: 0, w: 0, h: 0 } };
}

export function flatten(commands: RenderCommand[], out: RenderCommand[] = []): RenderCommand[] {
  for (const cmd of commands) {
    out.push(cmd);
    if (cmd.kind === 'drawGroup') {
      flatten(cmd.children, out);
    }
  }
  return out;
}

export function countPrimitives(commands: RenderCommand[]): number {
  let count = 0;
  for (const cmd of commands) {
    switch (cmd.kind) {
      case 'drawRect':
      case 'drawText':
      case 'drawPath':
      case 'drawImage':
        count += 1;
        break;
      case 'drawGroup':
        count += countPrimitives(cmd.children);
        break;
      case 'clip':
      case 'transform':
        break;
    }
  }
  return count;
}
