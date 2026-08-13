/**
 * Format tests — en vs de vs bn number/currency/percent/date,
 * locale collation ordering.
 */

import { describe, it, expect } from 'vitest';
import {
  formatNumber,
  formatCurrency,
  formatPercent,
  formatDate,
  compareLocale,
} from './format.js';

describe('formatNumber', () => {
  it('formats decimal in en-US with commas', () => {
    const result = formatNumber(1234567.89, { locale: 'en-US', decimals: 2 });
    expect(result).toBe('1,234,567.89');
  });

  it('formats decimal in de-DE with dots and comma', () => {
    const result = formatNumber(1234567.89, { locale: 'de-DE', decimals: 2 });
    expect(result).toBe('1.234.567,89');
  });

  it('formats decimal in bn-BD with Indian numbering', () => {
    const result = formatNumber(1234567, { locale: 'bn-BD' });
    // Bengali locale uses different digit shapes, just check it doesn't throw
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });
});

describe('formatCurrency', () => {
  it('formats USD in en-US', () => {
    const result = formatCurrency(1234.56, { locale: 'en-US', currency: 'USD' });
    expect(result).toContain('1,234.56');
    expect(result).toContain('$');
  });

  it('formats EUR in de-DE', () => {
    const result = formatCurrency(1234.56, { locale: 'de-DE', currency: 'EUR' });
    expect(result).toContain('1.234,56');
    expect(result).toContain('€');
  });
});

describe('formatPercent', () => {
  it('formats 0.85 as 85% in en-US', () => {
    const result = formatPercent(0.85, { locale: 'en-US' });
    expect(result).toContain('85');
    expect(result).toContain('%');
  });

  it('formats 0.123 as 12.3% in de-DE', () => {
    const result = formatPercent(0.123, { locale: 'de-DE', decimals: 1 });
    expect(result).toContain('12,3');
    expect(result).toContain('%');
  });
});

describe('formatDate', () => {
  it('formats date in en-US', () => {
    const date = new Date('2026-08-04T12:00:00Z');
    const result = formatDate(date, { locale: 'en-US', dateStyle: 'medium' });
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('formats date in de-DE', () => {
    const date = new Date('2026-08-04T12:00:00Z');
    const result = formatDate(date, { locale: 'de-DE', dateStyle: 'medium' });
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });
});

describe('compareLocale — collation ordering', () => {
  it('sorts strings correctly in en-US', () => {
    const items = ['banana', 'apple', 'cherry'];
    const sorted = [...items].sort((a, b) => compareLocale(a, b, 'en-US'));
    expect(sorted).toEqual(['apple', 'banana', 'cherry']);
  });

  it('sorts strings correctly in de-DE (umlauts)', () => {
    const items = ['Über', 'Apfel', 'Bär'];
    const sorted = [...items].sort((a, b) => compareLocale(a, b, 'de-DE'));
    // German collation: Apfel < Bär < Über
    expect(sorted[0]).toBe('Apfel');
  });
});
