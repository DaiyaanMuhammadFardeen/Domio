/**
 * Transcode state machine model.
 *
 * States: queued → processing → ready | failed
 * Implemented as a pure-function state reducer.
 *
 * Also provides `canPlay()` logic:
 * - Ready when state is 'ready' OR the original mp4 is playable.
 * - When transcode_state is 'processing' and no playable original → blocked.
 */

export type TranscodeState = 'queued' | 'processing' | 'ready' | 'failed';

export interface VideoAsset {
  /** Current transcode state. */
  transcodeState: TranscodeState;
  /** Whether the original source (e.g., mp4) is playable in the browser. */
  hasPlayableOriginal: boolean;
  /** Whether an HLS URL is available. */
  hlsUrl: string | null;
  /** Whether a DASH URL is available. */
  dashUrl: string | null;
}

export interface CanPlayResult {
  /** Whether the asset can be played. */
  canPlay: boolean;
  /** If blocked, a human-readable reason. */
  reason?: string;
}

/** Valid transitions in the state machine. */
const VALID_TRANSITIONS: Record<TranscodeState, TranscodeState[]> = {
  queued: ['processing'],
  processing: ['ready', 'failed'],
  ready: [], // terminal state
  failed: [], // terminal state
};

/**
 * State reducer: compute the next transcode state.
 *
 * @param current - The current transcode state.
 * @param action - The transition action.
 * @returns The new transcode state.
 * @throws If the transition is invalid.
 */
export function reduceTranscodeState(
  current: TranscodeState,
  action: 'start' | 'complete' | 'error',
): TranscodeState {
  const transitionMap: Record<string, TranscodeState> = {
    start: 'processing',
    complete: 'ready',
    error: 'failed',
  };

  const next = transitionMap[action];
  if (!next) {
    throw new Error(`Unknown action: "${action}"`);
  }

  const allowed = VALID_TRANSITIONS[current];
  if (!allowed || !allowed.includes(next)) {
    throw new Error(`Invalid transition: ${current} → ${next} (action: "${action}")`);
  }

  return next;
}

/**
 * Determine if a video asset can be played.
 *
 * Playable when:
 * - transcodeState is 'ready', OR
 * - hasPlayableOriginal is true (the source mp4 is browser-compatible)
 *
 * Blocked when:
 * - transcodeState is 'processing' and no playable original → { blocked: true, reason: 'Transcode pending' }
 * - transcodeState is 'queued' and no playable original → { blocked: true, reason: 'Transcode pending' }
 * - transcodeState is 'failed' and no playable original → { blocked: true, reason: 'Transcode failed' }
 */
export function canPlay(asset: VideoAsset): CanPlayResult {
  // Ready state always plays
  if (asset.transcodeState === 'ready') {
    return { canPlay: true };
  }

  // If original is playable, can play regardless of transcode state
  if (asset.hasPlayableOriginal) {
    return { canPlay: true };
  }

  // Not ready and no playable original → blocked
  switch (asset.transcodeState) {
    case 'queued':
      return { canPlay: false, reason: 'Transcode pending' };
    case 'processing':
      return { canPlay: false, reason: 'Transcode pending' };
    case 'failed':
      return { canPlay: false, reason: 'Transcode failed' };
    default:
      return { canPlay: false, reason: 'Unknown state' };
  }
}
