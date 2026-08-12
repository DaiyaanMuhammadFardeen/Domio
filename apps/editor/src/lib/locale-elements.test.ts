/**
 * Locale elements — Wave 2 §S2.9 unit tests.
 *
 * Verifies the element-level locale config is stored under the
 * `x-domio:locale` key inside the element's style bag.
 */

import { describe, expect, it } from 'vitest';
import { asULID, type Element } from '@domio/schema';
import { clearLocaleConfig, readLocaleConfig, writeLocaleConfig } from './locale-elements';

function makeElement(): Element {
  return {
    id: asULID('01HZX01HZX01HZX01HZX01HZA'),
    semanticId: 'el',
    type: 'text',
    name: 'Sample',
    parentId: null,
    text: { content: '0' },
  };
}

describe('locale-elements', () => {
  it('returns null when no locale config is set', () => {
    expect(readLocaleConfig(makeElement())).toBeNull();
  });

  it('round-trips a locale config through the element style bag', () => {
    const el = writeLocaleConfig(makeElement(), {
      locale: 'de-DE',
      style: 'currency',
      currency: 'EUR',
      decimals: 2,
    });
    expect(readLocaleConfig(el)).toEqual({
      locale: 'de-DE',
      style: 'currency',
      currency: 'EUR',
      decimals: 2,
    });
  });

  it('clearLocaleConfig removes the entry but leaves the element intact', () => {
    const tagged = writeLocaleConfig(makeElement(), {
      locale: 'en-US',
      style: 'percent',
    });
    const cleared = clearLocaleConfig(tagged);
    expect(readLocaleConfig(cleared)).toBeNull();
    expect(cleared.style).toEqual({});
  });

  it('readLocaleConfig rejects malformed payloads', () => {
    const el = {
      ...makeElement(),
      style: { 'x-domio:locale': { locale: 42, style: 'decimal' } },
    } as Element;
    expect(readLocaleConfig(el)).toBeNull();
  });
});