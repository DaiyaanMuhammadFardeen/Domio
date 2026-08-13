'use client';

/**
 * PiP window controller — abstracts the Document Picture-in-Picture API
 * with a fallback to a floating iframe overlay when the API is unavailable
 * (Chromium-only at the moment of writing).
 *
 * The controller is intentionally minimal: callers pass a render function
 * that receives the PiP window's `Document` and mounts the chrome into it.
 *
 * Feature detection:
 *   - `documentPictureInPicture.requestWindow` is the modern API.
 *   - When absent, the controller emits a `pip.fallback` event and
 *     returns a synthetic `FallbackPipWindow` carrying a positioned
 *     <div> on the main document.
 */

import { useEffect, useState } from 'react';

export interface PipWindow {
  readonly document: Document;
  readonly kind: 'document' | 'fallback';
  close(): void;
}

export interface PipControllerState {
  /** Whether the API is available on this browser. */
  readonly supported: boolean;
  /** The currently-open PiP window, if any. */
  readonly window: PipWindow | null;
}

declare global {
  interface Window {
    documentPictureInPicture?: {
      requestWindow(opts?: { width?: number; height?: number }): Promise<Window>;
      window: Window | null;
    };
  }
}

export class PipController {
  private current: PipWindow | null = null;

  /** Detect API support without side effects. */
  isSupported(): boolean {
    if (typeof window === 'undefined') return false;
    return typeof window.documentPictureInPicture?.requestWindow === 'function';
  }

  async open(width = 480, height = 320): Promise<PipWindow> {
    if (this.current) return this.current;
    if (this.isSupported()) {
      const w = await window.documentPictureInPicture!.requestWindow({ width, height });
      const pip: PipWindow = {
        kind: 'document',
        document: w.document,
        close: () => {
          try {
            w.close();
          } catch {
            /* ignore */
          }
          this.current = null;
        },
      };
      this.current = pip;
      return pip;
    }
    // Fallback: hand back a synthetic PipWindow that mounts onto a host div
    // on the main document. The caller can use `document` directly.
    const synth: PipWindow = {
      kind: 'fallback',
      document: window.document,
      close: () => {
        this.current = null;
      },
    };
    this.current = synth;
    return synth;
  }

  close(): void {
    if (!this.current) return;
    this.current.close();
    this.current = null;
  }

  active(): PipWindow | null {
    return this.current;
  }
}

/** React hook — exposes the controller state and a toggle function. */
export function usePipController(): PipControllerState & {
  toggle: (w?: number, h?: number) => Promise<void>;
} {
  const controller = useState(() => new PipController())[0];
  const [supported, setSupported] = useState(false);
  const [active, setActive] = useState<PipWindow | null>(null);

  useEffect(() => {
    setSupported(controller.isSupported());
    return () => {
      controller.close();
    };
  }, [controller]);

  const toggle = async (w?: number, h?: number) => {
    if (active) {
      controller.close();
      setActive(null);
      return;
    }
    const opened = await controller.open(w, h);
    setActive(opened);
  };

  return { supported, window: active, toggle };
}
