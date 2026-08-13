/**
 * Library service — lists the editor's component + layout libraries.
 *
 * Per Wave 1 §S1.2 of docs/frontend-roadmap/01-wave-productionization.md.
 *
 * Today: returns the documented baseline library entries. When the
 * library-svc client lands, this becomes a thin loader wrapper.
 */

export interface LibraryEntry {
  readonly id: string;
  readonly name: string;
  readonly kind: 'block' | 'layout' | 'icon';
  readonly previewUrl?: string;
}

export const BOOTSTRAP_LIBRARY: ReadonlyArray<LibraryEntry> = [
  { id: 'lib-blank', name: 'Blank slide', kind: 'layout' },
  { id: 'lib-title', name: 'Title slide', kind: 'layout' },
  { id: 'lib-two-col', name: 'Two columns', kind: 'layout' },
  { id: 'lib-stat', name: 'Stat callout', kind: 'block' },
  { id: 'lib-quote', name: 'Pull quote', kind: 'block' },
];

export async function listLibraryEntries(_filter?: string): Promise<ReadonlyArray<LibraryEntry>> {
  return BOOTSTRAP_LIBRARY;
}
