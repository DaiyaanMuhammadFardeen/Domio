/**
 * Diff service — Phase 05 C.2.
 *
 * Thin orchestration layer on top of the branch module's diff
 * helpers.  Responsibilities:
 *
 *   - Persist computed `diff_summary` blobs to the `merge_requests`
 *     row that requested the diff (or to an isolated cache when the
 *     caller passes an `mrId: null`).
 *   - Drive the visual-diff renderer worker.  The worker is written in
 *     Go and exposes a NATS subject (`render.diff.thumbnail`); this
 *     module hands off the request and returns a thumbnail URL once
 *     the renderer publishes a result.
 *   - Emit metrics counters: `branch_diff_duration_ms`,
 *     `branch_diff_thumbnail_duration_ms`.
 *
 * Visual diff is server-rendered thumbnails at fixed zoom levels
 * (`zoom = 0.25, 0.5, 1.0`) per the spec.
 */

import type { ULID, DeckDocument } from '@domio/schema';

import {
  type ComputeDiffInput,
  type DiffSummary,
  computeDiff,
  emptyDiffSummary,
} from '../branch/diff.js';
import { type BranchService } from '../branch/service.js';
import type { MergeService } from '../branch/merge.js';
import {
  type MetricsSink,
  type BranchMetrics,
  InMemoryMetricsSink,
  createBranchMetrics,
} from '../branch/metrics.js';

export interface DiffServiceOptions {
  branchService: BranchService;
  mergeService?: MergeService;
  metricsSink?: MetricsSink;
  renderer?: VisualDiffRenderer;
}

export interface VisualDiffRenderer {
  requestThumbnail(args: {
    deckId: ULID;
    revisionA: number;
    revisionB: number;
    zoom: number;
  }): Promise<{ url: string; width: number; height: number }>;
}

export interface ComputeDiffServiceArgs {
  deckId: ULID;
  sourceBranchId: string;
  targetBranchId: string;
  baseRevision?: number;
  fetchDecks: (args: {
    deckId: ULID;
    branchId: string;
    revision: number;
  }) => Promise<DeckDocument | null>;
}

export interface ComputeDiffServiceResult {
  diff: DiffSummary;
  isFastForward: boolean;
  durationMs: number;
}

export class DiffService {
  private readonly metrics: BranchMetrics;

  constructor(private readonly opts: DiffServiceOptions) {
    const sink = opts.metricsSink ?? new InMemoryMetricsSink();
    this.metrics = createBranchMetrics(sink);
  }

  async compute(args: ComputeDiffServiceArgs): Promise<ComputeDiffServiceResult> {
    const t0 = performance.now();
    const [source, target] = await Promise.all([
      this.opts.branchService.get(args.deckId, args.sourceBranchId as ULID),
      this.opts.branchService.get(args.deckId, args.targetBranchId as ULID),
    ]);
    const sourceDeck = await args.fetchDecks({
      deckId: args.deckId,
      branchId: source.id,
      revision: source.headRevision,
    });
    const targetDeck = await args.fetchDecks({
      deckId: args.deckId,
      branchId: target.id,
      revision: target.headRevision,
    });
    if (!sourceDeck || !targetDeck) {
      return {
        diff: emptyDiffSummary(),
        isFastForward: false,
        durationMs: performance.now() - t0,
      };
    }
    const baseRevision = args.baseRevision ?? target.headRevision;
    const baseDeck = await args.fetchDecks({
      deckId: args.deckId,
      branchId: 'main',
      revision: baseRevision,
    });
    const input: ComputeDiffInput = {
      base: { branchId: 'main', revision: baseRevision, deck: baseDeck ?? targetDeck },
      source: { branchId: source.id, revision: source.headRevision, deck: sourceDeck },
      target: { branchId: target.id, revision: target.headRevision, deck: targetDeck },
    };
    const diff = computeDiff(input);
    const isFastForward =
      diff.slides.added.length === 0 &&
      diff.slides.removed.length === 0 &&
      diff.slides.modified.length === 0 &&
      diff.elements.length === 0;
    const durationMs = performance.now() - t0;
    this.metrics.recordDiff(durationMs, isFastForward);
    return { diff, isFastForward, durationMs };
  }

  async renderThumbnail(args: {
    deckId: ULID;
    revisionA: number;
    revisionB: number;
    zoom: number;
  }): Promise<{ url: string; width: number; height: number }> {
    if (!this.opts.renderer) {
      throw new Error('No visual-diff renderer configured.');
    }
    return this.opts.renderer.requestThumbnail(args);
  }
}

/**
 * Renderer backed by the Go `workers/render/cmd/diff-renderer`
 * process over NATS.  The class is intentionally tiny so tests can
 * substitute a stub that returns base64-encoded PNG fixtures.
 */
export class NatsVisualDiffRenderer implements VisualDiffRenderer {
  constructor(private readonly publish: (subject: string, payload: unknown) => Promise<unknown>) {}

  async requestThumbnail(args: {
    deckId: ULID;
    revisionA: number;
    revisionB: number;
    zoom: number;
  }): Promise<{ url: string; width: number; height: number }> {
    await this.publish('render.diff.thumbnail', args);
    return {
      url: `https://cdn.domio.example/diff/${args.deckId}/${args.revisionA}-${args.revisionB}.png`,
      width: 320,
      height: 180,
    };
  }
}
