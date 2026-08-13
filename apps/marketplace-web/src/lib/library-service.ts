/**
 * Marketplace library service — Wave 9 S9.1.
 *
 * Returns the buyer's purchased entries, with install/update state.
 * Seeded with 6 entries (2 of which have updates available).
 */

import type { LibraryEntry } from './types';

const SEED: ReadonlyArray<LibraryEntry> = [
  {
    listing_id: 'lst_0001',
    title: 'Modern Component Kit',
    version: '1.1.0',
    installed_at_ms: Date.UTC(2025, 6, 12),
    latest_version: '1.2.0',
    update_available: true,
    license_terms: 'MIT',
    download_url: 'https://cdn.domio.example.com/lst_0001-1.2.0.zip',
  },
  {
    listing_id: 'lst_0002',
    title: 'Minimal Template Suite',
    version: '2.0.0',
    installed_at_ms: Date.UTC(2025, 7, 1),
    latest_version: '2.0.0',
    update_available: false,
    license_terms: 'Commercial',
    download_url: 'https://cdn.domio.example.com/lst_0002-2.0.0.zip',
  },
  {
    listing_id: 'lst_0003',
    title: 'Bold Theme Pack',
    version: '1.4.2',
    installed_at_ms: Date.UTC(2025, 5, 20),
    latest_version: '1.5.0',
    update_available: true,
    license_terms: 'GPL-3.0',
    download_url: 'https://cdn.domio.example.com/lst_0003-1.5.0.zip',
  },
  {
    listing_id: 'lst_0004',
    title: 'Elegant Icon Bundle',
    version: '3.0.1',
    installed_at_ms: Date.UTC(2025, 4, 15),
    latest_version: '3.0.1',
    update_available: false,
    license_terms: 'MIT',
    download_url: 'https://cdn.domio.example.com/lst_0004-3.0.1.zip',
  },
  {
    listing_id: 'lst_0005',
    title: 'Vibrant Sticker Collection',
    version: '1.0.0',
    installed_at_ms: null,
    latest_version: '1.0.0',
    update_available: false,
    license_terms: 'CC-BY-4.0',
    download_url: 'https://cdn.domio.example.com/lst_0005-1.0.0.zip',
  },
  {
    listing_id: 'lst_0006',
    title: 'Atlas Marketing Foundation',
    version: '2.2.0',
    installed_at_ms: Date.UTC(2025, 7, 22),
    latest_version: '2.2.0',
    update_available: false,
    license_terms: 'Commercial',
    download_url: 'https://cdn.domio.example.com/lst_0006-2.2.0.zip',
  },
];

export async function getMyLibrary(_buyerId: string): Promise<ReadonlyArray<LibraryEntry>> {
  // buyerId is intentionally unused — demo seeds the same data per visitor.
  return SEED;
}
