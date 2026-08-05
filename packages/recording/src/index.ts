/**
 * @domio/recording — Screen-recording capture via getDisplayMedia.
 *
 * Encoder selection, bitrate auto-scale, resumable drafts, and timing guards.
 * Phase 11 (M7.3).
 */

export {
  selectEncoder,
  type SupportMatrix,
  type EncoderChoice,
  type EncoderResult,
  type Unsupported,
} from "./encoder.js";

export {
  computeBitrate,
  bitrateDelta,
  type BitrateTier,
  type BitrateParams,
} from "./bitrate.js";

export {
  createDraft,
  draftReducer,
  appendChunk,
  resumeDraft,
  finalizeDraft,
  recoverDraft,
  InvalidTransitionError,
  type DraftState,
  type DraftAction,
  type DraftMachine,
  type RecordingChunk,
  type FinalizedDraft,
} from "./drafts.js";

export {
  checkElapsed,
  checkMinDuration,
  DEFAULT_MAX_DURATION_MS,
  MIN_DURATION_MS,
  type TimingConfig,
  type TimingCheck,
  type ElapsedResult,
  type StoppedResult,
  type MinGuardResult,
} from "./timing.js";
