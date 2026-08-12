'use client';

/**
 * LibraryLockIcon — compact lock pill for brand-locked library items.
 *
 * Per Wave 2 §S2.6 of docs/frontend-roadmap/02-wave-editor-surface.md.
 *
 * Brand-locked components refuse to be edited or overridden by other
 * kits. The icon is a small lock glyph + a tooltip; it doesn't block
 * interaction by itself — the host decides whether to disable
 * adjacent controls when `locked` is true.
 */

import type { ReactElement } from 'react';

export interface LibraryLockIconProps {
  locked: boolean;
  /** Tooltip content shown on hover. */
  title?: string | undefined;
  /** Optional id for testing. */
  id?: string | undefined;
}

export function LibraryLockIcon(props: LibraryLockIconProps): ReactElement | null {
  if (!props.locked) return null;
  return (
    <span
      className="library-lock-icon"
      role="img"
      aria-label={props.title ?? 'Brand-locked — overrides disabled'}
      title={props.title ?? 'Brand-locked — overrides disabled'}
      data-testid={props.id ?? 'library-lock-icon'}
    >
      <svg
        width="12"
        height="12"
        viewBox="0 0 12 12"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden
      >
        <path
          d="M3 5V4a3 3 0 1 1 6 0v1m-7 0h8v5H2z"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span className="library-lock-icon__text">locked</span>
    </span>
  );
}
