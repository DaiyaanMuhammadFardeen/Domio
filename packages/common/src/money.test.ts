import { describe, it, expect } from 'vitest';
import { money, addMoney, formatMoney } from './money.js';

describe('money', () => {
  it('creates money in USD with minor units', () => {
    expect(money('USD', 19.99)).toEqual({ currency: 'USD', amount_micros: 1999 });
  });

  it('handles JPY (no minor unit)', () => {
    expect(money('JPY', 1000)).toEqual({ currency: 'JPY', amount_micros: 1000 });
  });

  it('rejects negative amounts', () => {
    expect(() => money('USD', -1)).toThrow();
  });

  it('adds same-currency money', () => {
    expect(addMoney(money('USD', 1.0), money('USD', 2.5))).toEqual({
      currency: 'USD',
      amount_micros: 350,
    });
  });

  it('rejects cross-currency add', () => {
    expect(() => addMoney(money('USD', 1), money('EUR', 1))).toThrow();
  });

  it('formats', () => {
    const m = money('USD', 19.99);
    expect(formatMoney(m, 'en-US')).toBe('$19.99');
  });
});