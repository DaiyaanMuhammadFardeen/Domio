import { describe, expect, it } from 'vitest';
import { toBengaliDigits } from './bengali-digits.js';

describe('toBengaliDigits', () => {
  it('converts ASCII digits to Bengali digits', () => {
    expect(toBengaliDigits('0123456789')).toBe('০১২৩৪৫৬৭৮৯');
  });

  it('leaves non-digit characters unchanged', () => {
    expect(toBengaliDigits('৳1,250')).toBe('৳১,২৫০');
  });

  it('handles empty string', () => {
    expect(toBengaliDigits('')).toBe('');
  });

  it('handles string with no digits', () => {
    expect(toBengaliDigits('hello')).toBe('hello');
  });

  it('handles large numbers', () => {
    expect(toBengaliDigits('125000')).toBe('১২৫০০০');
  });
});
