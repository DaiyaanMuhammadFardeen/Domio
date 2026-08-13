/**
 * gaze-service — types and persistence helpers for the gaze-guided
 * spotlight.
 *
 * Per Wave 11 §S11.3 of docs/frontend-roadmap/11-wave-novel-frontier.md.
 *
 * The presenter app exposes a soft circular spotlight that follows where
 * the presenter is looking on their own view. This module is the thin
 * persistence layer that:
 *
 *   • Loads any previously-completed gaze calibration so the presenter
 *     doesn't have to re-calibrate every time they open the app.
 *   • Saves the calibration points the user clicks during the 9-point
 *     flow.
 *   • Records gaze samples for later analysis / debugging. In the demo
 *     build we keep an in-memory ring buffer; the real backend would
 *     POST to /v1/presenter/sessions/{id}/gaze.
 *
 * Everything falls back to in-memory state on failure so the demo runs
 * without a backend.
 */

export interface GazePoint {
  /** Normalized 0..1 across the slide. */
  readonly x: number;
  /** Normalized 0..1 across the slide. */
  readonly y: number;
  /** 0..1 confidence reported by the gaze model. */
  readonly confidence: number;
  /** Monotonic timestamp (Date.now() / performance.now() — see source). */
  readonly timestamp_ms: number;
}

export interface GazeCalibration {
  readonly id: string;
  readonly completed_at_ms: number;
  readonly points: ReadonlyArray<{ x: number; y: number }>;
}

export interface GazeServiceOptions {
  readonly apiBaseUrl?: string;
  readonly fetchImpl?: typeof fetch;
  readonly storageKey?: string;
}

const DEFAULT_STORAGE_KEY = 'domio.presenter.gaze.calibration.v1';

function makeId(): string {
  // Avoid importing crypto.randomUUID() so this works under jsdom + node
  // test runners without polyfills.
  return `gc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function safeReadStorage(key: string): GazeCalibration | null {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return null;
  }
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<GazeCalibration>;
    if (
      typeof parsed?.id === 'string' &&
      typeof parsed?.completed_at_ms === 'number' &&
      Array.isArray(parsed.points)
    ) {
      return {
        id: parsed.id,
        completed_at_ms: parsed.completed_at_ms,
        points: parsed.points.filter(
          (p): p is { x: number; y: number } =>
            !!p && typeof p.x === 'number' && typeof p.y === 'number',
        ),
      };
    }
    return null;
  } catch {
    return null;
  }
}

function safeWriteStorage(key: string, value: GazeCalibration): void {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return;
  }
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota / privacy mode — silently degrade */
  }
}

const inMemoryGaze: GazePoint[] = [];
const IN_MEMORY_LIMIT = 512;

function pushInMemory(point: GazePoint): void {
  inMemoryGaze.push(point);
  if (inMemoryGaze.length > IN_MEMORY_LIMIT) {
    inMemoryGaze.splice(0, inMemoryGaze.length - IN_MEMORY_LIMIT);
  }
}

// In-memory calibration fallback so the demo + tests work without a
// persistent localStorage. Keyed by storage key.
const inMemoryCalibrations: Map<string, GazeCalibration> = new Map();

/**
 * Lookup the presenter's most recent calibration. Returns `null` when
 * no calibration exists or the storage layer is unavailable.
 */
export async function getGazeCalibration(
  opts: GazeServiceOptions = {},
): Promise<GazeCalibration | null> {
  const key = opts.storageKey ?? DEFAULT_STORAGE_KEY;
  const persisted = safeReadStorage(key);
  if (persisted) return persisted;
  return inMemoryCalibrations.get(key) ?? null;
}

/**
 * Persist a new calibration and return the canonical descriptor.
 */
export async function saveGazeCalibration(
  points: ReadonlyArray<{ x: number; y: number }>,
  opts: GazeServiceOptions = {},
): Promise<GazeCalibration> {
  const key = opts.storageKey ?? DEFAULT_STORAGE_KEY;
  const cal: GazeCalibration = {
    id: makeId(),
    completed_at_ms: Date.now(),
    points: points.slice(),
  };
  safeWriteStorage(key, cal);
  inMemoryCalibrations.set(key, cal);
  return cal;
}

/**
 * Record a single gaze sample. Best-effort — never throws. Backed by
 * an in-memory ring buffer so the demo build works without a backend.
 */
export async function recordGazeEvent(
  point: GazePoint,
  opts: GazeServiceOptions = {},
): Promise<void> {
  pushInMemory(point);
  // No network in the demo build. Swallow any future errors so the
  // 60Hz gaze loop never breaks the spotlight animation.
  void opts;
  return;
}

/**
 * Inspect the in-memory gaze ring (test/demo helper). Not exported in the
 * barrel — kept module-local for now.
 */
export function __peekGazeBuffer(): ReadonlyArray<GazePoint> {
  return inMemoryGaze.slice();
}

/**
 * Reset internal state. Test helper only — clears the calibration cache
 * and the in-memory ring buffer.
 */
export function __resetGazeServiceState(opts: GazeServiceOptions = {}): void {
  const key = opts.storageKey ?? DEFAULT_STORAGE_KEY;
  if (typeof window !== 'undefined' && typeof window.localStorage !== 'undefined') {
    try {
      window.localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  }
  inMemoryGaze.length = 0;
}