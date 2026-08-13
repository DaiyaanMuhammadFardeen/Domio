/**
 * Vitest setup — jsdom polyfills + RTL matchers.
 *
 * Per Wave 1 §S1.7 of docs/frontend-roadmap/01-wave-productionization.md.
 */

import '@testing-library/jest-dom/vitest';

// jsdom 25 ships a Blob without the `.text()` method (added to
// the DOM spec in 2023). Polyfill it from the Node global so
// service-level helpers that hand back Blobs can be asserted on
// in tests.
if (typeof Blob !== 'undefined' && typeof Blob.prototype.text !== 'function') {
  Blob.prototype.text = function text(this: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ''));
      reader.onerror = () => reject(reader.error ?? new Error('Blob.text failed'));
      reader.readAsText(this);
    });
  };
}
