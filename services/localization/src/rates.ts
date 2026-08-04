/**
 * Exchange-rate snapshot ingestion and conversion.
 *
 * Ingests currency pair rates with as-of timestamps, resolves the
 * correct rate for a conversion (fallback to latest if no exact match),
 * and returns the converted amount + rate used.
 */

import type { ExchangeRateRecord, ExchangeRateRepository } from './dal.js';

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class MissingRateError extends Error {
  readonly code = 'MISSING_RATE' as const;
  constructor(public readonly pair: string) {
    super(`Exchange rate not found for pair: ${pair}`);
    this.name = 'MissingRateError';
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RateSnapshot {
  readonly pair: string;
  readonly rate: number;
  readonly asOf: Date;
}

export interface ConversionResult {
  readonly amount: number;
  readonly from: string;
  readonly to: string;
  readonly convertedAmount: number;
  readonly rate: number;
  readonly rateAsOf: Date;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Ingest exchange rate snapshots. Upserts into the repository.
 */
export async function ingestRates(
  repo: ExchangeRateRepository,
  pairs: readonly RateSnapshot[],
): Promise<void> {
  for (const p of pairs) {
    const record: ExchangeRateRecord = {
      pair: p.pair,
      rate: p.rate,
      asOf: p.asOf,
    };
    await repo.upsert(record);
  }
}

/**
 * Convert an amount from one currency to another.
 *
 * @param repo    The exchange rate repository.
 * @param amount  The amount to convert.
 * @param from    Source currency code (e.g. "USD").
 * @param to      Target currency code (e.g. "EUR").
 * @param asOf    Optional date to resolve the rate at. If omitted,
 *                uses the latest available rate.
 * @throws MissingRateError if no rate exists for the pair.
 */
export async function convert(
  repo: ExchangeRateRepository,
  amount: number,
  from: string,
  to: string,
  asOf?: Date,
): Promise<ConversionResult> {
  if (from === to) {
    return {
      amount,
      from,
      to,
      convertedAmount: amount,
      rate: 1,
      rateAsOf: new Date(),
    };
  }

  const pair = `${from}/${to}`;
  let record: ExchangeRateRecord | null;

  if (asOf) {
    record = await repo.findAsOf(pair, asOf);
  } else {
    record = await repo.find(pair);
  }

  if (!record) {
    throw new MissingRateError(pair);
  }

  return {
    amount,
    from,
    to,
    convertedAmount: amount * record.rate,
    rate: record.rate,
    rateAsOf: record.asOf,
  };
}
