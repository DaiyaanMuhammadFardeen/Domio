/**
 * Canvas2D fallback renderer. Implements the Renderer interface using
 * 2D context drawing so editing works in environments where WebGL2/WebGPU
 * are unavailable (e.g. headless CI, locked-down browsers). Always available
 * — see docs/development_phases/phase-03 §B.1.
 *
 * The fallback does not aim for 60 FPS; it aims for *correctness* so the
 * editor still functions when the GPU stack is missing.
 */

import type { RenderCommand, RenderCommandList } from './commands.js';
import type { CameraState, ViewportSize } from './camera.js';
import { worldToScreen } from './camera.js';

export interface Renderer {
  init(canvas: HTMLCanvasElement, scene: RenderCommandList): void;
  draw(scene: RenderCommandList, camera: CameraState, viewport: ViewportSize): void;
  setCamera(camera: CameraState): void;
  setViewport(viewport: ViewportSize): void;
  dispose(): void;
}

export class Canvas2DRenderer implements Renderer {
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;

  init(canvas: HTMLCanvasElement, _scene: RenderCommandList): void {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas2D context not available.');
    this.ctx = ctx;
  }

  setCamera(_camera: CameraState): void {
    // No state retained; the renderer uses the camera passed per draw call.
  }

  setViewport(viewport: ViewportSize): void {
    if (this.canvas) {
      this.canvas.width = Math.max(1, Math.floor(viewport.width));
      this.canvas.height = Math.max(1, Math.floor(viewport.height));
    }
  }

  draw(scene: RenderCommandList, camera: CameraState, viewport: ViewportSize): void {
    this.setViewport(viewport);
    const ctx = this.ctx;
    if (!ctx) return;
    ctx.save();
    ctx.fillStyle = '#0a0e14';
    ctx.fillRect(0, 0, viewport.width, viewport.height);
    for (const cmd of scene.commands) {
      this.drawCommand(ctx, cmd, camera, viewport);
    }
    ctx.restore();
  }

  dispose(): void {
    this.canvas = null;
    this.ctx = null;
  }

  private drawCommand(
    ctx: CanvasRenderingContext2D,
    cmd: RenderCommand,
    camera: CameraState,
    viewport: ViewportSize,
  ): void {
    switch (cmd.kind) {
      case 'drawRect':
        this.drawRect(ctx, cmd, camera, viewport);
        return;
      case 'drawText':
        this.drawText(ctx, cmd, camera, viewport);
        return;
      case 'drawPath':
        this.drawPath(ctx, cmd, camera, viewport);
        return;
      case 'drawImage':
        // Asset fetch is out of scope for the canvas fallback — render a
        // placeholder rectangle so editing still functions.
        this.drawImagePlaceholder(ctx, cmd, camera, viewport);
        return;
      case 'drawGroup':
        for (const child of cmd.children) {
          this.drawCommand(ctx, child, camera, viewport);
        }
        return;
      case 'clip': {
        ctx.save();
        ctx.beginPath();
        const c1 = worldToScreen(camera, { x: cmd.x, y: cmd.y }, viewport);
        const c2 = worldToScreen(camera, { x: cmd.x + cmd.w, y: cmd.y + cmd.h }, viewport);
        ctx.rect(c1.x, c1.y, c2.x - c1.x, c2.y - c1.y);
        ctx.clip();
        ctx.restore();
        return;
      }
      case 'transform':
        ctx.save();
        if (cmd.translate) {
          const t = worldToScreen(
            camera,
            { x: cmd.translate.x, y: cmd.translate.y },
            viewport,
          );
          ctx.translate(t.x - viewport.width / 2, t.y - viewport.height / 2);
        }
        if (cmd.rotate) ctx.rotate(cmd.rotate);
        if (cmd.scale) ctx.scale(cmd.scale, cmd.scale);
        return;
    }
  }

  private drawRect(
    ctx: CanvasRenderingContext2D,
    cmd: Extract<RenderCommand, { kind: 'drawRect' }>,
    camera: CameraState,
    viewport: ViewportSize,
  ): void {
    const tl = worldToScreen(camera, { x: cmd.x, y: cmd.y }, viewport);
    const br = worldToScreen(camera, { x: cmd.x + cmd.w, y: cmd.y + cmd.h }, viewport);
    if (cmd.fill) {
      ctx.fillStyle = cmd.fill.value;
      ctx.fillRect(tl.x, tl.y, br.x - tl.x, br.y - tl.y);
    }
    if (cmd.stroke) {
      ctx.strokeStyle = cmd.stroke.color.value;
      ctx.lineWidth = cmd.stroke.width * camera.zoom;
      ctx.strokeRect(tl.x, tl.y, br.x - tl.x, br.y - tl.y);
    }
  }

  private drawText(
    ctx: CanvasRenderingContext2D,
    cmd: Extract<RenderCommand, { kind: 'drawText' }>,
    camera: CameraState,
    viewport: ViewportSize,
  ): void {
    const tl = worldToScreen(camera, { x: cmd.x, y: cmd.y }, viewport);
    const fontSize = (cmd.fontSize ?? 16) * camera.zoom;
    ctx.font = `${cmd.fontWeight ?? 400} ${fontSize}px ${cmd.fontFamily ?? 'sans-serif'}`;
    ctx.fillStyle = cmd.fill?.value ?? '#e6edf3';
    ctx.textBaseline = 'top';
    ctx.fillText(cmd.content, tl.x, tl.y);
  }

  private drawPath(
    ctx: CanvasRenderingContext2D,
    cmd: Extract<RenderCommand, { kind: 'drawPath' }>,
    camera: CameraState,
    _viewport: ViewportSize,
  ): void {
    const path = new Path2D(cmd.d);
    if (cmd.fill) {
      ctx.fillStyle = cmd.fill.value;
      ctx.fill(path);
    }
    if (cmd.stroke) {
      ctx.strokeStyle = cmd.stroke.color.value;
      ctx.lineWidth = cmd.stroke.width * camera.zoom;
      ctx.stroke(path);
    }
  }

  private drawImagePlaceholder(
    ctx: CanvasRenderingContext2D,
    cmd: Extract<RenderCommand, { kind: 'drawImage' }>,
    camera: CameraState,
    _viewport: ViewportSize,
  ): void {
    const tl = worldToScreen(camera, { x: cmd.x, y: cmd.y }, _viewport);
    const br = worldToScreen(camera, { x: cmd.x + cmd.w, y: cmd.y + cmd.h }, _viewport);
    ctx.fillStyle = '#1f2937';
    ctx.fillRect(tl.x, tl.y, br.x - tl.x, br.y - tl.y);
    ctx.strokeStyle = '#374151';
    ctx.strokeRect(tl.x, tl.y, br.x - tl.x, br.y - tl.y);
  }
}