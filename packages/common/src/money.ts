/**
 * Money — integer count of the smallest currency unit.
 * For BDT/USD/EUR this is the paisa/cent (1/100). For JPY it's the yen
 * itself (no minor unit). Currency is an ISO 4217 3-letter code.
 */

export type Currency = 'USD' | 'EUR' | 'GBP' | 'BDT' | 'INR' | 'JPY' | 'CNY' | 'AUD' | 'CAD';

const CURRENCY_MINOR_UNITS: Record<Currency, number> = {
  USD: 2,
  EUR: 2,
  GBP: 2,
  BDT: 2,
  INR: 2,
  JPY: 0,
  CNY: 2,
  AUD: 2,
  CAD: 2,
};

export interface Money {
  currency: Currency;
  amount_micros: number; // technically "amount_minor_units"; we keep the proto name.
}

const ZERO_DECIMAL = new Set<Currency>(['JPY']);

export function money(currency: Currency, amount: number): Money {
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error(`Money amount must be a finite non-negative number; got ${amount}`);
  }
  const minor = ZERO_DECIMAL.has(currency) ? Math.round(amount) : Math.round(amount * 100);
  return { currency, amount_micros: minor };
}

export function addMoney(a: Money, b: Money): Money {
  if (a.currency !== b.currency) {
    throw new Error(`Cannot add money in different currencies: ${a.currency} + ${b.currency}`);
  }
  return { currency: a.currency, amount_micros: a.amount_micros + b.amount_micros };
}

export function formatMoney(m: Money, locale = 'en-US'): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: m.currency,
  }).format(m.amount_micros / Math.pow(10, CURRENCY_MINOR_UNITS[m.currency]));
}
