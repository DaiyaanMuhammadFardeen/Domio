/**
 * OverlayStack — manages an ordered list of open overlays with:
 *   - max_depth = 5 (6th open rejected)
 *   - last-opened-on-top z-order
 *   - focus trap helpers for accessibility
 *
 * Spec §M1.2 / §7.6.1: nested modals stack correctly, focus is returned
 * to the invoker when the topmost closes.
 */

import type { Overlay } from '../types.js';

export const OVERLAY_MAX_DEPTH = 5;

export class OverlayStackFullError extends Error {
  constructor() {
    super(`Overlay stack reached maximum depth of ${OVERLAY_MAX_DEPTH}`);
    this.name = 'OverlayStackFullError';
  }
}

export class OverlayNotOpenError extends Error {
  constructor(id: string) {
    super(`Overlay '${id}' is not open`);
    this.name = 'OverlayNotOpenError';
  }
}

export class OverlayStack {
  /** open overlays, oldest first; last element is the topmost. */
  private open: Overlay[] = [];
  private invokers: (string | null)[] = [];

  openOverlay(o: Overlay, invokerId: string | null = null): void {
    if (this.open.some((existing) => existing.id === o.id)) return; // idempotent
    if (this.open.length >= OVERLAY_MAX_DEPTH) throw new OverlayStackFullError();
    this.open.push(o);
    this.invokers.push(invokerId);
  }

  /** Close the topmost overlay and return its invoker id for focus restoration. */
  closeTopmost(): { overlay: Overlay; invokerId: string | null } | null {
    const overlay = this.open.pop();
    if (!overlay) return null;
    const invokerId = this.invokers.pop() ?? null;
    return { overlay, invokerId };
  }

  closeById(id: string): { overlay: Overlay; invokerId: string | null } | null {
    const idx = this.open.findIndex((o) => o.id === id);
    if (idx < 0) throw new OverlayNotOpenError(id);
    const overlay = this.open[idx]!;
    const invokerId = this.invokers[idx] ?? null;
    this.open.splice(idx, 1);
    this.invokers.splice(idx, 1);
    return { overlay, invokerId };
  }

  topmost(): Overlay | null {
    return this.open[this.open.length - 1] ?? null;
  }

  isOpen(id: string): boolean {
    return this.open.some((o) => o.id === id);
  }

  size(): number {
    return this.open.length;
  }

  snapshot(): readonly Overlay[] {
    return [...this.open];
  }

  clear(): void {
    this.open = [];
    this.invokers = [];
  }
}