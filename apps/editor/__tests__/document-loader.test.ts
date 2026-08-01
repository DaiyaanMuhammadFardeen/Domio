import { describe, it, expect } from 'vitest';
import { createDocumentLoader } from '../src/lib/document-loader-client.js';

describe('document loader', () => {
  it('exposes the example deck synchronously', () => {
    const loader = createDocumentLoader();
    const doc = loader.example();
    expect(doc.schemaVersion).toBeTruthy();
    expect(doc.slides.length).toBeGreaterThan(0);
    expect(doc.title).toBeTruthy();
  });

  it('returns a usable facade for fetch()', () => {
    const loader = createDocumentLoader();
    expect(typeof loader.fetch).toBe('function');
  });
});