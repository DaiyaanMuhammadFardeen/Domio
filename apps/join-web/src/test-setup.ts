/**
 * Vitest setup — runs before every test file.
 *
 * Mirrors apps/presenter/src/test-setup.ts:
 *  - Registers @testing-library/jest-dom matchers.
 *  - Cleans the DOM between tests so a render() in test N doesn't
 *    leak nodes into test N+1.
 *  - Provides a minimal navigator.clipboard shim and an in-memory
 *    localStorage shim so spies / direct calls succeed under jsdom.
 */

import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => {
  cleanup();
});

if (typeof navigator !== 'undefined' && navigator.clipboard === undefined) {
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
  const store = new Map<string, string>();
  Object.defineProperty(window, 'localStorage', {
    value: {
      getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
      setItem: (k: string, v: string) => { store.set(k, v); },
      removeItem: (k: string) => { store.delete(k); },
      clear: () => { store.clear(); },
      key: (i: number) => Array.from(store.keys())[i] ?? null,
      get length() { return store.size; },
    },
    writable: true,
    configurable: true,
  });
}

if (typeof window !== 'undefined' && window.sessionStorage === undefined) {
  const session = new Map<string, string>();
  Object.defineProperty(window, 'sessionStorage', {
    value: {
      getItem: (k: string) => (session.has(k) ? session.get(k)! : null),
      setItem: (k: string, v: string) => { session.set(k, v); },
      removeItem: (k: string) => { session.delete(k); },
      clear: () => { session.clear(); },
      key: (i: number) => Array.from(session.keys())[i] ?? null,
      get length() { return session.size; },
    },
    writable: true,
    configurable: true,
  });
}

// jsdom defaults to about:blank, which refuses to set cookies. Stamp a
// real http URL onto window.location so document.cookie is writable
// under tests. This must run before any cookie assignment.
if (typeof window !== 'undefined' && window.document) {
  try {
    Object.defineProperty(window, 'location', {
      configurable: true,
      writable: true,
      value: new URL('http://localhost/'),
    });
  } catch {
    // window.location may be locked down by jsdom; try a shallow merge.
    try {
      Object.assign(window.location, {
        protocol: 'http:',
        host: 'localhost',
        hostname: 'localhost',
        href: 'http://localhost/',
        origin: 'http://localhost',
        port: '',
      });
    } catch {
      // give up; the test author must use a real URL via environmentOptions.
    }
  }
}