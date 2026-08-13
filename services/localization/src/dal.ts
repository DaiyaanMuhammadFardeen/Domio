/**
 * Localization DAL — repository interfaces + in-memory implementations.
 *
 * Shapes mirror the Postgres tables for exchange-rate snapshots and
 * locale configuration.
 */

// ---------------------------------------------------------------------------
// Record types
// ---------------------------------------------------------------------------

export interface ExchangeRateRecord {
  readonly pair: string; // e.g. "USD/EUR"
  readonly rate: number;
  readonly asOf: Date;
}

export interface LocaleConfigRecord {
  readonly localeId: string; // e.g. "en-US", "de-DE"
  readonly currency: string; // e.g. "USD", "EUR"
  readonly numberFormat: string; // e.g. "#,##0.00"
  readonly dateFormat: string; // e.g. "MM/dd/yyyy"
}

// ---------------------------------------------------------------------------
// Repository interfaces
// ---------------------------------------------------------------------------

export interface ExchangeRateRepository {
  upsert(record: ExchangeRateRecord): Promise<void>;
  find(pair: string): Promise<ExchangeRateRecord | null>;
  findAsOf(pair: string, asOf: Date): Promise<ExchangeRateRecord | null>;
  list(): Promise<ExchangeRateRecord[]>;
}

export interface LocaleConfigRepository {
  upsert(record: LocaleConfigRecord): Promise<void>;
  findById(localeId: string): Promise<LocaleConfigRecord | null>;
  list(): Promise<LocaleConfigRecord[]>;
}

// ---------------------------------------------------------------------------
// In-memory implementations
// ---------------------------------------------------------------------------

export class InMemoryExchangeRateRepository implements ExchangeRateRepository {
  private store = new Map<string, ExchangeRateRecord[]>();

  async upsert(record: ExchangeRateRecord): Promise<void> {
    const existing = this.store.get(record.pair) ?? [];
    // Replace if same asOf, otherwise append
    const filtered = existing.filter((r) => r.asOf.getTime() !== record.asOf.getTime());
    filtered.push(record);
    this.store.set(record.pair, filtered);
  }

  async find(pair: string): Promise<ExchangeRateRecord | null> {
    const rates = this.store.get(pair) ?? [];
    if (rates.length === 0) return null;
    // Return latest by asOf
    return rates.reduce((latest, r) => (r.asOf > latest.asOf ? r : latest));
  }

  async findAsOf(pair: string, asOf: Date): Promise<ExchangeRateRecord | null> {
    const rates = this.store.get(pair) ?? [];
    // Find latest rate at or before asOf
    const candidates = rates.filter((r) => r.asOf <= asOf);
    if (candidates.length === 0) return null;
    return candidates.reduce((latest, r) => (r.asOf > latest.asOf ? r : latest));
  }

  async list(): Promise<ExchangeRateRecord[]> {
    const all: ExchangeRateRecord[] = [];
    for (const rates of this.store.values()) {
      all.push(...rates);
    }
    return all;
  }
}

export class InMemoryLocaleConfigRepository implements LocaleConfigRepository {
  private store = new Map<string, LocaleConfigRecord>();

  async upsert(record: LocaleConfigRecord): Promise<void> {
    this.store.set(record.localeId, record);
  }

  async findById(localeId: string): Promise<LocaleConfigRecord | null> {
    return this.store.get(localeId) ?? null;
  }

  async list(): Promise<LocaleConfigRecord[]> {
    return [...this.store.values()];
  }
}
