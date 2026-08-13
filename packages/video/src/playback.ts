/**
 * Segment selection logic for HLS/DASH playback.
 *
 * Given a total duration, a segment duration, and a playhead position,
 * computes the active segment index and the next-segment boundary.
 *
 * Supports trim windows: when a trim window {inMs, outMs} is provided,
 * the playhead 0 maps to trim.inMs, and the effective duration is
 * (outMs - inMs). Segments outside the trim window are clipped.
 */

export interface TrimWindow {
  /** Start of the visible range in source-time milliseconds. */
  inMs: number;
  /** End of the visible range in source-time milliseconds. */
  outMs: number;
}

export interface SegmentInfo {
  /** Zero-based index of the active segment. */
  segmentIndex: number;
  /** Source-time milliseconds of the start of the active segment. */
  segmentStartMs: number;
  /** Source-time milliseconds of the next segment boundary (or end of content). */
  segmentEndMs: number;
  /** The effective playhead position within the trimmed region (0 → trim.inMs). */
  effectivePlayheadMs: number;
  /** Total number of segments in the trimmed region. */
  totalSegments: number;
}

/**
 * Compute segment information for a given playhead position.
 *
 * @param durationMs - Total duration of the source in milliseconds.
 * @param segmentDurationMs - Duration of each segment in milliseconds.
 * @param playheadMs - Current playhead position in source-time milliseconds (0-based from start).
 * @param trim - Optional trim window. When provided, playhead 0 maps to trim.inMs.
 * @returns SegmentInfo describing the active segment and boundaries.
 */
export function getSegmentInfo(
  durationMs: number,
  segmentDurationMs: number,
  playheadMs: number,
  trim?: TrimWindow,
): SegmentInfo {
  if (durationMs <= 0) {
    return {
      segmentIndex: 0,
      segmentStartMs: 0,
      segmentEndMs: 0,
      effectivePlayheadMs: 0,
      totalSegments: 0,
    };
  }

  if (segmentDurationMs <= 0) {
    throw new Error('segmentDurationMs must be greater than 0');
  }

  const effectiveDurationMs = trim ? trim.outMs - trim.inMs : durationMs;
  const effectivePlayheadMs = trim ? playheadMs + trim.inMs : playheadMs;

  // Clamp playhead to valid range within the source
  const clampedPlayheadMs = Math.max(0, Math.min(effectivePlayheadMs, durationMs));

  // Total segments in the trimmed region
  const totalSegments = Math.ceil(effectiveDurationMs / segmentDurationMs);

  // Compute segment index: floor(playhead / segmentDuration) within effective range
  const trimStartMs = trim?.inMs ?? 0;
  const relativePlayhead = Math.max(
    0,
    Math.min(clampedPlayheadMs - trimStartMs, effectiveDurationMs),
  );
  const segmentIndex = Math.min(
    Math.floor(relativePlayhead / segmentDurationMs),
    Math.max(totalSegments - 1, 0),
  );

  // Compute segment boundaries in source time
  const segmentStartMs = trimStartMs + segmentIndex * segmentDurationMs;
  const segmentEndMs = Math.min(
    segmentStartMs + segmentDurationMs,
    trimStartMs + effectiveDurationMs,
  );

  return {
    segmentIndex,
    segmentStartMs,
    segmentEndMs,
    effectivePlayheadMs: relativePlayhead,
    totalSegments,
  };
}

/**
 * Given a trim window, clip it to the source duration.
 * Returns undefined if the trim window is entirely outside the source.
 */
export function clipTrimToSource(durationMs: number, trim: TrimWindow): TrimWindow | undefined {
  const clampedIn = Math.max(0, Math.min(trim.inMs, durationMs));
  const clampedOut = Math.max(0, Math.min(trim.outMs, durationMs));

  if (clampedIn >= clampedOut) {
    return undefined;
  }

  return { inMs: clampedIn, outMs: clampedOut };
}
