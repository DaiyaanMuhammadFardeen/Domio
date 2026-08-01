/**
 * Theme map — used to translate style snapshots across decks that share a
 * theme (or fall back to a hard-coded fallback palette).
 */

import type { StyleSnapshot } from './style-snapshot.js';

export interface ThemeMap {
  byName(name: string): string | undefined;
}

export function emptyThemeMap(): ThemeMap {
  return {
    byName: () => undefined,
  };
}

export function applyThemeMap(snapshot: StyleSnapshot, themeMap: ThemeMap): StyleSnapshot {
  if (!snapshot.themeMapping) return snapshot;
  const next: StyleSnapshot = { ...snapshot };
  next.themeMapping = {};
  for (const [name, token] of Object.entries(snapshot.themeMapping)) {
    next.themeMapping[name] = themeMap.byName(token) ?? token;
  }
  return next;
}