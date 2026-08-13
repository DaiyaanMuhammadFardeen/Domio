/**
 * Visibility listener — pauses a TimelineRuntime when the document is
 * hidden (tab backgrounded, window minimized) and resumes on
 * visibility restore.
 *
 * Spec M6.2: "tab-backgrounded clock handled" — the wall-clock
 * counter must not advance while the tab is hidden. The runtime
 * accumulates `pausedTotalMs` across every visibility cycle.
 *
 * The listener is decoupled from `TimelineRuntime` so it can be
 * tested in isolation. The runtime exposes an `onVisibilityChange`
 * hook that the editor wires to this listener.
 */

export interface VisibilityLike {
  readonly hidden: boolean;
  addEventListener(type: 'visibilitychange', listener: () => void): void;
  removeEventListener(type: 'visibilitychange', listener: () => void): void;
}

export interface VisibilityListenerOptions {
  readonly document: VisibilityLike;
  readonly onChange: (visible: boolean) => void;
  /** Optional clock for tests. */
  readonly clock?: () => number;
}

export class VisibilityListener {
  private readonly doc: VisibilityLike;
  private readonly onChange: (visible: boolean) => void;
  private readonly clock: () => number;
  private lastChangeAt: number;
  private visible: boolean;
  private readonly handler: () => void;
  private attached = false;

  constructor(opts: VisibilityListenerOptions) {
    this.doc = opts.document;
    this.onChange = opts.onChange;
    this.clock = opts.clock ?? Date.now;
    this.lastChangeAt = this.clock();
    this.visible = !opts.document.hidden;
    this.handler = () => {
      const now = this.clock();
      const wasVisible = this.visible;
      const nowVisible = !this.doc.hidden;
      this.visible = nowVisible;
      if (wasVisible !== nowVisible) {
        this.onChange(nowVisible);
        this.lastChangeAt = now;
      }
    };
  }

  attach(): void {
    if (this.attached) return;
    this.doc.addEventListener('visibilitychange', this.handler);
    this.attached = true;
    // Emit initial state so the runtime can back-fill clocks.
    this.handler();
  }

  detach(): void {
    if (!this.attached) return;
    this.doc.removeEventListener('visibilitychange', this.handler);
    this.attached = false;
  }

  isAttached(): boolean {
    return this.attached;
  }

  isVisible(): boolean {
    return this.visible;
  }

  /** Last wall-clock tick at which a visibility change was observed. */
  lastChangeAtMs(): number {
    return this.lastChangeAt;
  }
}
