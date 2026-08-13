import { describe, it, expect } from 'vitest';
import { canonicalize } from '../src/canonical.js';

describe('canonicalize', () => {
  it('sorts keys', () => {
    expect(canonicalize({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
  });
  it('drops undefined values', () => {
    expect(canonicalize({ a: 1, b: undefined })).toBe('{"a":1}');
  });
  it('handles nested objects', () => {
    expect(canonicalize({ a: { c: 1, b: 2 } })).toBe('{"a":{"b":2,"c":1}}');
  });
  it('handles arrays', () => {
    expect(canonicalize([1, 2, { x: 1 }])).toBe('[1,2,{"x":1}]');
  });
  it('escapes strings', () => {
    expect(canonicalize('a"b')).toBe('"a\\"b"');
    expect(canonicalize('a\\b')).toBe('"a\\\\b"');
  });
  it('escapes control characters with \\u', () => {
    expect(canonicalize('\n')).toBe('"\\u000a"');
  });
  it('preserves Unicode content as-is', () => {
    expect(canonicalize('নমস্কার')).toBe('"নমস্কার"');
  });
  it('round-trips through JSON.parse', () => {
    const obj = { z: 'a', a: { b: [1, 'c', null, true] } };
    expect(JSON.parse(canonicalize(obj))).toEqual({ z: 'a', a: { b: [1, 'c', null, true] } });
  });
  it('treats -0 as 0', () => {
    expect(canonicalize(-0)).toBe('0');
  });
  it('rejects non-finite numbers', () => {
    expect(() => canonicalize(Infinity)).toThrow();
    expect(() => canonicalize(NaN)).toThrow();
  });
  it('is deterministic across runs', () => {
    const obj = { name: 'alice@example.com', age: 30, tags: ['a', 'b'] };
    const a = canonicalize(obj);
    const b = canonicalize(obj);
    expect(a).toBe(b);
  });
});
