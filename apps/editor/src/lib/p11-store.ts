/**
 * Phase 11 — Media asset demo store.
 *
 * Mirrors live-data-store.ts pattern: module singleton with subscribe API,
 * swappable for real asset-api calls later.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AssetKind =
  | 'model3d'
  | 'video'
  | 'audio'
  | 'lottie'
  | 'embed'
  | 'codeBlock'
  | 'latex'
  | 'map';

export interface MediaAsset {
  id: string;
  name: string;
  kind: AssetKind;
  /** URL or asset-api ref; null for assets that only need inline content */
  url?: string;
  /** File extension hint (e.g. "glb", "mp4") */
  ext?: string;
  /** Thumbnail URL for picker grids */
  thumbnail?: string;
  /** Size in bytes (informational) */
  sizeBytes?: number;
}

export interface MapStyle {
  id: string;
  name: string;
  provider: string;
  styleUrl: string;
}

export interface CodeLanguage {
  id: string;
  name: string;
}

// ---------------------------------------------------------------------------
// Demo data
// ---------------------------------------------------------------------------

const DEMO_MODELS: MediaAsset[] = [
  {
    id: 'model-demo-1',
    name: 'Damaged Helmet',
    kind: 'model3d',
    url: 'https://example.com/assets/helmet.glb',
    ext: 'glb',
    thumbnail: '🪖',
    sizeBytes: 2_400_000,
  },
  {
    id: 'model-demo-2',
    name: 'Flight Helmet',
    kind: 'model3d',
    url: 'https://example.com/assets/flight-helmet.glb',
    ext: 'glb',
    thumbnail: '✈️',
    sizeBytes: 1_800_000,
  },
  {
    id: 'model-demo-3',
    name: 'Cornell Box',
    kind: 'model3d',
    url: 'https://example.com/assets/cornell.glb',
    ext: 'glb',
    thumbnail: '📦',
    sizeBytes: 950_000,
  },
  {
    id: 'model-demo-4',
    name: 'Brain Stem',
    kind: 'model3d',
    url: 'https://example.com/assets/brain-stem.glb',
    ext: 'glb',
    thumbnail: '🧠',
    sizeBytes: 3_200_000,
  },
];

const DEMO_VIDEOS: MediaAsset[] = [
  {
    id: 'video-demo-1',
    name: 'Product Reveal',
    kind: 'video',
    url: 'https://example.com/assets/reveal.mp4',
    ext: 'mp4',
    thumbnail: '🎬',
    sizeBytes: 12_000_000,
  },
  {
    id: 'video-demo-2',
    name: 'Team Intro',
    kind: 'video',
    url: 'https://example.com/assets/team.mp4',
    ext: 'mp4',
    thumbnail: '👥',
    sizeBytes: 8_500_000,
  },
  {
    id: 'video-demo-3',
    name: 'Data Viz Loop',
    kind: 'video',
    url: 'https://example.com/assets/viz-loop.mp4',
    ext: 'mp4',
    thumbnail: '📊',
    sizeBytes: 4_200_000,
  },
];

const DEMO_AUDIO: MediaAsset[] = [
  {
    id: 'audio-demo-1',
    name: 'Background Music',
    kind: 'audio',
    url: 'https://example.com/assets/bgm.mp3',
    ext: 'mp3',
    thumbnail: '🎵',
    sizeBytes: 3_400_000,
  },
  {
    id: 'audio-demo-2',
    name: 'Narration',
    kind: 'audio',
    url: 'https://example.com/assets/narration.mp3',
    ext: 'mp3',
    thumbnail: '🎙️',
    sizeBytes: 5_100_000,
  },
  {
    id: 'audio-demo-3',
    name: 'Sound Effect',
    kind: 'audio',
    url: 'https://example.com/assets/sfx.mp3',
    ext: 'mp3',
    thumbnail: '🔊',
    sizeBytes: 800_000,
  },
];

const DEMO_LOTTIE: MediaAsset[] = [
  {
    id: 'lottie-demo-1',
    name: 'Loading Spinner',
    kind: 'lottie',
    url: 'https://example.com/assets/spinner.json',
    ext: 'json',
    thumbnail: '⏳',
  },
  {
    id: 'lottie-demo-2',
    name: 'Checkmark',
    kind: 'lottie',
    url: 'https://example.com/assets/check.json',
    ext: 'json',
    thumbnail: '✅',
  },
  {
    id: 'lottie-demo-3',
    name: 'Confetti',
    kind: 'lottie',
    url: 'https://example.com/assets/confetti.json',
    ext: 'json',
    thumbnail: '🎉',
  },
];

const DEMO_MAP_STYLES: MapStyle[] = [
  {
    id: 'mapbox-light',
    name: 'Light',
    provider: 'Mapbox',
    styleUrl: 'mapbox://styles/mapbox/light-v11',
  },
  {
    id: 'mapbox-dark',
    name: 'Dark',
    provider: 'Mapbox',
    styleUrl: 'mapbox://styles/mapbox/dark-v11',
  },
  {
    id: 'mapbox-streets',
    name: 'Streets',
    provider: 'Mapbox',
    styleUrl: 'mapbox://styles/mapbox/streets-v12',
  },
  {
    id: 'mapbox-satellite',
    name: 'Satellite',
    provider: 'Mapbox',
    styleUrl: 'mapbox://styles/mapbox/satellite-streets-v12',
  },
];

const DEMO_CODE_LANGUAGES: CodeLanguage[] = [
  { id: 'javascript', name: 'JavaScript' },
  { id: 'typescript', name: 'TypeScript' },
  { id: 'python', name: 'Python' },
  { id: 'rust', name: 'Rust' },
  { id: 'go', name: 'Go' },
  { id: 'html', name: 'HTML' },
  { id: 'css', name: 'CSS' },
  { id: 'json', name: 'JSON' },
  { id: 'markdown', name: 'Markdown' },
  { id: 'sql', name: 'SQL' },
  { id: 'bash', name: 'Bash' },
];

// ---------------------------------------------------------------------------
// Store state
// ---------------------------------------------------------------------------

let _models: MediaAsset[] = DEMO_MODELS;
let _videos: MediaAsset[] = DEMO_VIDEOS;
let _audio: MediaAsset[] = DEMO_AUDIO;
let _lottie: MediaAsset[] = DEMO_LOTTIE;
let _listeners: Array<() => void> = [];

function notify() {
  for (const fn of _listeners) fn();
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function getModels(): MediaAsset[] {
  return _models;
}
export function getVideos(): MediaAsset[] {
  return _videos;
}
export function getAudio(): MediaAsset[] {
  return _audio;
}
export function getLottie(): MediaAsset[] {
  return _lottie;
}
export function getMapStyles(): MapStyle[] {
  return DEMO_MAP_STYLES;
}
export function getCodeLanguages(): CodeLanguage[] {
  return DEMO_CODE_LANGUAGES;
}

export function addAsset(kind: AssetKind, name: string, url?: string): MediaAsset {
  const ext = url?.split('.').pop();
  const base: MediaAsset = { id: `${kind}-user-${Date.now()}`, name, kind };
  const asset: MediaAsset = url && ext ? { ...base, url, ext } : url ? { ...base, url } : base;
  switch (kind) {
    case 'model3d':
      _models = [..._models, asset];
      break;
    case 'video':
      _videos = [..._videos, asset];
      break;
    case 'audio':
      _audio = [..._audio, asset];
      break;
    case 'lottie':
      _lottie = [..._lottie, asset];
      break;
  }
  notify();
  return asset;
}

export function removeAsset(kind: AssetKind, id: string): void {
  switch (kind) {
    case 'model3d':
      _models = _models.filter((a) => a.id !== id);
      break;
    case 'video':
      _videos = _videos.filter((a) => a.id !== id);
      break;
    case 'audio':
      _audio = _audio.filter((a) => a.id !== id);
      break;
    case 'lottie':
      _lottie = _lottie.filter((a) => a.id !== id);
      break;
  }
  notify();
}

export function subscribe(listener: () => void): () => void {
  _listeners = [..._listeners, listener];
  return () => {
    _listeners = _listeners.filter((l) => l !== listener);
  };
}

/** Reset store for tests. */
export function resetStore(): void {
  _models = DEMO_MODELS;
  _videos = DEMO_VIDEOS;
  _audio = DEMO_AUDIO;
  _lottie = DEMO_LOTTIE;
  _listeners = [];
}
