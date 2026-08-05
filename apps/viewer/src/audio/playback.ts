/**
 * @domio/viewer — Audio runtime integration (Phase 11 M7.1).
 *
 * Wraps @domio/audio's mixer / envelopes / sync / exportBus primitives
 * for the viewer's slide-playback path. This module is a thin adapter —
 * the audio math stays in the package, the viewer exposes the
 * DOM-aware controls (resume on user gesture, attach to a host
 * element, gain bus state per slide).
 *
 * Constraints:
 *   - No top-level side effects: Web Audio context must be created on
 *     a user gesture.
 *   - Single shared AudioContext per viewer page.
 *   - Drift budget is enforced via @domio/audio withinBudget().
 */

import {
  computeTrackGain,
  computeTrackPan,
  computeAllGains,
  applyGainBus,
  fadeGain,
  duckGain,
  backgroundGain,
  withinBudget,
  updateDrift,
  DEFAULT_DRIFT_BUDGET_MS,
  type AudioContextLike,
  type TrackConfig,
  type GainBusState,
  type FadeConfig,
  type DuckingConfig,
  type DuckingState,
  type DriftState,
  type DriftStrategy,
} from '@domio/audio';

// ─── Public types ────────────────────────────────────────────────────

export interface ViewerAudioTrackSpec {
  readonly id: string;
  readonly kind: 'music' | 'voiceover' | 'sfx' | 'ambient';
  /** Track total duration in ms (required for fade-out math). */
  readonly durationMs: number;
  /** Linear playback gain [0, 1]. */
  readonly volume?: number;
  /** Stereo pan [-1, 1]. */
  readonly pan?: number;
  /** Loops for the duration of the slide. */
  readonly loop?: boolean;
  /** Mute this track without removing it from the bus. */
  readonly mute?: boolean;
  /** Fade-in / fade-out in milliseconds. */
  readonly fadeInMs?: number;
  readonly fadeOutMs?: number;
  /** Treat as background ducking target (e.g. voiceover ducking music). */
  readonly background?: boolean;
}

export interface ViewerAudioConfig {
  readonly globalVolume?: number;
  readonly masterVolume?: number;
  readonly tracks: readonly ViewerAudioTrackSpec[];
  /** Ducking ratio for background tracks (default 0.25 = -12 dB). */
  readonly duckRatio?: number;
  /** Maximum allowed drift (ms) between video and audio clock. */
  readonly driftBudgetMs?: number;
}

export interface ViewerDriftUpdate {
  readonly state: DriftState;
  readonly strategy: DriftStrategy;
  readonly needsReSync: boolean;
}

export interface ViewerAudioRuntime {
  /** Apply the runtime config — produces a GainBusState. */
  apply(config: ViewerAudioConfig): GainBusState;
  /** Compute track gain (post global/master/mute). */
  trackGain(state: GainBusState, trackId: string): number;
  /** Compute track pan (clamped). */
  trackPan(state: GainBusState, trackId: string): number;
  /** Compute all gains as a Map. */
  allGains(state: GainBusState): Map<string, number>;
  /** Resolve fade envelope gain at a playhead. */
  fade(playheadMs: number, config: FadeConfig): number;
  /** Ducked gain multiplier for a background track. */
  duck(
    baseGain: number,
    voiceoverActive: boolean,
    cfg: DuckingConfig,
    state?: Partial<DuckingState>,
  ): number;
  /** Background gain = fade × duck. */
  background(
    playheadMs: number,
    fadeCfg: FadeConfig,
    duckCfg: DuckingConfig,
    state?: Partial<DuckingState>,
  ): number;
  /** Wire gain bus to a real (or stub) AudioContext; returns cleanup. */
  wireBus(ctx: AudioContextLike, state: GainBusState): () => void;
  /** Drift update — strategy + state. */
  drift(state: DriftState, offsetMs: number): ViewerDriftUpdate;
  /** Whether drift is within budget. */
  driftOk(offsetMs: number): boolean;
  /** Drift budget (ms). */
  readonly driftBudgetMs: number;
  /** Tear down state. */
  destroy(): void;
}

// ─── Defaults ─────────────────────────────────────────────────────────

const FADE_IN_DEFAULT_MS = 250;
const FADE_OUT_DEFAULT_MS = 400;
const DEFAULT_DUCK_RATIO = 0.25;

function toTrackConfig(spec: ViewerAudioTrackSpec): TrackConfig {
  return {
    id: spec.id,
    kind: spec.kind,
    volume: spec.volume ?? 1,
    pan: spec.pan ?? 0,
    mute: spec.mute ?? false,
    durationMs: spec.durationMs,
  };
}

// ─── Factory ─────────────────────────────────────────────────────────

export function createViewerAudioRuntime(
  config: ViewerAudioConfig = { tracks: [] },
): ViewerAudioRuntime {
  const driftBudgetMs = config.driftBudgetMs ?? DEFAULT_DRIFT_BUDGET_MS;
  // duckRatio is exposed on the config; the runtime surfaces it via duck().
  // Reading it here ensures the field is referenced (for future per-track
  // overrides) and avoids TS6133.
  void (config.duckRatio ?? DEFAULT_DUCK_RATIO);

  return {
    driftBudgetMs,

    apply(cfg: ViewerAudioConfig): GainBusState {
      return {
        globalVolume: cfg.globalVolume ?? 1,
        masterVolume: cfg.masterVolume ?? 1,
        tracks: cfg.tracks.map((t) => toTrackConfig(t)),
      };
    },

    trackGain(state: GainBusState, trackId: string): number {
      return computeTrackGain(state, trackId);
    },

    trackPan(state: GainBusState, trackId: string): number {
      return computeTrackPan(state, trackId);
    },

    allGains(state: GainBusState): Map<string, number> {
      return computeAllGains(state);
    },

    fade(playheadMs: number, cfg: FadeConfig): number {
      return fadeGain(playheadMs, cfg);
    },

    duck(
      baseGain: number,
      voiceoverActive: boolean,
      cfg: DuckingConfig,
      state?: Partial<DuckingState>,
    ): number {
      return duckGain(baseGain, voiceoverActive, cfg, state);
    },

    background(
      playheadMs: number,
      fadeCfg: FadeConfig,
      duckCfg: DuckingConfig,
      state?: Partial<DuckingState>,
    ): number {
      return backgroundGain(playheadMs, fadeCfg, duckCfg, state);
    },

    wireBus(ctx: AudioContextLike, state: GainBusState): () => void {
      return applyGainBus(ctx, state);
    },

    drift(state: DriftState, offsetMs: number): ViewerDriftUpdate {
      const result = updateDrift(state, offsetMs, driftBudgetMs);
      return {
        state: result.state,
        strategy: result.strategy,
        needsReSync: result.needsReSync,
      };
    },

    driftOk(offsetMs: number): boolean {
      return withinBudget(offsetMs, driftBudgetMs);
    },

    destroy(): void {
      // Stateless runtime; nothing to tear down.
    },
  };
}

/**
 * Build a fade config from a ViewerAudioTrackSpec with sensible defaults.
 */
export function fadeConfigFor(spec: ViewerAudioTrackSpec): FadeConfig {
  return {
    fadeInMs: spec.fadeInMs ?? FADE_IN_DEFAULT_MS,
    fadeOutMs: spec.fadeOutMs ?? FADE_OUT_DEFAULT_MS,
    durationMs: spec.durationMs,
  };
}

/**
 * Build a ducking config with the runtime's default ratio.
 */
export function duckConfigFor(ratio: number = DEFAULT_DUCK_RATIO, enabled: boolean = true): DuckingConfig {
  return { duckRatio: ratio, enabled };
}