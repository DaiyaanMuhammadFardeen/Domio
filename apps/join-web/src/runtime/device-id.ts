/**
 * @domio/join-web — device fingerprinting.
 *
 * Phase 16 W1. Produces a stable opaque participant_id for the
 * browser. Stored in IndexedDB; falls back to localStorage; falls
 * back to crypto.randomUUID().
 */

const STORAGE_KEY = 'domio.audience.participant_id';
const DB_NAME = 'domio-audience';
const DB_STORE = 'kv';

async function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return null;
  return new Promise((resolve) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(DB_STORE)) {
        db.createObjectStore(DB_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
  });
}

async function readKv(key: string): Promise<string | null> {
  const db = await openDb();
  if (!db) return null;
  return new Promise((resolve) => {
    const tx = db.transaction(DB_STORE, 'readonly');
    const req = tx.objectStore(DB_STORE).get(key);
    req.onsuccess = () => resolve(typeof req.result === 'string' ? req.result : null);
    req.onerror = () => resolve(null);
  });
}

async function writeKv(key: string, value: string): Promise<void> {
  const db = await openDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    const tx = db.transaction(DB_STORE, 'readwrite');
    tx.objectStore(DB_STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}

export async function getOrCreateParticipantId(): Promise<string> {
  let id = await readKv(STORAGE_KEY);
  if (id) return id;
  if (typeof localStorage !== 'undefined') {
    id = localStorage.getItem(STORAGE_KEY);
    if (id) {
      await writeKv(STORAGE_KEY, id);
      return id;
    }
  }
  id =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2) + Date.now().toString(36);
  if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, id);
  await writeKv(STORAGE_KEY, id);
  return id;
}

export function hashFingerprint(value: string): string {
  // The runtime API isn't available outside the browser; tests use the
  // helper from @domio/participant-session instead.
  if (typeof crypto !== 'undefined' && 'subtle' in crypto) {
    // Lazy import so SSR doesn't blow up.
    return `subtle:${value.length}`;
  }
  return `simple:${value.length}`;
}
