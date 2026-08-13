/**
 * annotations — Wave 2 §S2.8 unit tests.
 */

import { describe, expect, it } from 'vitest';
import {
  clearAnnotations,
  makeAnnotationPin,
  readAnnotations,
  removeAnnotation,
  upsertAnnotation,
  writeAnnotations,
} from './annotations';

function samplePin() {
  return makeAnnotationPin({
    dataPointId: 'revenue-2024',
    text: 'Big jump from Q3',
    author: 'Dana',
  });
}

describe('annotations', () => {
  it('readAnnotations returns an empty list when nothing is stored', () => {
    expect(readAnnotations(undefined)).toEqual([]);
    expect(readAnnotations({})).toEqual([]);
  });

  it('writeAnnotations + readAnnotations round-trip', () => {
    const pin = samplePin();
    const props = writeAnnotations({}, [pin]);
    expect(readAnnotations(props)).toEqual([pin]);
  });

  it('upsertAnnotation adds a new pin when none exists', () => {
    const pin = samplePin();
    const props = upsertAnnotation({}, pin);
    expect(readAnnotations(props)).toHaveLength(1);
  });

  it('upsertAnnotation replaces the pin with the same id', () => {
    const pin = samplePin();
    const props = upsertAnnotation({}, pin);
    const updated = { ...pin, text: 'Updated comment' };
    const next = upsertAnnotation(props, updated);
    const pins = readAnnotations(next);
    expect(pins).toHaveLength(1);
    expect(pins[0]?.text).toBe('Updated comment');
  });

  it('removeAnnotation removes a single pin by id', () => {
    const p1 = samplePin();
    const p2 = { ...samplePin(), id: 'pin-2', dataPointId: 'revenue-2023' };
    const props = writeAnnotations({}, [p1, p2]);
    const next = removeAnnotation(props, p1.id);
    expect(readAnnotations(next)).toEqual([p2]);
  });

  it('clearAnnotations removes every pin', () => {
    const props = writeAnnotations({}, [samplePin(), samplePin()]);
    const next = clearAnnotations(props);
    expect(readAnnotations(next)).toEqual([]);
  });

  it('makeAnnotationPin generates a new id when none is provided', () => {
    const a = makeAnnotationPin({ dataPointId: 'x', text: 'a', author: 'A' });
    const b = makeAnnotationPin({ dataPointId: 'x', text: 'a', author: 'A' });
    expect(a.id).not.toBe(b.id);
    expect(a.id).toMatch(/^pin-/);
  });

  it('makeAnnotationPin honours the supplied id and createdAtMs', () => {
    const pin = makeAnnotationPin({
      id: 'pin-fixed',
      dataPointId: 'x',
      text: 'a',
      author: 'A',
      createdAtMs: 12345,
    });
    expect(pin.id).toBe('pin-fixed');
    expect(pin.createdAtMs).toBe(12345);
  });

  it('makeAnnotationPin propagates x/y when supplied', () => {
    const pin = makeAnnotationPin({
      dataPointId: 'x',
      text: 'a',
      author: 'A',
      x: 50,
      y: 75,
    });
    expect(pin.x).toBe(50);
    expect(pin.y).toBe(75);
  });
});
