/**
 * @domio/refund-processor-worker — Phase 19 WS-MKT-4 refund processor worker.
 *
 * Processes payment intents with refund_status 'requested':
 *   - Calls provider.approveRefund() to mark them 'refunded'
 *   - Also handles the transition from 'requested' → 'refunded' on the
 *     payment_intent table
 *
 * The provider interface is injected; InMemoryRefundProvider is the
 * default for unit testing.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PaymentIntentRecord {
  readonly id: string;
  readonly workspaceId: string;
  readonly buyerId: string;
  readonly listingId: string;
  readonly purchaseId: string;
  readonly provider: 'stripe' | 'bkash' | 'nagad';
  readonly providerIntentId: string | null;
  readonly currency: string;
  readonly grossCents: bigint;
  readonly taxCents: bigint;
  readonly feeCents: bigint;
  readonly netCents: bigint;
  readonly status: 'pending' | 'succeeded' | 'failed' | 'refunded' | 'disputed';
  readonly refundStatus: 'none' | 'requested' | 'refunded';
  readonly idempotencyKey: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface RefundProvider {
  /** List payment intents where refund_status = 'requested'. */
  listPendingRefunds(): Promise<readonly PaymentIntentRecord[]>;
  /** Mark a payment intent refund_status as 'refunded'. */
  approveRefund(pi: PaymentIntentRecord): Promise<void>;
}

export interface RefundProcessorResult {
  readonly processed: number;
  readonly approved: number;
}

export interface Logger {
  info(msg: string, data?: Record<string, unknown>): void;
  error(msg: string, data?: Record<string, unknown>): void;
  warn(msg: string, data?: Record<string, unknown>): void;
}

export interface RefundProcessorWorkerOptions {
  readonly provider: RefundProvider;
  readonly now?: () => Date;
  readonly logger?: Logger;
  readonly tickMs?: number;
}

// ---------------------------------------------------------------------------
// In-memory provider (default / test helper)
// ---------------------------------------------------------------------------

export class InMemoryRefundProvider implements RefundProvider {
  private readonly paymentIntents: PaymentIntentRecord[] = [];
  public readonly approvedIds: string[] = [];

  constructor(intents?: PaymentIntentRecord[]) {
    if (intents) {
      this.paymentIntents = [...intents];
    }
  }

  async listPendingRefunds(): Promise<readonly PaymentIntentRecord[]> {
    return this.paymentIntents.filter((pi) => pi.refundStatus === 'requested');
  }

  async approveRefund(pi: PaymentIntentRecord): Promise<void> {
    this.approvedIds.push(pi.id);
  }

  /** Test helper: add a payment intent record directly. */
  add(pi: PaymentIntentRecord): void {
    this.paymentIntents.push(pi);
  }
}

// ---------------------------------------------------------------------------
// Worker
// ---------------------------------------------------------------------------

export class RefundProcessorWorker {
  private readonly provider: RefundProvider;
  private readonly tickMs: number;
  private readonly logger: Logger;
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(opts: RefundProcessorWorkerOptions) {
    if (!opts.provider) throw new Error('RefundProcessorWorker: provider is required');
    this.provider = opts.provider;
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
    this.logger.info('RefundProcessorWorker started', { tickMs: this.tickMs });
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
    this.logger.info('RefundProcessorWorker stopped');
  }

  /**
   * Run a single refund processing pass:
   *   Fetches payment intents with refund_status = 'requested'
   *   and approves each one.
   *
   * Returns aggregate counts.
   */
  async runOnce(): Promise<RefundProcessorResult> {
    let processed = 0;
    let approved = 0;

    try {
      const pending = await this.provider.listPendingRefunds();
      processed += pending.length;

      for (const pi of pending) {
        try {
          await this.provider.approveRefund(pi);
          approved++;
        } catch (err) {
          this.logger.error('Failed to approve refund', {
            paymentIntentId: pi.id,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      this.logger.info('RefundProcessorWorker pass complete', {
        processed,
        approved,
      });
    } catch (err) {
      this.logger.error('RefundProcessorWorker pass failed', {
        error: err instanceof Error ? err.message : String(err),
      });
    }

    return { processed, approved };
  }

  /**
   * Check if the worker is running.
   */
  get isRunning(): boolean {
    return this.running;
  }
}
