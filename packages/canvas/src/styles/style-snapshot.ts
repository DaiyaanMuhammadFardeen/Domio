/**
 * Style snapshot — versioned via `StyleFormatVersion` for forward migration.
 * See docs/development_phases/phase-03 §D.3.
 */

import type { Element } from '@domio/schema';

export const STYLE_FORMAT_VERSION = 1;

export interface StyleSnapshot {
  formatVersion: number;
  fill?: unknown;
  stroke?: unknown;
  fontFamily?: string | undefined;
  fontSize?: number | undefined;
  fontWeight?: number | undefined;
  /** Theme token mapping for cross-deck paste. */
  themeMapping?: Record<string, string> | undefined;
}

export function snapshotStyle(element: Element): StyleSnapshot {
  const style = (element.style ?? {}) as Record<string, unknown>;
  const snapshot: StyleSnapshot = {
    formatVersion: STYLE_FORMAT_VERSION,
  };
  if (style.fill !== undefined) snapshot.fill = style.fill;
  if (style.stroke !== undefined) snapshot.stroke = style.stroke;
  if (typeof style.fontFamily === 'string') snapshot.fontFamily = style.fontFamily;
  if (typeof style.fontSize === 'number') snapshot.fontSize = style.fontSize;
  if (typeof style.fontWeight === 'number') snapshot.fontWeight = style.fontWeight;
  return snapshot;
}

export function migrateSnapshot(snapshot: StyleSnapshot): StyleSnapshot {
  if (snapshot.formatVersion === STYLE_FORMAT_VERSION) return snapshot;
  // Migration is a no-op for the current version; future versions would
  // branch here.
  return { ...snapshot, formatVersion: STYLE_FORMAT_VERSION };
}
