/**
 * @domio/payout-executor-worker — Phase 19 WS-MKT-7 payout executor worker.
 *
 * Processes eligible revenue-share events and disburses creator payouts:
 *   - Groups eligible events by creator
 *   - Skips creators below minimum payout or failing hold checks
 *   - Transfers funds via the creator's verified payout method
 *   - Records ledger entries with idempotent dedup
 *
 * The provider interface is injected; InMemoryPayoutProvider is the
 * default for unit testing.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PayoutPolicy {
  readonly split_creator_bps: number;
  readonly split_platform_bps: number;
  readonly min_payout_cents: number;
  readonly first_payout_hold_days: number;
}

export interface CreatorPayoutMethod {
  readonly kind: 'stripe_connect' | 'bkash' | 'nagad' | 'bank';
  readonly external_account_id: string;
  readonly verified: boolean;
}

export interface EligibleRevenueShareEvent {
  readonly event_id: string;
  readonly creator_id: string;
  readonly gross_cents: number;
  readonly fee_cents: number;
  readonly net_cents: number;
  readonly currency: string;
  readonly period_month: string;
}

export interface TransferRequest {
  readonly creator_id: string;
  readonly amount_cents: number;
  readonly currency: string;
  readonly idempotency_key: string;
  readonly method: CreatorPayoutMethod;
}

export interface TransferResult {
  readonly provider_transfer_id: string;
  readonly status: 'pending' | 'completed' | 'failed';
}

export interface PayoutRun {
  readonly run_id: string;
}

export interface PayoutLedgerEntry {
  readonly executor_run_id: string;
  readonly event_id: string;
  readonly creator_id: string;
  readonly period_month: string;
  readonly gross_cents: number;
  readonly fee_cents: number;
  readonly net_cents: number;
  readonly currency: string;
  readonly provider: string;
  readonly provider_transfer_id: string;
}

export interface PayoutProvider {
  /** List eligible revenue_share_events for a given period_month (payout_status='eligible'). */
  listEligibleEvents(period_month: string): Promise<readonly EligibleRevenueShareEvent[]>;
  /** Get the platform payout policy (splits, minimums, hold periods). */
  getPayoutPolicy(): Promise<PayoutPolicy>;
  /** Get a creator's verified payout method, or null if none/ unverified. */
  getCreatorPayoutMethod(creator_id: string): Promise<CreatorPayoutMethod | null>;
  /** Check if a creator is eligible for payout (payout_ready + hold period met). */
  creatorEligibleForPayout(creator_id: string, now: Date): Promise<boolean>;
  /** Execute a transfer to a creator. */
  transfer(req: TransferRequest): Promise<TransferResult>;
  /** Create a payout run record and return its run_id. */
  createPayoutRun(
    period_month: string,
    totals: { creators_paid: number; total_payout_cents: number },
  ): Promise<PayoutRun>;
  /** Record a ledger entry (deduped by executor_run_id + event_id). */
  createPayoutLedgerEntry(
    entry: Omit<PayoutLedgerEntry, 'executor_run_id'> & { executor_run_id: string },
  ): Promise<void>;
}

export interface PayoutExecutorResult {
  readonly run_id: string;
  readonly creators_paid: number;
  readonly total_payout_cents: number;
  readonly skipped: number;
  readonly failed: number;
}

export interface Logger {
  info(msg: string, data?: Record<string, unknown>): void;
  error(msg: string, data?: Record<string, unknown>): void;
  warn(msg: string, data?: Record<string, unknown>): void;
}

export interface PayoutExecutorWorkerOptions {
  readonly provider: PayoutProvider;
  readonly now?: () => Date;
  readonly logger?: Logger;
  readonly tickMs?: number;
}

// ---------------------------------------------------------------------------
// In-memory provider (default / test helper)
// ---------------------------------------------------------------------------

export class InMemoryPayoutProvider implements PayoutProvider {
  private readonly events: EligibleRevenueShareEvent[] = [];
  private readonly policy: PayoutPolicy = {
    split_creator_bps: 7000,
    split_platform_bps: 3000,
    min_payout_cents: 5000,
    first_payout_hold_days: 30,
  };
  private readonly payoutMethods = new Map<string, CreatorPayoutMethod>();
  private readonly creatorCreated = new Map<string, Date>();
  private readonly ledgerEntries: PayoutLedgerEntry[] = [];
  private readonly ledgerDedup = new Set<string>();
  public readonly transfers: TransferRequest[] = [];
  public readonly transferResults: TransferResult[] = [];
  public failedCreatorIds = new Set<string>();
  private runCounter = 0;

  constructor(opts?: {
    events?: EligibleRevenueShareEvent[];
    policy?: Partial<PayoutPolicy>;
    payoutMethods?: Map<string, CreatorPayoutMethod>;
    creatorCreated?: Map<string, Date>;
    transferResults?: TransferResult[];
  }) {
    if (opts?.events) this.events = [...opts.events];
    if (opts?.policy) Object.assign(this.policy, opts.policy);
    if (opts?.payoutMethods) this.payoutMethods = new Map(opts.payoutMethods);
    if (opts?.creatorCreated) this.creatorCreated = new Map(opts.creatorCreated);
    if (opts?.transferResults) this.transferResults = [...opts.transferResults];
  }

  async listEligibleEvents(period_month: string): Promise<readonly EligibleRevenueShareEvent[]> {
    return this.events.filter((e) => e.period_month === period_month);
  }

  async getPayoutPolicy(): Promise<PayoutPolicy> {
    return { ...this.policy };
  }

  async getCreatorPayoutMethod(creator_id: string): Promise<CreatorPayoutMethod | null> {
    return this.payoutMethods.get(creator_id) ?? null;
  }

  async creatorEligibleForPayout(creator_id: string, now: Date): Promise<boolean> {
    const created = this.creatorCreated.get(creator_id);
    if (!created) return false;
    const holdMs = this.policy.first_payout_hold_days * 24 * 60 * 60 * 1000;
    return now.getTime() - created.getTime() >= holdMs;
  }

  async transfer(req: TransferRequest): Promise<TransferResult> {
    this.transfers.push(req);
    if (this.failedCreatorIds.has(req.creator_id)) {
      throw new Error(`Transfer failed for creator ${req.creator_id}`);
    }
    const idx = this.transfers.length - 1;
    const result: TransferResult = this.transferResults[idx] ?? {
      provider_transfer_id: `px_${req.creator_id}_${req.idempotency_key}`,
      status: 'completed',
    };
    return result;
  }

  async createPayoutRun(
    _period_month: string,
    _totals: { creators_paid: number; total_payout_cents: number },
  ): Promise<PayoutRun> {
    this.runCounter++;
    return { run_id: `run_${this.runCounter}_${Date.now()}` };
  }

  async createPayoutLedgerEntry(entry: PayoutLedgerEntry): Promise<void> {
    const dedupKey = `${entry.executor_run_id}:${entry.event_id}`;
    if (this.ledgerDedup.has(dedupKey)) return; // idempotent skip
    this.ledgerDedup.add(dedupKey);
    this.ledgerEntries.push({ ...entry });
  }

  /** Test helper: get all ledger entries. */
  getLedgerEntries(): readonly PayoutLedgerEntry[] {
    return [...this.ledgerEntries];
  }

  /** Test helper: check if an event has a ledger entry for a given run. */
  hasLedgerEntry(run_id: string, event_id: string): boolean {
    return this.ledgerDedup.has(`${run_id}:${event_id}`);
  }
}

// ---------------------------------------------------------------------------
// Worker
// ---------------------------------------------------------------------------

export class PayoutExecutorWorker {
  private readonly provider: PayoutProvider;
  private readonly nowFn: () => Date;
  private readonly tickMs: number;
  private readonly logger: Logger;
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(opts: PayoutExecutorWorkerOptions) {
    if (!opts.provider) throw new Error('PayoutExecutorWorker: provider is required');
    this.provider = opts.provider;
    this.nowFn = opts.now ?? (() => new Date());
    this.tickMs = opts.tickMs ?? Number(process.env['WORKER_TICK_MS'] ?? '60000');
    this.logger = opts.logger ?? {
      info: () => {
        /* noop */
      },
      error: () => {
        /* noop */
      },
      warn: () => {
        /* noop */
      },
    };
  }

  /**
   * Start the worker timer loop.
   */
  start(): void {
    if (this.running) return;
    this.running = true;
    this.timer = setInterval(() => {
      void this.runOnce({ period_month: this.currentPeriodMonth() });
    }, this.tickMs);
    this.logger.info('PayoutExecutorWorker started', { tickMs: this.tickMs });
  }

  /**
   * Stop the worker timer loop.
   */
  stop(): void {
    this.running = false;
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.logger.info('PayoutExecutorWorker stopped');
  }

  /**
   * Run a single payout execution pass for the given period_month.
   *
   * Logic:
   *   1. Fetch eligible events for the period
   *   2. Group events by creator_id
   *   3. For each creator:
   *      a. Skip if net sum < min_payout_cents
   *      b. Skip if not eligible for payout (hold period)
   *      c. Skip if no verified payout method
   *      d. Transfer with idempotency_key = `${run_id}:${creator_id}`
   *      e. Record ledger entries per event
   *   4. Partial failure does NOT roll back batch
   *   5. Create payout_run row
   *   6. Return counts
   */
  async runOnce(opts?: { period_month?: string }): Promise<PayoutExecutorResult> {
    const period_month = opts?.period_month ?? this.currentPeriodMonth();
    const now = this.nowFn();

    let run_id = '';
    let creators_paid = 0;
    let total_payout_cents = 0;
    let skipped = 0;
    let failed = 0;

    try {
      const [events, policy] = await Promise.all([
        this.provider.listEligibleEvents(period_month),
        this.provider.getPayoutPolicy(),
      ]);

      // Group events by creator_id
      const byCreator = new Map<string, EligibleRevenueShareEvent[]>();
      for (const event of events) {
        const arr = byCreator.get(event.creator_id) ?? [];
        arr.push(event);
        byCreator.set(event.creator_id, arr);
      }

      // Create run first so we have the run_id for ledger entries
      const run = await this.provider.createPayoutRun(period_month, {
        creators_paid: 0,
        total_payout_cents: 0,
      });
      run_id = run.run_id;

      for (const [creator_id, creatorEvents] of byCreator) {
        // Calculate net sum for this creator
        const creator_net = creatorEvents.reduce((sum, e) => sum + e.net_cents, 0);

        // Skip below minimum
        if (creator_net < policy.min_payout_cents) {
          skipped++;
          continue;
        }

        // Check hold period
        const eligible = await this.provider.creatorEligibleForPayout(creator_id, now);
        if (!eligible) {
          skipped++;
          continue;
        }

        // Check for verified payout method
        const method = await this.provider.getCreatorPayoutMethod(creator_id);
        if (!method || !method.verified) {
          skipped++;
          continue;
        }

        // Attempt transfer (partial failure does not roll back)
        try {
          const idempotency_key = `${run_id}:${creator_id}`;
          const transferResult = await this.provider.transfer({
            creator_id,
            amount_cents: creator_net,
            currency: creatorEvents[0]?.currency ?? 'USD',
            idempotency_key,
            method,
          });

          // Record ledger entries for each event
          for (const event of creatorEvents) {
            await this.provider.createPayoutLedgerEntry({
              executor_run_id: run_id,
              event_id: event.event_id,
              creator_id,
              period_month,
              gross_cents: event.gross_cents,
              fee_cents: event.fee_cents,
              net_cents: event.net_cents,
              currency: event.currency,
              provider: method.kind,
              provider_transfer_id: transferResult.provider_transfer_id,
            });
          }

          creators_paid++;
          total_payout_cents += creator_net;
        } catch (err) {
          failed++;
          this.logger.error('Failed to transfer to creator', {
            creator_id,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      this.logger.info('PayoutExecutorWorker pass complete', {
        run_id,
        creators_paid,
        total_payout_cents,
        skipped,
        failed,
      });
    } catch (err) {
      this.logger.error('PayoutExecutorWorker pass failed', {
        error: err instanceof Error ? err.message : String(err),
      });
    }

    return { run_id, creators_paid, total_payout_cents, skipped, failed };
  }

  /**
   * Check if the worker is running.
   */
  get isRunning(): boolean {
    return this.running;
  }

  /**
   * Derive current period month (YYYY-MM) from now.
   */
  private currentPeriodMonth(): string {
    const d = this.nowFn();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
  }
}
