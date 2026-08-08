/**
 * @domio/expiry-scanner — Phase 18 expiry scanner worker.
 *
 * Periodically scans resources for overdue freshness reviews,
 * flags them, and applies escalation actions (notification, share revocation).
 *
 * Modules:
 *   index.ts — worker entry + timer loop
 */

import type { ExpiryService } from '@domio/expiry-service';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ResourceRecord {
  readonly workspaceId: string;
  readonly type: string;
  readonly id: string;
  readonly lastReviewedAt?: Date | null;
}

export interface ResourceProvider {
  /** Returns all resources to scan. */
  getResources(): Promise<ResourceRecord[]>;
}

export interface ScanCounts {
  readonly scanned: number;
  readonly flagged: number;
  readonly revoked: number;
}

export interface Logger {
  info(msg: string, data?: Record<string, unknown>): void;
  error(msg: string, data?: Record<string, unknown>): void;
  warn(msg: string, data?: Record<string, unknown>): void;
}

export interface ExpiryScannerWorkerOptions {
  readonly service: ExpiryService;
  readonly resourceProvider?: ResourceProvider;
  readonly tickMs?: number;
  readonly logger?: Logger;
}

// ---------------------------------------------------------------------------
// Worker
// ---------------------------------------------------------------------------

export class ExpiryScannerWorker {
  private readonly service: ExpiryService;
  private readonly resourceProvider: ResourceProvider;
  private readonly tickMs: number;
  private readonly logger: Logger;
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(opts: ExpiryScannerWorkerOptions) {
    if (!opts.service) throw new Error('ExpiryScannerWorker: service is required');
    this.service = opts.service;
    this.resourceProvider = opts.resourceProvider ?? { getResources: async () => [] };
    this.tickMs = opts.tickMs ?? Number(process.env['WORKER_TICK_MS'] ?? '60000');
    this.logger = opts.logger ?? {
      info: () => { /* noop */ },
      error: () => { /* noop */ },
      warn: () => { /* noop */ },
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
    this.logger.info('ExpiryScannerWorker started', { tickMs: this.tickMs });
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
    this.logger.info('ExpiryScannerWorker stopped');
  }

  /**
   * Run a single scan pass.
   * Fetches resources from provider, scans each workspace, returns counts.
   */
  async runOnce(): Promise<ScanCounts> {
    let totalScanned = 0;
    let totalFlagged = 0;
    let totalRevoked = 0;

    try {
      const resources = await this.resourceProvider.getResources();

      // Group resources by workspace
      const byWorkspace = new Map<string, ResourceRecord[]>();
      for (const r of resources) {
        const list = byWorkspace.get(r.workspaceId) ?? [];
        list.push(r);
        byWorkspace.set(r.workspaceId, list);
      }

      for (const [workspaceId, wsResources] of byWorkspace) {
        const result = await this.service.scanWorkspace(
          workspaceId,
          wsResources.map(r => ({
            type: r.type,
            id: r.id,
            lastReviewedAt: r.lastReviewedAt ?? null,
          })),
        );
        totalScanned += result.scanned;
        totalFlagged += result.flagged;
        totalRevoked += result.revoked;
      }

      this.logger.info('ExpiryScannerWorker scan complete', {
        scanned: totalScanned,
        flagged: totalFlagged,
        revoked: totalRevoked,
      });
    } catch (err) {
      this.logger.error('ExpiryScannerWorker scan failed', {
        error: err instanceof Error ? err.message : String(err),
      });
    }

    return { scanned: totalScanned, flagged: totalFlagged, revoked: totalRevoked };
  }

  /**
   * Check if the worker is running.
   */
  get isRunning(): boolean {
    return this.running;
  }
}
