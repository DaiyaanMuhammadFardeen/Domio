import { describe, expect, it } from 'vitest';
import { formatCurrency } from './format-currency.js';

describe('formatCurrency', () => {
  describe('BDT (Bangladeshi Taka)', () => {
    it('formats zero cents in Bengali locale with Bengali digits', () => {
      expect(formatCurrency(0, 'BDT', 'bn')).toBe('৳০');
    });

    it('formats whole taka in Bengali locale with Bengali digits', () => {
      expect(formatCurrency(125000, 'BDT', 'bn')).toBe('৳১,২৫০');
    });

    it('formats fractional taka in Bengali locale', () => {
      expect(formatCurrency(1250, 'BDT', 'bn')).toBe('৳১২.৫০');
    });

    it('formats whole taka (no fraction) in Bengali locale', () => {
      expect(formatCurrency(100, 'BDT', 'bn')).toBe('৳১');
    });

    it('formats BDT in English locale with ASCII digits', () => {
      expect(formatCurrency(125000, 'BDT', 'en')).toBe('৳1,250');
    });

    it('formats BDT in French locale with ASCII digits', () => {
      expect(formatCurrency(125000, 'BDT', 'fr')).toBe('৳1,250');
    });
  });

  describe('USD (US Dollar)', () => {
    it('formats $0', () => {
      expect(formatCurrency(0, 'USD', 'en')).toBe('$0');
    });

    it('formats $12.50', () => {
      expect(formatCurrency(1250, 'USD', 'en')).toBe('$12.50');
    });

    it('formats $1,250', () => {
      expect(formatCurrency(125000, 'USD', 'en')).toBe('$1,250');
    });

    it('formats whole dollars (no fraction)', () => {
      expect(formatCurrency(500, 'USD', 'en')).toBe('$5');
    });

    it('formats $1,000,000', () => {
      expect(formatCurrency(100000000, 'USD', 'en')).toBe('$1,000,000');
    });
  });

  describe('EUR (Euro)', () => {
    it('formats €0', () => {
      expect(formatCurrency(0, 'EUR', 'de')).toBe('€0');
    });

    it('formats €12.50', () => {
      expect(formatCurrency(1250, 'EUR', 'de')).toBe('€12.50');
    });

    it('formats €1,250', () => {
      expect(formatCurrency(125000, 'EUR', 'fr')).toBe('€1,250');
    });

    it('formats whole euros (no fraction)', () => {
      expect(formatCurrency(500, 'EUR', 'es')).toBe('€5');
    });
  });

  describe('error handling', () => {
    it('throws RangeError for negative amounts', () => {
      expect(() => formatCurrency(-1, 'USD', 'en')).toThrow(RangeError);
    });

    it('throws RangeError for non-integer amounts', () => {
      expect(() => formatCurrency(10.5, 'USD', 'en')).toThrow(RangeError);
    });
  });
});
