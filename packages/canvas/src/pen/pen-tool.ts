/**
 * Pen tool state machine — click adds anchor; double-click closes; Esc ends
 * an open path. See docs/development_phases/phase-03 §D.1.
 */

import type { NormalizedPointerEvent } from '../input/pointer.js';
import type { Anchor, VectorPath } from './path.js';
import { appendAnchor, breakHandle, closePath, emptyPath } from './path.js';

export interface PenToolState {
  path: VectorPath;
  isDrawing: boolean;
}

export function createPenTool(): PenToolState {
  return { path: emptyPath(), isDrawing: false };
}

export interface PenToolEvent {
  type: 'pointer' | 'double-click' | 'escape';
  pointer?: NormalizedPointerEvent;
}

export interface PenToolResult {
  state: PenToolState;
  /** True when the path was closed; the caller should commit it. */
  closed: boolean;
  /** True when the user pressed Escape and the path should be discarded. */
  cancelled: boolean;
}

export function feedPenTool(state: PenToolState, event: PenToolEvent): PenToolResult {
  if (event.type === 'escape') {
    return { state: { path: emptyPath(), isDrawing: false }, closed: false, cancelled: true };
  }
  if (event.type === 'double-click') {
    return { state: { path: closePath(state.path), isDrawing: false }, closed: true, cancelled: false };
  }
  if (event.type === 'pointer' && event.pointer) {
    const p = event.pointer;
    const anchor: Anchor = {
      x: p.x,
      y: p.y,
      inX: 0,
      inY: 0,
      outX: 0,
      outY: 0,
    };
    return {
      state: { path: appendAnchor(state.path, breakHandle(anchor, { alt: p.modifiers?.alt ?? false })), isDrawing: true },
      closed: false,
      cancelled: false,
    };
  }
  return { state, closed: false, cancelled: false };
}