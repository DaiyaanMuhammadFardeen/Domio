/**
 * @domio/animation-runtime — Scroll-linked animation bindings.
 *
 * Binds a property to scroll progress with interpolation.
 * Passive 60 Hz model (the actual listener is an adapter).
 */

import { interpolate } from './interpolate.js';

const MAX_SCROLL_LINKED = 32;

export interface ScrollLinkedBinding {
  readonly id: string;
  readonly elementId: string;
  readonly property: string;
  /** The scroll progress range [0, 1] mapped to this binding. */
  readonly progressRange: readonly [number, number];
  /** The output value range. */
  readonly valueRange: readonly [number | string, number | string];
}

type ScrollLinkedWarning =
  | { type: 'overflow'; count: number; cap: number }
  | { type: 'dependency_cycle'; bindingId: string; dependsOn: string };

type ScrollLinkedListener = (warning: ScrollLinkedWarning) => void;

export class ScrollLinked {
  private bindings = new Map<string, ScrollLinkedBinding>();
  private listeners = new Set<ScrollLinkedListener>();
  private progress = 0;

  /** Add a scroll-linked binding. Returns false if rejected. */
  add(binding: ScrollLinkedBinding): boolean {
    // Check dependency: reject if this binding depends on another scroll-linked
    // (We check elementId — a binding on the same element is a dependency)
    for (const [, existing] of this.bindings) {
      if (
        existing.elementId === binding.elementId &&
        existing.property !== binding.property
      ) {
        // Potential cross-property dependency on same element
        // We only reject explicit cycles (same element + different property)
        // For now, we allow same-element different-property
      }
    }

    // Check cap
    if (this.bindings.size >= MAX_SCROLL_LINKED) {
      this.emit({
        type: 'overflow',
        count: this.bindings.size,
        cap: MAX_SCROLL_LINKED,
      });
      return false;
    }

    // Reject scroll-linked that depends on another scroll-linked
    // by checking if any existing binding targets the same elementId
    // AND the new binding's property references the existing binding
    for (const [, existing] of this.bindings) {
      if (existing.elementId === binding.elementId) {
        // Same element — potential cycle
        // We treat same-element scroll-linked bindings as a dependency
        this.emit({
          type: 'dependency_cycle',
          bindingId: binding.id,
          dependsOn: existing.id,
        });
        return false;
      }
    }

    this.bindings.set(binding.id, binding);
    return true;
  }

  /** Remove a binding. */
  remove(id: string): void {
    this.bindings.delete(id);
  }

  /** Set the global scroll progress (0-1). Interpolates all bindings. */
  setProgress(p: number): Map<string, number | string> {
    this.progress = Math.max(0, Math.min(1, p));
    const results = new Map<string, number | string>();

    for (const [, binding] of this.bindings) {
      const [progressMin, progressMax] = binding.progressRange;
      const t = progressMax === progressMin
        ? 0
        : Math.max(0, Math.min(1, (this.progress - progressMin) / (progressMax - progressMin)));
      const [valA, valB] = binding.valueRange;
      results.set(`${binding.elementId}:${binding.property}`, interpolate(valA, valB, t));
    }

    return results;
  }

  /** Get current binding count. */
  get count(): number {
    return this.bindings.size;
  }

  /** Subscribe to warnings. */
  subscribe(listener: ScrollLinkedListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(warning: ScrollLinkedWarning): void {
    for (const listener of this.listeners) {
      listener(warning);
    }
  }
}
