/**
 * @domio/kyc-rescreen-worker — Phase 19 WS-MKT-6 nightly identity drift & sanctions rescreen.
 *
 * Iterates over all approved creators, runs identity/sanctions checks,
 * and applies decisions (freeze for sanctions, flag for review for PEP).
 *
 * The provider interface is injected; InMemoryRescreenProvider is the
 * default for unit testing.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CreatorRecord {
  readonly creator_id: string;
  readonly display_name: string;
  readonly country_code: string;
  readonly kyc_status: 'approved' | 'frozen' | 'rejected';
}

export interface IdentityCheckResult {
  readonly hit: boolean;
  readonly kind?: 'pep' | 'sanctions';
  readonly matched_entity?: string;
}

export interface RescreenHitRecord {
  readonly creator_id: string;
  readonly kind: 'pep' | 'sanctions';
  readonly matched_entity: string;
  readonly decision: 'freeze' | 'review';
  readonly recorded_at: Date;
}

export interface RescreenProvider {
  /** List creators with kyc_status = 'approved' (not frozen/rejected). */
  listApprovedCreators(): Promise<readonly CreatorRecord[]>;
  /** Run identity/sanctions check against a creator. */
  checkIdentity(creator: CreatorRecord): Promise<IdentityCheckResult>;
  /** Record a rescreen hit for audit. */
  recordRescreenHit(hit: Omit<RescreenHitRecord, 'recorded_at'>): Promise<void>;
  /** Freeze a creator (set kyc_status = 'frozen'). */
  freezeCreator(creator_id: string): Promise<void>;
  /** Flag a creator for admin review (keep approved but flag). */
  flagForReview(creator_id: string): Promise<void>;
}

export interface KycRescreenResult {
  readonly scanned: number;
  readonly flagged: number;
  readonly frozen: number;
  readonly reviewed: number;
}

export interface Logger {
  info(msg: string, data?: Record<string, unknown>): void;
  error(msg: string, data?: Record<string, unknown>): void;
  warn(msg: string, data?: Record<string, unknown>): void;
}

export interface KycRescreenWorkerOptions {
  readonly provider: RescreenProvider;
  readonly now?: () => Date;
  readonly logger?: Logger;
  readonly tickMs?: number;
}

// ---------------------------------------------------------------------------
// In-memory rescreen provider (default / test helper)
// ---------------------------------------------------------------------------

export class InMemoryRescreenProvider implements RescreenProvider {
  private readonly creators: CreatorRecord[];
  public readonly hits: RescreenHitRecord[] = [];
  public readonly frozenIds: string[] = [];
  public readonly reviewedIds: string[] = [];

  constructor(creators?: CreatorRecord[]) {
    this.creators = creators ? [...creators] : [];
  }

  async listApprovedCreators(): Promise<readonly CreatorRecord[]> {
    // Only return creators with kyc_status 'approved' (exclude frozen/rejected)
    return this.creators.filter((c) => c.kyc_status === 'approved');
  }

  async checkIdentity(creator: CreatorRecord): Promise<IdentityCheckResult> {
    const name = creator.display_name.toLowerCase();
    if (name.includes('sanc')) {
      return {
        hit: true,
        kind: 'sanctions',
        matched_entity: `sanctions-list-${creator.creator_id}`,
      };
    }
    if (name.includes('pep')) {
      return { hit: true, kind: 'pep', matched_entity: `pep-list-${creator.creator_id}` };
    }
    return { hit: false };
  }

  async recordRescreenHit(hit: Omit<RescreenHitRecord, 'recorded_at'>): Promise<void> {
    this.hits.push({ ...hit, recorded_at: new Date() });
  }

  async freezeCreator(creator_id: string): Promise<void> {
    this.frozenIds.push(creator_id);
    const creator = this.creators.find((c) => c.creator_id === creator_id);
    if (creator) {
      // Mutate to reflect frozen status so listApprovedCreators excludes it
      (creator as { kyc_status: string }).kyc_status = 'frozen';
    }
  }

  async flagForReview(creator_id: string): Promise<void> {
    this.reviewedIds.push(creator_id);
  }
}

// ---------------------------------------------------------------------------
// Worker
// ---------------------------------------------------------------------------

export class KycRescreenWorker {
  private readonly provider: RescreenProvider;
  private readonly tickMs: number;
  private readonly logger: Logger;
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(opts: KycRescreenWorkerOptions) {
    if (!opts.provider) throw new Error('KycRescreenWorker: provider is required');
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
    this.logger.info('KycRescreenWorker started', { tickMs: this.tickMs });
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
    this.logger.info('KycRescreenWorker stopped');
  }

  /**
   * Run a single rescreen pass:
   *   Fetches all approved creators, checks identity/sanctions,
   *   and applies decisions.
   *
   * Returns aggregate counts.
   */
  async runOnce(): Promise<KycRescreenResult> {
    let scanned = 0;
    let flagged = 0;
    let frozen = 0;
    let reviewed = 0;

    try {
      const creators = await this.provider.listApprovedCreators();
      scanned += creators.length;

      for (const creator of creators) {
        try {
          const check = await this.provider.checkIdentity(creator);

          if (check.hit) {
            const decision = check.kind === 'sanctions' ? 'freeze' : 'review';
            const matchedEntity = check.matched_entity ?? 'unknown';

            await this.provider.recordRescreenHit({
              creator_id: creator.creator_id,
              kind: check.kind!,
              matched_entity: matchedEntity,
              decision,
            });

            if (decision === 'freeze') {
              await this.provider.freezeCreator(creator.creator_id);
              frozen++;
            } else {
              await this.provider.flagForReview(creator.creator_id);
              reviewed++;
            }

            flagged++;
          }
        } catch (err) {
          this.logger.error('Failed to rescreen creator', {
            creator_id: creator.creator_id,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      this.logger.info('KycRescreenWorker pass complete', {
        scanned,
        flagged,
        frozen,
        reviewed,
      });
    } catch (err) {
      this.logger.error('KycRescreenWorker pass failed', {
        error: err instanceof Error ? err.message : String(err),
      });
    }

    return { scanned, flagged, frozen, reviewed };
  }

  /**
   * Check if the worker is running.
   */
  get isRunning(): boolean {
    return this.running;
  }
}
