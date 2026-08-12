/**
 * Vitest setup — ensure jsdom's storage APIs are usable and provide a
 * polyfill if the upstream URL config didn't take. Tests should never
 * rely on Node's `--localstorage-file` flag (experimental).
 */

import { afterEach, beforeEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

class LocalStorageMock {
  private readonly store = new Map<string, string>();
  getItem(key: string): string | null { return this.store.get(key) ?? null; }
  setItem(key: string, value: string): void { this.store.set(key, value); }
  removeItem(key: string): void { this.store.delete(key); }
  clear(): void { this.store.clear(); }
  key(i: number): string | null { return Array.from(this.store.keys())[i] ?? null; }
  get length(): number { return this.store.size; }
}

if (typeof window !== 'undefined' && typeof window.localStorage === 'undefined') {
  Object.defineProperty(window, 'localStorage', {
    value: new LocalStorageMock(),
    writable: true,
    configurable: true,
  });
}

afterEach(() => {
  cleanup();
  if (typeof window !== 'undefined' && typeof window.localStorage !== 'undefined') {
    window.localStorage.clear();
  }
});

beforeEach(() => {
  if (typeof window !== 'undefined' && typeof window.localStorage !== 'undefined') {
    window.localStorage.clear();
  }
});