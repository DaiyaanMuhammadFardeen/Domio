/**
 * Pointer arbitration — single-pointer ownership, multi-touch routing,
 * gesture detection. Emits semantic `Intent`s only; never touches the
 * scene graph directly (per docs/editor-canvas.md §4.2).
 *
 * Pure functions over a normalized `PointerEvent` so the test suite can
 * exercise the state machine without DOM events.
 */

export type PointerKind = 'down' | 'move' | 'up' | 'wheel' | 'pinch';

export interface NormalizedPointerEvent {
  kind: PointerKind;
  pointerId: number;
  x: number;
  y: number;
  /** Time of the event in ms. */
  timestamp: number;
  /** Wheel delta (kind === 'wheel'). */
  wheelDelta?: { dx: number; dy: number };
  /** Pinch scale (kind === 'pinch'). */
  pinchScale?: number;
  /** Held modifiers. */
  modifiers?: PointerModifiers;
  /** Active pointer count at the time of the event. */
  activePointers?: number;
}

export interface PointerModifiers {
  shift?: boolean;
  alt?: boolean;
  ctrl?: boolean;
  meta?: boolean;
}

export type Intent =
  | { kind: 'beginDrag'; targetId: string | null; x: number; y: number; modifiers: PointerModifiers }
  | { kind: 'updateDrag'; x: number; y: number; delta: { dx: number; dy: number }; modifiers: PointerModifiers }
  | { kind: 'endDrag'; x: number; y: number }
  | { kind: 'beginMarquee'; x: number; y: number; modifiers: PointerModifiers }
  | { kind: 'updateMarquee'; x: number; y: number }
  | { kind: 'endMarquee'; x: number; y: number }
  | { kind: 'beginPinch'; scale: number; center: { x: number; y: number } }
  | { kind: 'updatePinch'; scale: number; center: { x: number; y: number } }
  | { kind: 'endPinch' }
  | { kind: 'beginTextEdit'; targetId: string }
  | { kind: 'commitOp' }
  | { kind: 'cancel' };

export interface PointerState {
  pointerId: number | null;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  dragStartTime: number;
  pointerDownTimestamp: number;
  activePointers: number;
  mode: 'idle' | 'drag' | 'marquee' | 'pinch';
  targetId: string | null;
}

export const DRAG_PIXEL_THRESHOLD = 4;
export const LONG_PRESS_MS = 500;

export function createPointerState(): PointerState {
  return {
    pointerId: null,
    startX: 0,
    startY: 0,
    lastX: 0,
    lastY: 0,
    dragStartTime: 0,
    pointerDownTimestamp: 0,
    activePointers: 0,
    mode: 'idle',
    targetId: null,
  };
}

export interface PointerRouterOptions {
  /** Returns the element id under the world point, or null if empty. */
  hitTest: (x: number, y: number) => string | null;
  /** Returns true while text-input focus is active. */
  isTextEditing?: () => boolean;
  /** Long-press timeout. */
  longPressMs?: number;
}

export class PointerRouter {
  private readonly state: PointerState = createPointerState();

  constructor(private readonly options: PointerRouterOptions) {}

  feed(event: NormalizedPointerEvent): Intent[] {
    if (event.kind === 'pinch') {
      if (this.state.mode === 'pinch') {
        return [{ kind: 'updatePinch', scale: event.pinchScale ?? 1, center: { x: event.x, y: event.y } }];
      }
      this.state.mode = 'pinch';
      return [{ kind: 'beginPinch', scale: event.pinchScale ?? 1, center: { x: event.x, y: event.y } }];
    }
    if (event.kind === 'down') {
      return this.onDown(event);
    }
    if (event.kind === 'move') {
      return this.onMove(event);
    }
    if (event.kind === 'up') {
      return this.onUp(event);
    }
    if (event.kind === 'wheel') {
      return this.onWheel(event);
    }
    return [];
  }

  snapshot(): PointerState {
    return { ...this.state };
  }

  private onDown(event: NormalizedPointerEvent): Intent[] {
    this.state.pointerId = event.pointerId;
    this.state.startX = event.x;
    this.state.startY = event.y;
    this.state.lastX = event.x;
    this.state.lastY = event.y;
    this.state.pointerDownTimestamp = event.timestamp;
    this.state.activePointers = event.activePointers ?? 1;
    const targetId = this.options.hitTest(event.x, event.y);
    this.state.targetId = targetId;
    if (targetId && this.options.isTextEditing?.()) {
      return [{ kind: 'beginTextEdit', targetId }];
    }
    return [];
  }

  private onMove(event: NormalizedPointerEvent): Intent[] {
    if (this.state.pointerId !== null && this.state.pointerId !== event.pointerId) return [];
    const dx = event.x - this.state.lastX;
    const dy = event.y - this.state.lastY;
    this.state.lastX = event.x;
    this.state.lastY = event.y;
    if (this.state.mode === 'idle') {
      const dragDist = Math.hypot(event.x - this.state.startX, event.y - this.state.startY);
      if (dragDist >= DRAG_PIXEL_THRESHOLD) {
        const modifiers = event.modifiers ?? {};
        if (this.state.targetId) {
          this.state.mode = 'drag';
          this.state.dragStartTime = event.timestamp;
          return [{ kind: 'beginDrag', targetId: this.state.targetId, x: event.x, y: event.y, modifiers }];
        }
        this.state.mode = 'marquee';
        return [{ kind: 'beginMarquee', x: event.x, y: event.y, modifiers }];
      }
      return [];
    }
    if (this.state.mode === 'drag') {
      return [{
        kind: 'updateDrag',
        x: event.x,
        y: event.y,
        delta: { dx, dy },
        modifiers: event.modifiers ?? {},
      }];
    }
    if (this.state.mode === 'marquee') {
      return [{ kind: 'updateMarquee', x: event.x, y: event.y }];
    }
    return [];
  }

  private onUp(event: NormalizedPointerEvent): Intent[] {
    if (this.state.pointerId !== event.pointerId) return [];
    const endedMode = this.state.mode;
    this.state.pointerId = null;
    this.state.activePointers = Math.max(0, (event.activePointers ?? 1) - 1);
    if (endedMode === 'drag') {
      this.state.mode = 'idle';
      return [{ kind: 'endDrag', x: event.x, y: event.y }, { kind: 'commitOp' }];
    }
    if (endedMode === 'marquee') {
      this.state.mode = 'idle';
      return [{ kind: 'endMarquee', x: event.x, y: event.y }];
    }
    if (endedMode === 'pinch') {
      this.state.mode = 'idle';
      return [{ kind: 'endPinch' }];
    }
    return [];
  }

  private onWheel(event: NormalizedPointerEvent): Intent[] {
    if (!event.wheelDelta) return [];
    // Wheel events are escalated to the camera module via a separate path;
    // the router translates them to "beginDrag" with no target so the editor
    // can pan via Shift+Wheel without a hit.
    return [{
      kind: 'beginDrag',
      targetId: null,
      x: event.x,
      y: event.y,
      modifiers: { ...(event.modifiers ?? {}), shift: event.modifiers?.shift ?? true },
    }];
  }
}

/**
 * Pointer-down to first frame budget. Pure helper so tests can verify the
 * router's *intent emission latency* (when running with a stub `feed`).
 */
export function measureFirstFrameLatency(
  start: () => number,
  end: () => number,
): number {
  return end() - start();
}