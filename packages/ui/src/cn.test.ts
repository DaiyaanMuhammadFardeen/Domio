import { describe, expect, it } from 'vitest';
import { cn } from './cn.js';

describe('cn', () => {
  it('joins strings', () => {
    expect(cn('a', 'b', 'c')).toBe('a b c');
  });

  it('drops falsy values', () => {
    expect(cn('a', undefined, null, false, '', 'b')).toBe('a b');
  });

  it('flattens nested arrays', () => {
    expect(cn('a', ['b', 'c'])).toBe('a b c');
  });

  it('includes keys for truthy object values', () => {
    expect(cn('a', { b: true, c: false, d: 1 })).toBe('a b d');
  });
});
