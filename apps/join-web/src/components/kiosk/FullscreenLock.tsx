/**
 * FullscreenLock — wraps the kiosk surface, requests the browser's
 * fullscreen API on mount, and exits only when the admin PIN is
 * supplied via the parent.
 *
 * Per Wave 5 §S5.8 of docs/frontend-roadmap/05-wave-audience-participation.md.
 *
 * Touch events + Escape are intercepted while inside the kiosk: a
 * `keyboard-block` overlay listens for Escape and KeyDown events that
 * would exit fullscreen and re-enters fullscreen instead. Pointer
 * lock is requested after fullscreen so the kiosk can't be dismissed
 * by tapping outside the surface.
 *
 * The component does NOT take responsibility for the admin PIN flow —
 * parents control unlocking via `requested={false}` to release the
 * kiosk or by unmounting the surface.
 */

import { useEffect, useRef, type ReactElement, type ReactNode } from 'react';

export interface FullscreenLockProps {
  readonly children: ReactNode;
  /** When true, the lock is enforced. When false, the children render
   * without requesting fullscreen / pointer-lock (useful for the
   * PIN-entered state). */
  readonly active: boolean;
}

export function FullscreenLock({
  children,
  active,
}: FullscreenLockProps): ReactElement {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!active) return;
    if (typeof document === 'undefined') return;
    const root = containerRef.current;

    // Best-effort fullscreen request — browsers require a user gesture
    // for the first call, but we still attempt so that subsequent
    // mounts inside a pre-authenticated iframe work.
    const tryFullscreen = async (): Promise<void> => {
      const el = root as (HTMLElement & {
        requestFullscreen?: () => Promise<void>;
      }) | null;
      if (el && typeof el.requestFullscreen === 'function') {
        try {
          await el.requestFullscreen();
        } catch {
          // user-gesture / permissions errors are non-fatal — the kiosk
          // surface is still interactive, just not fullscreen.
        }
      }
    };

    const tryPointerLock = async (): Promise<void> => {
      const el = root as (HTMLElement & {
        requestPointerLock?: () => Promise<void>;
      }) | null;
      if (el && typeof el.requestPointerLock === 'function') {
        try {
          await el.requestPointerLock();
        } catch {
          // pointer-lock is best-effort.
        }
      }
    };

    void tryFullscreen();
    void tryPointerLock();

    const onKeyDown = (e: KeyboardEvent): void => {
      // Block Escape from leaving fullscreen + the OS-level navigation
      // shortcuts that would dump the user out of the kiosk.
      if (
        e.key === 'Escape' ||
        (e.altKey && (e.key === 'F4' || e.key === 'Tab')) ||
        ((e.ctrlKey || e.metaKey) && (e.key === 'w' || e.key === 'W'))
      ) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener('keydown', onKeyDown, true);

    const onFullscreenChange = (): void => {
      if (document.fullscreenElement === null && root !== null) {
        void tryFullscreen();
      }
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);

    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      document.removeEventListener('fullscreenchange', onFullscreenChange);
    };
  }, [active]);

  return (
    <div
      ref={containerRef}
      data-testid="kiosk-fullscreen"
      data-active={active}
      className="fixed inset-0 z-0 bg-slate-950 text-slate-100 select-none"
      onContextMenu={(e) => e.preventDefault()}
    >
      {children}
    </div>
  );
}
