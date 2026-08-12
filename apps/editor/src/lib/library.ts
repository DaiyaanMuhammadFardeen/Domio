/**
 * Library — manages "My Library" items in localStorage.
 * Each item has a catalogId, installed version, and pin-mode metadata.
 */

const STORAGE_KEY = 'domio.my-library';

export type PinMode = 'track' | 'pin-version' | 'pin-range';

export interface LibraryItem {
  catalogId: string;
  name: string;
  version: string;
  pinMode: PinMode;
  /** For pin-version: exact semver. For pin-range: semver range string. */
  pinValue: string;
  addedAt: number;
}

function readLibrary(): LibraryItem[] {
  try {
    if (typeof localStorage === 'undefined') return [];
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as LibraryItem[];
  } catch {
    return [];
  }
}

function writeLibrary(items: LibraryItem[]): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    // swallow — quota / private mode / disabled storage
  }
}

export function getLibraryItems(): LibraryItem[] {
  return readLibrary();
}

export function addToLibrary(item: Omit<LibraryItem, 'addedAt'>): LibraryItem {
  const items = readLibrary();
  const existing = items.find((i) => i.catalogId === item.catalogId);
  if (existing) {
    existing.version = item.version;
    existing.pinMode = item.pinMode;
    existing.pinValue = item.pinValue;
    existing.name = item.name;
    writeLibrary(items);
    return existing;
  }
  const newItem: LibraryItem = { ...item, addedAt: Date.now() };
  items.push(newItem);
  writeLibrary(items);
  return newItem;
}

export function removeFromLibrary(catalogId: string): void {
  const items = readLibrary().filter((i) => i.catalogId !== catalogId);
  writeLibrary(items);
}

export function updateLibraryItem(catalogId: string, updates: Partial<Pick<LibraryItem, 'version' | 'pinMode' | 'pinValue'>>): LibraryItem | undefined {
  const items = readLibrary();
  const item = items.find((i) => i.catalogId === catalogId);
  if (!item) return undefined;
  if (updates.version !== undefined) item.version = updates.version;
  if (updates.pinMode !== undefined) item.pinMode = updates.pinMode;
  if (updates.pinValue !== undefined) item.pinValue = updates.pinValue;
  writeLibrary(items);
  return item;
}

export function isInLibrary(catalogId: string): boolean {
  return readLibrary().some((i) => i.catalogId === catalogId);
}
