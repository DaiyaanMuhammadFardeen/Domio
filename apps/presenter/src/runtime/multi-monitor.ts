/**
 * Multi-monitor helpers — descriptor formatting, popout resolution.
 *
 * Per Wave 4 §S4.1 of docs/frontend-roadmap/04-wave-presenter-live.md.
 */

import type { PresentationAvailability } from './multi-monitor-types';

export interface DisplayDescriptor {
  readonly id: string;
  readonly label: string;
  readonly resolution: string | null;
  readonly isPrimary: boolean;
}

/**
 * Convert a Presentation-Availability value (or undefined when the API
 * isn't supported) into a list of displays for the presenter UI. Today
 * the standard only surfaces "is there a 2nd screen" but we surface
 * it as a single non-primary display with a generic label.
 */
export function formatPresentations(avail: PresentationAvailability | undefined): readonly DisplayDescriptor[] {
  if (!avail) return [];
  if (avail.value) {
    return [
      {
        id: 'secondary',
        label: 'External display',
        resolution: null,
        isPrimary: false,
      },
    ];
  }
  return [];
}

/** Format a width × height pixel tuple as "1920×1080". */
export function formatResolution(w: number | undefined, h: number | undefined): string | null {
  if (typeof w !== 'number' || typeof h !== 'number') return null;
  return `${w}×${h}`;
}
