/**
 * AudioContextLike — injectable minimal interface so tests never touch real Web Audio.
 */
export interface AudioContextLike {
  createGain(): GainNodeLike;
  createPanner(): PannerNodeLike;
  destination: AudioDestinationLike;
}

export interface GainNodeLike {
  gain: AudioParamLike;
  connect(dest: AudioNodeLike): void;
  disconnect(): void;
}

export interface AudioParamLike {
  value: number;
  linearRampToValueAtTime(value: number, time: number): void;
  setValueAtTime(value: number, time: number): void;
}

export interface PannerNodeLike {
  pan: AudioParamLike;
  connect(dest: AudioNodeLike): void;
  disconnect(): void;
}

export interface AudioDestinationLike {
  connect(dest: AudioNodeLike): void;
  channelCount: number;
}

export interface AudioNodeLike {
  connect(dest: AudioNodeLike): void;
}

// ─── Track model ────────────────────────────────────────────────────────────

export type AudioTrackKind = 'voiceover' | 'music' | 'ambient' | 'sfx';

export interface TrackConfig {
  id: string;
  kind: AudioTrackKind;
  /** 0..1 linear volume */
  volume: number;
  /** -1 (left) .. 1 (right) */
  pan: number;
  /** Mute silences the track (gain = 0) without changing volume */
  mute: boolean;
  /** Duration in milliseconds (metadata, not used in gain calc) */
  durationMs: number;
}

// ─── GainBus ────────────────────────────────────────────────────────────────

export interface GainBusState {
  /** Global output volume 0..1 applied to all tracks */
  globalVolume: number;
  /** Master volume 0..1 applied after per-track gain */
  masterVolume: number;
  tracks: TrackConfig[];
}

/**
 * Compute the effective output gain for a single track.
 *
 * Formula: effectiveGain = globalVolume × masterVolume × trackVolume × (mute ? 0 : 1)
 *
 * All factors are linear (not dB). The result is clamped to [0, 1].
 */
export function computeTrackGain(state: GainBusState, trackId: string): number {
  const track = state.tracks.find((t) => t.id === trackId);
  if (!track) return 0;

  const muteFactor = track.mute ? 0 : 1;
  const raw =
    clamp(state.globalVolume, 0, 1) *
    clamp(state.masterVolume, 0, 1) *
    clamp(track.volume, 0, 1) *
    muteFactor;

  return clamp(raw, 0, 1);
}

/**
 * Compute effective pan for a track. Pan is simply the track's pan value,
 * clamped to [-1, 1]. Global/master do not affect pan direction.
 */
export function computeTrackPan(state: GainBusState, trackId: string): number {
  const track = state.tracks.find((t) => t.id === trackId);
  if (!track) return 0;
  return clamp(track.pan, -1, 1);
}

/**
 * Compute all track output gains in one pass.
 * Returns a Map of trackId → effective gain.
 */
export function computeAllGains(state: GainBusState): Map<string, number> {
  const result = new Map<string, number>();
  for (const track of state.tracks) {
    result.set(track.id, computeTrackGain(state, track.id));
  }
  return result;
}

/**
 * Apply gain bus state to real Web Audio nodes.
 * Creates GainNodes and PannerNodes wired through the injectable context.
 * Returns cleanup function.
 */
export function applyGainBus(ctx: AudioContextLike, state: GainBusState): () => void {
  const nodes: { gain: GainNodeLike; panner: PannerNodeLike }[] = [];

  for (const track of state.tracks) {
    const gain = ctx.createGain();
    const panner = ctx.createPanner();
    const effectiveGain = computeTrackGain(state, track.id);
    const effectivePan = computeTrackPan(state, track.id);

    gain.gain.value = effectiveGain;
    panner.pan.value = effectivePan;

    gain.connect(panner);
    panner.connect(ctx.destination);

    nodes.push({ gain, panner });
  }

  return () => {
    for (const n of nodes) {
      n.gain.disconnect();
      n.panner.disconnect();
    }
  };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}
