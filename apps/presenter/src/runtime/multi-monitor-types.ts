/**
 * Browser Presentation-API type shims for the multi-monitor selector.
 *
 * Per Wave 4 §S4.1 of docs/frontend-roadmap/04-wave-presenter-live.md.
 *
 * The real Presentation API is still vendor-prefixed and partially
 * shipped (Chrome). When unsupported, the multi-monitor selector
 * falls back to `window.open('…', 'domio-audience', …)`. These shims
 * keep the types stable across both branches.
 */

export interface PresentationRequest extends EventTarget {
  readonly urls: ReadonlyArray<string>;
  getViewer(): Promise<Presentation | null>;
}

export interface Presentation extends EventTarget {
  readonly id: string;
  readonly url: string;
}

export interface PresentationAvailability extends EventTarget {
  readonly value: boolean;
}
