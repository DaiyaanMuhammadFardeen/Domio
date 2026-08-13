/**
 * Render passes — ordered over the render command list. Three passes for the
 * MVP: opaque, text, overlay (guides, selection, frame outlines).
 */

import type { RenderCommand, RenderCommandList } from './commands.js';

export type RenderPassName = 'opaque' | 'text' | 'overlay';

export interface RenderPass {
  name: RenderPassName;
  execute(commands: RenderCommandList): RenderCommand[];
}

export class OpaquePass implements RenderPass {
  name: RenderPassName = 'opaque';
  execute(commands: RenderCommandList): RenderCommand[] {
    return commands.commands.filter(isOpaque);
  }
}

export class TextPass implements RenderPass {
  name: RenderPassName = 'text';
  execute(commands: RenderCommandList): RenderCommand[] {
    return commands.commands.filter((cmd) => cmd.kind === 'drawText');
  }
}

export class OverlayPass implements RenderPass {
  name: RenderPassName = 'overlay';
  execute(commands: RenderCommandList): RenderCommand[] {
    return commands.commands.filter((cmd) => isOverlay(cmd));
  }
}

function isOpaque(cmd: RenderCommand): boolean {
  if (cmd.kind === 'clip' || cmd.kind === 'transform') return false;
  if (cmd.kind === 'drawGroup') {
    return cmd.children.some((child) => isOpaque(child));
  }
  if (cmd.kind === 'drawText') return false;
  if (cmd.kind === 'drawRect' && !cmd.stroke) return true;
  if (cmd.kind === 'drawPath' && (cmd.fill || cmd.stroke)) return true;
  if (cmd.kind === 'drawImage') return true;
  return false;
}

function isOverlay(cmd: RenderCommand): boolean {
  if (cmd.kind === 'drawRect' && cmd.stroke && !cmd.fill) return true;
  return false;
}

export function buildPasses(): RenderPass[] {
  return [new OpaquePass(), new TextPass(), new OverlayPass()];
}
