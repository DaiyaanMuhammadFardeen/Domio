/**
 * @domio/subscription-billing-worker — Phase 19 WS-MKT-4 subscription billing worker.
 *
 * Processes subscription cancellation lifecycle:
 *   (a) Subscriptions past cancel_at_period_end → provider.cancelSubscription()
 *   (b) Subscriptions past grace_ends_at (not yet revoked) → revoke license
 *
 * The provider interface is injected; InMemorySubscriptionProvider is the
 * default for unit testing.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SubscriptionRecord {
  readonly id: string;
  readonly workspaceId: string;
  readonly listingId: string;
  readonly buyerId: string;
  readonly providerSubscriptionId: string | null;
  readonly status: 'active' | 'past_due' | 'canceled' | 'incomplete';
  readonly currentPeriodEnd: Date | null;
  readonly cancelAtPeriodEnd: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly canceledAt: Date | null;
  readonly graceEndsAt: Date | null;
  readonly revokedAt: Date | null;
}

export interface SubscriptionProvider {
  /** Subscriptions where cancel_at_period_end is set and current_period_end <= now. */
  listDueForCancellation(now: Date): Promise<readonly SubscriptionRecord[]>;
  /** Subscriptions where grace_ends_at <= now and revoked_at IS NULL. */
  listGraceExpired(now: Date): Promise<readonly SubscriptionRecord[]>;
  /** Mark subscription as canceled (sets canceled_at, status = 'canceled'). */
  cancelSubscription(sub: SubscriptionRecord): Promise<void>;
  /** Revoke license after grace period (sets revoked_at). */
  revokeSubscription(sub: SubscriptionRecord): Promise<void>;
}

export interface SubscriptionBillingResult {
  readonly scanned: number;
  readonly canceled: number;
  readonly revoked: number;
}

export interface Logger {
  info(msg: string, data?: Record<string, unknown>): void;
  error(msg: string, data?: Record<string, unknown>): void;
  warn(msg: string, data?: Record<string, unknown>): void;
}

export interface SubscriptionBillingWorkerOptions {
  readonly provider: SubscriptionProvider;
  readonly now?: () => Date;
  readonly logger?: Logger;
  readonly tickMs?: number;
}

// ---------------------------------------------------------------------------
// In-memory provider (default / test helper)
// ---------------------------------------------------------------------------

export class InMemorySubscriptionProvider implements SubscriptionProvider {
  private readonly subscriptions: SubscriptionRecord[] = [];
  public readonly canceledIds: string[] = [];
  public readonly revokedIds: string[] = [];

  constructor(subs?: SubscriptionRecord[]) {
    if (subs) {
      this.subscriptions = [...subs];
    }
  }

  async listDueForCancellation(now: Date): Promise<readonly SubscriptionRecord[]> {
    return this.subscriptions.filter(
      (s) =>
        s.cancelAtPeriodEnd &&
        s.status !== 'canceled' &&
        s.currentPeriodEnd !== null &&
        s.currentPeriodEnd <= now,
    );
  }

  async listGraceExpired(now: Date): Promise<readonly SubscriptionRecord[]> {
    return this.subscriptions.filter(
      (s) => s.graceEndsAt !== null && s.graceEndsAt <= now && s.revokedAt === null,
    );
  }

  async cancelSubscription(sub: SubscriptionRecord): Promise<void> {
    this.canceledIds.push(sub.id);
  }

  async revokeSubscription(sub: SubscriptionRecord): Promise<void> {
    this.revokedIds.push(sub.id);
  }

  /** Test helper: add a subscription record directly. */
  add(sub: SubscriptionRecord): void {
    this.subscriptions.push(sub);
  }
}

// ---------------------------------------------------------------------------
// Worker
// ---------------------------------------------------------------------------

export class SubscriptionBillingWorker {
  private readonly provider: SubscriptionProvider;
  private readonly nowFn: () => Date;
  private readonly tickMs: number;
  private readonly logger: Logger;
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(opts: SubscriptionBillingWorkerOptions) {
    if (!opts.provider) throw new Error('SubscriptionBillingWorker: provider is required');
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
      void this.runOnce();
    }, this.tickMs);
    this.logger.info('SubscriptionBillingWorker started', { tickMs: this.tickMs });
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
    this.logger.info('SubscriptionBillingWorker stopped');
  }

  /**
   * Run a single billing pass:
   *   (a) Cancel subscriptions past cancel_at_period_end
   *   (b) Revoke subscriptions past grace_ends_at
   *
   * Returns aggregate counts.
   */
  async runOnce(): Promise<SubscriptionBillingResult> {
    let scanned = 0;
    let canceled = 0;
    let revoked = 0;

    try {
      const now = this.nowFn();

      // (a) Cancel subscriptions due for final billing
      const dueForCancellation = await this.provider.listDueForCancellation(now);
      scanned += dueForCancellation.length;

      for (const sub of dueForCancellation) {
        try {
          await this.provider.cancelSubscription(sub);
          canceled++;
        } catch (err) {
          this.logger.error('Failed to cancel subscription', {
            subscriptionId: sub.id,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      // (b) Revoke subscriptions whose grace period has expired
      const graceExpired = await this.provider.listGraceExpired(now);
      scanned += graceExpired.length;

      for (const sub of graceExpired) {
        try {
          await this.provider.revokeSubscription(sub);
          revoked++;
        } catch (err) {
          this.logger.error('Failed to revoke subscription', {
            subscriptionId: sub.id,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      this.logger.info('SubscriptionBillingWorker pass complete', {
        scanned,
        canceled,
        revoked,
      });
    } catch (err) {
      this.logger.error('SubscriptionBillingWorker pass failed', {
        error: err instanceof Error ? err.message : String(err),
      });
    }

    return { scanned, canceled, revoked };
  }

  /**
   * Check if the worker is running.
   */
  get isRunning(): boolean {
    return this.running;
  }
}
