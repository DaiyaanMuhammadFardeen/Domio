/**
 * Notification dispatcher — mention deduplication.
 *
 * Uses a sliding-window counter per recipient to suppress excessive
 * notifications. Within a configurable window (default 30s), only
 * the first N mentions (default 5) are delivered; subsequent mentions
 * are deduped (suppressed).
 *
 * This is an in-memory implementation. Persistent/Redis-backed dedup,
 * DND quiet-hours, and daily digests are later waves.
 */

export class MentionDedup {
  private readonly mentions = new Map<string, number[]>();
  private readonly windowMs: number;
  private readonly maxCount: number;

  constructor(opts: { windowMs?: number; maxCount?: number } = {}) {
    this.windowMs = opts.windowMs ?? 30_000;
    this.maxCount = opts.maxCount ?? 5;
  }

  /**
   * isDeduped returns true if the mention should be suppressed
   * (the recipient has already received maxCount mentions within
   * the sliding window).
   *
   * Timestamps outside the window are pruned on every call so the
   * map doesn't grow unbounded.
   */
  isDeduped(recipientId: string, ts: number): boolean {
    const timestamps = this.mentions.get(recipientId) ?? [];
    // Prune timestamps outside the window.
    const valid = timestamps.filter((t) => ts - t < this.windowMs);

    const deduped = valid.length >= this.maxCount;

    // Always track the new timestamp so the window stays accurate.
    valid.push(ts);
    this.mentions.set(recipientId, valid);

    return deduped;
  }
}
