/**
 * @domio/kyc-poller-worker — Phase 19 WS-MKT-6 KYC session poller.
 *
 * Polls pending KYC sessions from the session provider, queries the
 * vendor (KycClient) for status, and updates the session record.
 *
 * The provider and client interfaces are injected; InMemoryKycSessionProvider
 * and SandboxKycClient are the defaults for unit testing.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type KycSessionStatus = 'submitted' | 'pending' | 'approved' | 'rejected';

export interface KycSessionRecord {
  readonly kyc_session_id: string;
  readonly creator_id: string;
  readonly vendor: string;
  readonly vendor_session_id: string;
  readonly status: KycSessionStatus;
}

export interface KycSessionProvider {
  /** List sessions with status 'submitted' or 'pending'. */
  listPendingSessions(): Promise<readonly KycSessionRecord[]>;
  /** Update a session's status. */
  updateSessionStatus(kyc_session_id: string, status: KycSessionStatus): Promise<void>;
}

export interface KycClient {
  /** Poll the vendor for the current status of a session. */
  pollStatus(opts: {
    kyc_session_id: string;
    vendor: string;
    vendor_session_id: string;
  }): Promise<'pending' | 'submitted' | 'approved' | 'rejected'>;
}

export interface KycPollerResult {
  readonly polled: number;
  readonly approved: number;
  readonly rejected: number;
  readonly still_pending: number;
  readonly errored: number;
}

export interface Logger {
  info(msg: string, data?: Record<string, unknown>): void;
  error(msg: string, data?: Record<string, unknown>): void;
  warn(msg: string, data?: Record<string, unknown>): void;
}

export interface KycPollerWorkerOptions {
  readonly provider: KycSessionProvider;
  readonly kycClient: KycClient;
  readonly now?: () => Date;
  readonly logger?: Logger;
  readonly tickMs?: number;
}

// ---------------------------------------------------------------------------
// In-memory session provider (default / test helper)
// ---------------------------------------------------------------------------

export class InMemoryKycSessionProvider implements KycSessionProvider {
  private readonly sessions: KycSessionRecord[] = [];
  public readonly updated: Array<{ id: string; status: KycSessionStatus }> = [];

  constructor(sessions?: KycSessionRecord[]) {
    if (sessions) {
      this.sessions = [...sessions];
    }
  }

  async listPendingSessions(): Promise<readonly KycSessionRecord[]> {
    return this.sessions.filter((s) => s.status === 'submitted' || s.status === 'pending');
  }

  async updateSessionStatus(kyc_session_id: string, status: KycSessionStatus): Promise<void> {
    this.updated.push({ id: kyc_session_id, status });
  }

  /** Test helper: add a session record directly. */
  add(session: KycSessionRecord): void {
    this.sessions.push(session);
  }
}

// ---------------------------------------------------------------------------
// Sandbox KYC client (deterministic for tests)
// ---------------------------------------------------------------------------

export class SandboxKycClient implements KycClient {
  async pollStatus(opts: {
    kyc_session_id: string;
    vendor: string;
    vendor_session_id: string;
  }): Promise<'pending' | 'submitted' | 'approved' | 'rejected'> {
    const vid = opts.vendor_session_id;
    if (vid.endsWith('-ok')) return 'approved';
    if (vid.endsWith('-no')) return 'rejected';
    return 'pending';
  }
}

// ---------------------------------------------------------------------------
// Worker
// ---------------------------------------------------------------------------

export class KycPollerWorker {
  private readonly provider: KycSessionProvider;
  private readonly kycClient: KycClient;
  private readonly tickMs: number;
  private readonly logger: Logger;
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(opts: KycPollerWorkerOptions) {
    if (!opts.provider) throw new Error('KycPollerWorker: provider is required');
    if (!opts.kycClient) throw new Error('KycPollerWorker: kycClient is required');
    this.provider = opts.provider;
    this.kycClient = opts.kycClient;
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
    this.logger.info('KycPollerWorker started', { tickMs: this.tickMs });
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
    this.logger.info('KycPollerWorker stopped');
  }

  /**
   * Run a single polling pass:
   *   Fetches pending KYC sessions, polls each vendor,
   *   and updates session status accordingly.
   *
   * Returns aggregate counts.
   */
  async runOnce(): Promise<KycPollerResult> {
    let polled = 0;
    let approved = 0;
    let rejected = 0;
    let still_pending = 0;
    let errored = 0;

    try {
      const pending = await this.provider.listPendingSessions();
      polled += pending.length;

      for (const session of pending) {
        try {
          const vendorStatus = await this.kycClient.pollStatus({
            kyc_session_id: session.kyc_session_id,
            vendor: session.vendor,
            vendor_session_id: session.vendor_session_id,
          });

          if (vendorStatus === 'approved') {
            await this.provider.updateSessionStatus(session.kyc_session_id, 'approved');
            approved++;
          } else if (vendorStatus === 'rejected') {
            await this.provider.updateSessionStatus(session.kyc_session_id, 'rejected');
            rejected++;
          } else {
            // still pending or submitted — leave status as-is
            still_pending++;
          }
        } catch (err) {
          errored++;
          this.logger.error('Failed to poll KYC session', {
            kyc_session_id: session.kyc_session_id,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      this.logger.info('KycPollerWorker pass complete', {
        polled,
        approved,
        rejected,
        still_pending,
        errored,
      });
    } catch (err) {
      this.logger.error('KycPollerWorker pass failed', {
        error: err instanceof Error ? err.message : String(err),
      });
    }

    return { polled, approved, rejected, still_pending, errored };
  }

  /**
   * Check if the worker is running.
   */
  get isRunning(): boolean {
    return this.running;
  }
}
