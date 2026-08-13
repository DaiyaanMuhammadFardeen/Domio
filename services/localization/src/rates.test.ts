/**
 * Rates tests — ingest + convert + missing pair error + asOf fallback.
 */

import { describe, it, expect } from 'vitest';
import { ingestRates, convert, MissingRateError } from './rates.js';
import { InMemoryExchangeRateRepository } from './dal.js';

function makeRepo() {
  return new InMemoryExchangeRateRepository();
}

describe('rates — ingest + convert', () => {
  it('ingests and converts USD/EUR', async () => {
    const repo = makeRepo();
    await ingestRates(repo, [{ pair: 'USD/EUR', rate: 0.92, asOf: new Date('2026-08-01') }]);
    const result = await convert(repo, 100, 'USD', 'EUR');
    expect(result.convertedAmount).toBe(92);
    expect(result.rate).toBe(0.92);
    expect(result.from).toBe('USD');
    expect(result.to).toBe('EUR');
  });

  it('same currency returns 1:1', async () => {
    const repo = makeRepo();
    const result = await convert(repo, 50, 'USD', 'USD');
    expect(result.convertedAmount).toBe(50);
    expect(result.rate).toBe(1);
  });
});

describe('rates — missing pair error', () => {
  it('throws MissingRateError for unknown pair', async () => {
    const repo = makeRepo();
    await expect(convert(repo, 100, 'USD', 'XYZ')).rejects.toBeInstanceOf(MissingRateError);
  });
});

describe('rates — asOf fallback', () => {
  it('resolves the latest rate at or before asOf', async () => {
    const repo = makeRepo();
    await ingestRates(repo, [
      { pair: 'GBP/USD', rate: 1.27, asOf: new Date('2026-07-01') },
      { pair: 'GBP/USD', rate: 1.29, asOf: new Date('2026-08-01') },
    ]);
    // Request rate as of July 15 — should get the July 1 rate
    const result = await convert(repo, 100, 'GBP', 'USD', new Date('2026-07-15'));
    expect(result.rate).toBe(1.27);
    expect(result.convertedAmount).toBe(127);
  });

  it('falls back to latest if asOf is after all records', async () => {
    const repo = makeRepo();
    await ingestRates(repo, [{ pair: 'JPY/EUR', rate: 0.0061, asOf: new Date('2026-08-01') }]);
    const result = await convert(repo, 1000, 'JPY', 'EUR', new Date('2026-12-31'));
    expect(result.rate).toBe(0.0061);
  });
});
