/**
 * Presence protocol helpers built on top of the y-protocols `Awareness`
 * class.  All functions are DOM-free: they operate on `Y.Doc` + `Awareness`
 * only and can run in Node for testing.
 *
 * ### Deterministic cursor color
 *
 * `deterministicCursorColor(userId)` hashes the userId via FNV-1a and maps
 * the result to one of 64 curated palette colours.  The palette is chosen
 * for visual distinctness on white *and* dark backgrounds.  If the hash
 * collides with an already-used colour the function walks forward through
 * the palette — callers should cache the result per userId for stability.
 */

import type * as Y from 'yjs';
import { Awareness } from 'y-protocols/awareness';

// ----- Presence state type -----

/** Keys tracked in the per-user awareness state. */
export const PRESENCE_KEYS = [
  'name',
  'color',
  'cursor',
  'selection',
  'viewport',
  'activeSlide',
  'branchId',
  'lastSeen',
] as const;

/** Presence state stored in the Awareness protocol. */
export type PresenceState = {
  name?: string;
  color?: string;
  cursor?: { x: number; y: number } | null;
  selection?: string[];
  viewport?: { x: number; y: number; zoom: number } | null;
  activeSlide?: string | null;
  branchId?: string;
  lastSeen?: number;
};

// ----- 64-colour deterministic palette -----
//
// Hand-picked for contrast against both white (#FFFFFF) and dark (#1E1E1E)
// canvases.  Sufficiently spaced in hue/lightness to stay visually distinct
// at small dot sizes (cursors, selection highlights).

export const CURSOR_PALETTE: readonly string[] = [
  '#E64B35',
  '#4E79A7',
  '#59A14F',
  '#EDC948',
  '#B07AA1',
  '#FF9DA7',
  '#9C755F',
  '#BAB0AC',
  '#76B7B2',
  '#FF6F3F',
  '#6A9CD9',
  '#86BCB6',
  '#A0CBE8',
  '#F1CE63',
  '#D4A6C8',
  '#FF968A',
  '#B69992',
  '#D7B5A3',
  '#499894',
  '#E15759',
  '#F28E2B',
  '#79706E',
  '#C5B4E3',
  '#AF7AA1',
  '#FFBDAF',
  '#D37295',
  '#9D7660',
  '#FABFD2',
  '#A3C4BC',
  '#DEB5A0',
  '#8CD17D',
  '#F4D03F',
  '#48B8D0',
  '#EB5757',
  '#8E6BB0',
  '#CAB8D9',
  '#AEC7D8',
  '#FF7F0E',
  '#1F77B4',
  '#2CA02C',
  '#D62728',
  '#9467BD',
  '#8C564B',
  '#E377C2',
  '#7F7F7F',
  '#BCBD22',
  '#17BECF',
  '#393B79',
  '#637939',
  '#8C6D31',
  '#843C39',
  '#7B4173',
  '#5254A3',
  '#B5CF6B',
  '#CEDB9C',
  '#E7BA52',
  '#E7CB94',
  '#DE9ED6',
  '#C49C94',
  '#F7B6D2',
  '#C7E7C3',
  '#DEBC99',
  '#C7C7C7',
  '#798E9E',
] as const;

// ----- FNV-1a hash -----

/** FNV-1a 32-bit hash → unsigned 32-bit integer. */
function fnv1a(input: string): number {
  let hash = 0x811c9dc5; // FNV offset basis
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193); // FNV prime
  }
  return hash >>> 0;
}

/**
 * Stable, deterministic colour for a given `userId`.
 *
 * The mapping is:
 *   1. FNV-1a hash the userId string.
 *   2. Modulo the palette length to get an index.
 *   3. Walk forward (wrapping) until an unused colour is found — callers
 *      who want guaranteed uniqueness should maintain a `Set<string>` of
 *      already-assigned colours and pass it as the second argument.
 */
export function deterministicCursorColor(userId: string, used?: ReadonlySet<string>): string {
  const palette = CURSOR_PALETTE;
  const base = fnv1a(userId) % palette.length;
  if (!used || used.size === 0) return palette[base]!;

  // Walk the palette looking for an unused slot (max one full pass).
  for (let i = 0; i < palette.length; i++) {
    const candidate = palette[(base + i) % palette.length]!;
    if (!used.has(candidate)) return candidate;
  }
  // All 64 colours taken — return the hash index anyway.
  return palette[base]!;
}

/**
 * Helper that caches colour assignment per userId.
 * Maintains an internal `used` set so consecutive unique users
 * always receive distinct colours (until the palette is exhausted).
 */
export function createCursorColorAllocator(): (userId: string) => string {
  const used = new Set<string>();
  const userColorMap = new Map<string, string>();
  return (userId: string): string => {
    const cached = userColorMap.get(userId);
    if (cached !== undefined) return cached;
    const color = deterministicCursorColor(userId, used);
    used.add(color);
    userColorMap.set(userId, color);
    return color;
  };
}

// ----- Awareness helpers -----

/**
 * Create a fresh `Awareness` instance bound to `rootDoc`.
 *
 * Wraps the y-protocols constructor so the rest of the codebase doesn't
 * import `y-protocols/awareness` directly.
 */
export function createAwareness(rootDoc: Y.Doc): Awareness {
  return new Awareness(rootDoc);
}

/**
 * Merge `state` into the local awareness field for `userId`.
 *
 * The local client's state is keyed by `rootDoc.clientID`; the `userId` is
 * stored inside the state object so peers can identify who the client is.
 */
export function updatePresence(
  awareness: Awareness,
  userId: string,
  state: PresenceState,
  _sessionId?: string,
): void {
  const current = awareness.getLocalState() as Record<string, unknown> | null;
  awareness.setLocalState({
    ...(current ?? {}),
    ...state,
    userId,
    lastSeen: Date.now(),
  });
}

/** Shape of a single peer entry returned by `getPeers`. */
export interface Peer {
  clientId: number;
  userState: PresenceState;
}

/**
 * Return remote peers only (excludes the local client).
 */
export function getPeers(awareness: Awareness): Peer[] {
  const localClientId = awareness.doc.clientID;
  const states = awareness.getStates();
  const peers: Peer[] = [];
  states.forEach((state, clientId) => {
    if (clientId !== localClientId) {
      peers.push({ clientId, userState: state as PresenceState });
    }
  });
  return peers;
}

/**
 * Convenience wrapper: deterministic colour lookup cached per userId.
 */
const colorCache = new Map<string, string>();
export function cursorColorFor(userId: string): string {
  let c = colorCache.get(userId);
  if (c !== undefined) return c;
  c = deterministicCursorColor(userId);
  colorCache.set(userId, c);
  return c;
}
