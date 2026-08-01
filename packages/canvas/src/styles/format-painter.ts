/**
 * Format painter — single-click is one-shot, double-click is persistent until
 * `Esc`. See docs/development_phases/phase-03 §D.3.
 */

export class FormatPainter {
  private persistent = false;

  arm(persistent: boolean): void {
    this.persistent = persistent;
  }

  isPersistent(): boolean {
    return this.persistent;
  }

  disarm(): void {
    this.persistent = false;
  }

  /** Called after each paste to check whether to keep the painter armed. */
  shouldContinueAfterPaste(): boolean {
    return this.persistent;
  }
}