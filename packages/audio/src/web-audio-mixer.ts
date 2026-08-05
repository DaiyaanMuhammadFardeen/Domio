/**
 * @domio/audio — WebAudioMixer (Phase 11, M7.1 wrapper).
 *
 * A higher-level mixer API that wraps the low-level mixer primitives
 * (applyGainBus, computeTrackGain, fadeGain, etc.) behind a single
 * class with explicit lifecycle: connect → setTracks → start → stop.
 *
 * Uses the injectable AudioContextLike so it works in tests and in
 * real browsers without modification. Does not touch any WebAudio API
 * outside of the supplied context.
 */

import {
  computeTrackGain,
  computeTrackPan,
  type AudioContextLike,
  type TrackConfig,
  type GainBusState,
} from './index.js';

// ---------------------------------------------------------------------------
// Mixer options
// ---------------------------------------------------------------------------

export interface WebAudioMixerOptions {
  /** Initial global volume (0..1). Defaults to 1. */
  readonly globalVolume?: number;
  /** Initial master volume (0..1). Defaults to 1. */
  readonly masterVolume?: number;
  /** Optional fade applied on playback start (ms). Defaults to 0. */
  readonly fadeInMs?: number;
}

// ---------------------------------------------------------------------------
// Mixer state snapshot (for render-side introspection)
// ---------------------------------------------------------------------------

export interface MixerSnapshot {
  readonly globalVolume: number;
  readonly masterVolume: number;
  readonly trackCount: number;
  readonly effectiveGains: ReadonlyMap<string, number>;
  readonly startedAt: number | null;
  readonly stoppedAt: number | null;
  readonly clock: () => number;
}

// ---------------------------------------------------------------------------
// WebAudioMixer
// ---------------------------------------------------------------------------

/**
 * Stateful mixer object. Owns:
 *   - the mutable GainBusState (globalVolume, masterVolume, tracks)
 *   - a fade envelope for graceful start / stop
 *   - an injectable clock so test environments can advance time deterministically
 *
 * The mixer does NOT generate audio — it only computes gains and provides
 * hooks for a renderer to read effective per-track gains.
 */
export class WebAudioMixer {
  private state: GainBusState;
  private nodes: { gain: ReturnType<AudioContextLike['createGain']> }[] = [];
  private readonly ctx: AudioContextLike;
  private readonly clock: () => number;
  private startedAt: number | null = null;
  private stoppedAt: number | null = null;
  private cleanup: (() => void) | null = null;
  private fadeOffset: number;

  constructor(ctx: AudioContextLike, options: WebAudioMixerOptions = {}, clock: () => number = () => Date.now()) {
    this.ctx = ctx;
    this.clock = clock;
    this.fadeOffset = options.fadeInMs ?? 0;
    this.state = {
      globalVolume: options.globalVolume ?? 1,
      masterVolume: options.masterVolume ?? 1,
      tracks: [],
    };
  }

  // -------------------------------------------------------------------------
  // Track management
  // -------------------------------------------------------------------------

  /** Replace the track set. Resets internal node graph if already started. */
  setTracks(tracks: readonly TrackConfig[]): void {
    this.state = { ...this.state, tracks: [...tracks] };
    if (this.cleanup) {
      // re-apply node graph
      this.cleanup();
      this.cleanup = null;
      this.nodes = [];
      this.wireNodes();
    }
  }

  /** Add a single track. */
  addTrack(track: TrackConfig): void {
    this.setTracks([...this.state.tracks, track]);
  }

  /** Remove a track by id; returns true if removed. */
  removeTrack(trackId: string): boolean {
    const next = this.state.tracks.filter((t) => t.id !== trackId);
    if (next.length === this.state.tracks.length) return false;
    this.setTracks(next);
    return true;
  }

  /** Update track volume/mute in place. */
  patchTrack(trackId: string, patch: Partial<Pick<TrackConfig, 'volume' | 'pan' | 'mute'>>): boolean {
    let found = false;
    const next = this.state.tracks.map((t) => {
      if (t.id !== trackId) return t;
      found = true;
      return {
        ...t,
        ...(patch.volume !== undefined ? { volume: patch.volume } : {}),
        ...(patch.pan !== undefined ? { pan: patch.pan } : {}),
        ...(patch.mute !== undefined ? { mute: patch.mute } : {}),
      };
    });
    if (!found) return false;
    this.setTracks(next);
    return true;
  }

  // -------------------------------------------------------------------------
  // Volume controls
  // -------------------------------------------------------------------------

  setGlobalVolume(volume: number): void {
    this.state = { ...this.state, globalVolume: clamp01(volume) };
  }

  setMasterVolume(volume: number): void {
    this.state = { ...this.state, masterVolume: clamp01(volume) };
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  /** Start the mixer; applies optional fade-in. Returns start timestamp. */
  start(now?: number): number {
    if (this.startedAt !== null) return this.startedAt;
    const t = now ?? this.clock();
    this.wireNodes();
    const target = this.state.globalVolume * this.state.masterVolume;
    if (this.fadeOffset > 0) {
      for (const node of this.nodes) {
        node.gain.gain.setValueAtTime(0, t);
        node.gain.gain.linearRampToValueAtTime(target, t + this.fadeOffset);
      }
    } else {
      for (const node of this.nodes) {
        node.gain.gain.setValueAtTime(target, t);
      }
    }
    this.startedAt = t;
    this.stoppedAt = null;
    return t;
  }

  /** Stop the mixer; the fade-out is delegated to the per-track envelope helpers. */
  stop(now?: number, fadeOutMs: number = 0): number {
    if (this.startedAt === null) return 0;
    if (this.stoppedAt !== null) return this.stoppedAt;
    const t = now ?? this.clock();
    if (fadeOutMs > 0) {
      for (const node of this.nodes) {
        const from = node.gain.gain.value;
        node.gain.gain.setValueAtTime(from, t);
        node.gain.gain.linearRampToValueAtTime(0, t + fadeOutMs);
      }
    }
    this.stoppedAt = t;
    return t;
  }

  /** Tear down everything. The mixer cannot be reused after close(). */
  close(): void {
    if (this.cleanup) {
      this.cleanup();
      this.cleanup = null;
    }
    this.nodes = [];
    this.startedAt = null;
    this.stoppedAt = null;
  }

  // -------------------------------------------------------------------------
  // Read-only accessors
  // -------------------------------------------------------------------------

  /** Snapshot the current effective gains and lifecycle timestamps. */
  snapshot(): MixerSnapshot {
    const effectiveGains = new Map<string, number>();
    for (const t of this.state.tracks) {
      effectiveGains.set(t.id, computeTrackGain(this.state, t.id));
    }
    return {
      globalVolume: this.state.globalVolume,
      masterVolume: this.state.masterVolume,
      trackCount: this.state.tracks.length,
      effectiveGains,
      startedAt: this.startedAt,
      stoppedAt: this.stoppedAt,
      clock: this.clock,
    };
  }

  /** Effective pan for the given track. */
  panOf(trackId: string): number {
    return computeTrackPan(this.state, trackId);
  }

  /** Effective gain for the given track. */
  gainOf(trackId: string): number {
    return computeTrackGain(this.state, trackId);
  }

  /** Read-only list of configured tracks. */
  get tracks(): readonly TrackConfig[] {
    return this.state.tracks;
  }

  // -------------------------------------------------------------------------
  // Internal: build the node graph
  // -------------------------------------------------------------------------

  private wireNodes(): void {
    for (const _ of this.state.tracks) {
      const gain = this.ctx.createGain();
      gain.connect(this.ctx.destination);
      this.nodes.push({ gain });
    }
  }
}

// ---------------------------------------------------------------------------
// ExportMixer — wraps WebAudioMixer + createExportBus for "bounce to file"
// ---------------------------------------------------------------------------

export interface ExportMixerOptions {
  /** Sample rate for the export. Defaults to 44100. */
  readonly sampleRate?: number;
  /** Channel count for the export. Defaults to 2. */
  readonly channels?: number;
  /** Initial gain on the export bus's destination. Defaults to 1. */
  readonly destinationGain?: number;
}

/**
 * ExportMixer = WebAudioMixer (for routing) + ExportBus (for capture).
 *
 * It exposes the standard `mixer` for track management and a separate
 * `toWavUri()` for capturing the current mix.
 */
export class ExportMixer {
  readonly mixer: WebAudioMixer;
  readonly bus: import('./exportBus.js').ExportBus;

  constructor(
    renderCtx: AudioContextLike,
    exportCtx: import('./exportBus.js').ExportBusContext,
    options: ExportMixerOptions & WebAudioMixerOptions = {},
  ) {
    this.mixer = new WebAudioMixer(renderCtx, options);
    this.bus = createExportBus(exportCtx, {
      sampleRate: options.sampleRate ?? 44100,
      channels: options.channels ?? 2,
    });
    // Route mixer's destination gain into the export bus's destination gain
    this.mixer.addTrack({
      id: '__export-bus-capture__',
      kind: 'ambient',
      volume: options.destinationGain ?? 1,
      pan: 0,
      mute: false,
      durationMs: 0,
    });
  }

  setTracks(tracks: readonly TrackConfig[]): void {
    // First set the real user tracks, then keep the capture track at the end.
    this.mixer.setTracks([...tracks, this.captureTrack()]);
  }

  /** Bounce the captured mix to a WAV data URI. */
  toWavUri(): string {
    return this.bus.toWavUri();
  }

  /** Tear down both the mixer and the bus. */
  close(): void {
    this.mixer.close();
    this.bus.close();
  }

  private captureTrack(): TrackConfig {
    return {
      id: '__export-bus-capture__',
      kind: 'ambient',
      volume: 1,
      pan: 0,
      mute: false,
      durationMs: 0,
    };
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clamp01(v: number): number {
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

// Re-export for callers that want a no-import-site mixin.
import { createExportBus } from './exportBus.js';
