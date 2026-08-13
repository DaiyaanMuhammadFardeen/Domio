/**
 * Vitest setup — runs before every test file.
 *
 * Registers @testing-library/jest-dom matchers (toBeInTheDocument etc.)
 * and ensures navigator.clipboard.writeText exists in jsdom so that
 * spies / direct calls succeed.
 */

import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => {
  // @testing-library/react v16 doesn't auto-cleanup unless React Testing
  // Library's auto-cleanup is enabled; we explicitly clean between tests
  // so a render() in test N doesn't leave DOM nodes visible in test N+1.
  cleanup();
});

if (typeof navigator !== 'undefined' && navigator.clipboard === undefined) {
  // jsdom doesn't ship navigator.clipboard by default. Provide a minimal
  // stub so vi.spyOn(navigator.clipboard, 'writeText') and direct calls work.
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: async () => undefined },
    writable: true,
    configurable: true,
  });
} else if (typeof navigator !== 'undefined' && navigator.clipboard) {
  if (typeof navigator.clipboard.writeText !== 'function') {
    navigator.clipboard.writeText = async () => undefined;
  }
}

if (typeof window !== 'undefined' && window.localStorage === undefined) {
  // jsdom sometimes returns undefined for window.localStorage in
  // strict sandboxed modes. Provide an in-memory shim.
  const store = new Map<string, string>();
  Object.defineProperty(window, 'localStorage', {
    value: {
      getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
      setItem: (k: string, v: string) => {
        store.set(k, v);
      },
      removeItem: (k: string) => {
        store.delete(k);
      },
      clear: () => {
        store.clear();
      },
      key: (i: number) => Array.from(store.keys())[i] ?? null,
      get length() {
        return store.size;
      },
    },
    writable: true,
    configurable: true,
  });
}
