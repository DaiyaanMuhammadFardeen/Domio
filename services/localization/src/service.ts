/**
 * Localization service — formatting, exchange-rate management.
 *
 * The service is the entry point for all business logic.  REST handlers
 * wrap this service; the Postgres DAL is swapped in at composition time.
 */

import type { ExchangeRateRepository, LocaleConfigRepository } from './dal.js';
import {
  formatNumber as fmtNumber,
  formatCurrency as fmtCurrency,
  formatPercent as fmtPercent,
  formatDate as fmtDate,
} from './format.js';
import {
  ingestRates as doIngestRates,
  convert as doConvert,
  type RateSnapshot,
  type ConversionResult,
} from './rates.js';

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export { MissingRateError } from './rates.js';

export class InvalidLocaleError extends Error {
  readonly code = 'INVALID_LOCALE' as const;
  constructor(public readonly locale: string) {
    super(`Invalid locale: ${locale}`);
    this.name = 'InvalidLocaleError';
  }
}

export class InvalidCurrencyError extends Error {
  readonly code = 'INVALID_CURRENCY' as const;
  constructor(public readonly currency: string) {
    super(`Invalid currency code: ${currency}`);
    this.name = 'InvalidCurrencyError';
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LocalizationServiceOptions {
  readonly exchangeRates: ExchangeRateRepository;
  readonly localeConfigs: LocaleConfigRepository;
  readonly clock?: () => Date;
}

export interface FormatInput {
  readonly value: number;
  readonly locale: string;
  readonly style?: 'decimal' | 'currency' | 'percent';
  readonly currency?: string;
  readonly decimals?: number;
}

export interface ConvertInput {
  readonly amount: number;
  readonly from: string;
  readonly to: string;
  readonly asOf?: Date;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

const VALID_CURRENCY_PATTERN = /^[A-Z]{3}$/;

export class LocalizationService {
  private readonly exchangeRates: ExchangeRateRepository;

  constructor(opts: LocalizationServiceOptions) {
    this.exchangeRates = opts.exchangeRates;
    void opts.localeConfigs; // reserved for future locale-config lookup
    void opts.clock; // reserved for clock-sensitive operations
  }

  // -------------------------------------------------------------------------
  // Formatting
  // -------------------------------------------------------------------------

  formatNumber(input: FormatInput): string {
    if (!this.isValidLocale(input.locale)) {
      throw new InvalidLocaleError(input.locale);
    }
    if (input.currency && !VALID_CURRENCY_PATTERN.test(input.currency)) {
      throw new InvalidCurrencyError(input.currency);
    }
    return fmtNumber(input.value, {
      locale: input.locale,
      ...(input.style !== undefined ? { style: input.style } : {}),
      ...(input.currency !== undefined ? { currency: input.currency } : {}),
      ...(input.decimals !== undefined ? { decimals: input.decimals } : {}),
    });
  }

  formatCurrency(input: FormatInput & { currency: string }): string {
    if (!this.isValidLocale(input.locale)) {
      throw new InvalidLocaleError(input.locale);
    }
    if (!VALID_CURRENCY_PATTERN.test(input.currency)) {
      throw new InvalidCurrencyError(input.currency);
    }
    return fmtCurrency(input.value, {
      locale: input.locale,
      currency: input.currency,
      ...(input.decimals !== undefined ? { decimals: input.decimals } : {}),
    });
  }

  formatPercent(input: FormatInput): string {
    if (!this.isValidLocale(input.locale)) {
      throw new InvalidLocaleError(input.locale);
    }
    return fmtPercent(input.value, {
      locale: input.locale,
      ...(input.decimals !== undefined ? { decimals: input.decimals } : {}),
    });
  }

  formatDate(
    date: Date,
    opts: {
      locale: string;
      dateStyle?: 'full' | 'long' | 'medium' | 'short';
      timeStyle?: 'full' | 'long' | 'medium' | 'short';
    },
  ): string {
    if (!this.isValidLocale(opts.locale)) {
      throw new InvalidLocaleError(opts.locale);
    }
    return fmtDate(date, opts);
  }

  // -------------------------------------------------------------------------
  // Exchange rates
  // -------------------------------------------------------------------------

  async ingestRates(pairs: readonly RateSnapshot[]): Promise<void> {
    return doIngestRates(this.exchangeRates, pairs);
  }

  async convert(input: ConvertInput): Promise<ConversionResult> {
    return doConvert(this.exchangeRates, input.amount, input.from, input.to, input.asOf);
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  private isValidLocale(locale: string): boolean {
    try {
      // Intl.DateTimeFormat will throw RangeError for invalid locales
      new Intl.DateTimeFormat(locale);
      return true;
    } catch {
      return false;
    }
  }
}
