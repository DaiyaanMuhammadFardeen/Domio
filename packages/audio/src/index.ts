// Mixer
export {
  computeTrackGain,
  computeTrackPan,
  computeAllGains,
  applyGainBus,
  type AudioContextLike,
  type GainNodeLike,
  type AudioParamLike,
  type PannerNodeLike,
  type AudioDestinationLike,
  type AudioNodeLike,
  type AudioTrackKind,
  type TrackConfig,
  type GainBusState,
} from './mixer.js';

// Envelopes
export {
  fadeGain,
  duckGain,
  backgroundGain,
  type FadeConfig,
  type DuckingConfig,
  type DuckingState,
} from './envelopes.js';

// Sync / Drift
export {
  withinBudget,
  pickDriftStrategy,
  updateDrift,
  DEFAULT_DRIFT_BUDGET_MS,
  type DriftStrategy,
  type DriftState,
} from './sync.js';

// Export Bus
export {
  writeWavHeader,
  encodePcm16,
  createExportBus,
  type ExportBusContext,
  type ExportBus,
  type ExportBusWithSamples,
} from './exportBus.js';

// WebAudioMixer + ExportMixer (Phase 11, M7.1 wrappers)
export {
  WebAudioMixer,
  ExportMixer,
  type WebAudioMixerOptions,
  type ExportMixerOptions,
  type MixerSnapshot,
} from './web-audio-mixer.js';
