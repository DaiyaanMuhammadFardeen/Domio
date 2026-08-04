/**
 * @domio/viewer — Slide-transition resolver.
 *
 * Maps transition kinds to SVG/CSS-friendly property recipes
 * and provides reduced-motion classification per R-09-4.
 */

// ─── Types ──────────────────────────────────────────────────────

export type TransitionKind =
  | 'fade'
  | 'slide'
  | 'wipe'
  | 'zoom'
  | 'flip'
  | 'bubble'
  | 'cube'
  | 'shutter';

/** Per-kind property recipe for renderers to drive. */
export interface TransitionProps {
  /** Initial→final opacity values (if applicable). */
  readonly opacity?: readonly [number, number];
  /** CSS transform string template (if applicable). */
  readonly transform?: string;
  /** Additional CSS properties. */
  readonly css?: Readonly<Record<string, string>>;
}

// ─── Errors ─────────────────────────────────────────────────────

export class TransitionError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'TransitionError';
    this.code = code;
  }
}

// ─── Constants ──────────────────────────────────────────────────

/** Default durations per transition kind (ms). */
const KIND_DURATIONS: ReadonlyMap<TransitionKind, number> = new Map([
  ['fade', 300],
  ['slide', 400],
  ['wipe', 350],
  ['zoom', 350],
  ['flip', 500],
  ['bubble', 450],
  ['cube', 600],
  ['shutter', 400],
]);

/** Motion-heavy kinds that should be collapsed under reduced motion (R-09-4). */
const MOTION_HEAVY_KINDS: ReadonlySet<TransitionKind> = new Set([
  'flip',
  'cube',
  'bubble',
  'shutter',
]);

/** Per-kind property recipes. */
const KIND_PROPS: ReadonlyMap<TransitionKind, TransitionProps> = new Map([
  ['fade', { opacity: [0, 1] }],
  ['slide', { opacity: [0, 1], transform: 'translateX(100%)' }],
  ['wipe', { opacity: [0, 1], css: { clipPath: 'inset(0 100% 0 0)' } }],
  ['zoom', { opacity: [0, 1], transform: 'scale(0)' }],
  ['flip', { opacity: [0, 1], transform: 'rotateY(90deg)' }],
  ['bubble', { opacity: [0, 1], transform: 'scale(0.1)' }],
  ['cube', { opacity: [0, 1], transform: 'rotateY(-90deg)' }],
  ['shutter', { opacity: [0, 1], css: { clipPath: 'polygon(0 0, 0 0, 0 100%, 0 100%)' } }],
]);

// ─── Helpers ────────────────────────────────────────────────────

const ALL_KINDS: readonly TransitionKind[] = [
  'fade', 'slide', 'wipe', 'zoom', 'flip', 'bubble', 'cube', 'shutter',
];

function assertValidKind(kind: string): asserts kind is TransitionKind {
  if (!(ALL_KINDS as readonly string[]).includes(kind)) {
    throw new TransitionError(
      'UNKNOWN_KIND',
      `Unknown transition kind: "${kind}"`,
    );
  }
}

// ─── Public API ─────────────────────────────────────────────────

/**
 * Get the recommended duration for a transition kind.
 *
 * @param kind       - The transition kind.
 * @param defaultMs  - Fallback duration (used when kind is unknown, which throws).
 * @returns The kind-specific duration in ms.
 *
 * @throws {TransitionError} UNKNOWN_KIND for unrecognised kinds.
 */
export function transitionDuration(
  kind: TransitionKind,
  defaultMs: number,
): number {
  assertValidKind(kind);
  return KIND_DURATIONS.get(kind) ?? defaultMs;
}

/**
 * Get CSS/SVG property recipe for a transition kind.
 *
 * @param kind - The transition kind.
 * @returns A TransitionProps object describing opacity, transform, and CSS.
 *
 * @throws {TransitionError} UNKNOWN_KIND for unrecognised kinds.
 */
export function transitionProps(kind: TransitionKind): TransitionProps {
  assertValidKind(kind);
  return KIND_PROPS.get(kind) ?? {};
}

/**
 * Whether a transition kind is motion-heavy and should be
 * collapsed under reduced-motion mode (R-09-4).
 *
 * @param kind - The transition kind.
 * @returns `true` for flip, cube, bubble, shutter.
 *
 * @throws {TransitionError} UNKNOWN_KIND for unrecognised kinds.
 */
export function appliesReducedMotion(kind: TransitionKind): boolean {
  assertValidKind(kind);
  return MOTION_HEAVY_KINDS.has(kind);
}
