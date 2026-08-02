/**
 * Deterministic ULID-shaped id generation for component expansion.
 *
 * Rendering a component instance must be deterministic: the same element
 * id + variant must always produce the same child ids, so re-renders,
 * snapshots, and offline replays never churn the scene graph.
 */

import type { ULID } from '@domio/schema';

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // Crockford base32 (no I L O U)

/** FNV-1a 32-bit hash of a string — deterministic seed source. */
export function hashSeed(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Mulberry32 PRNG — small, fast, deterministic. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Creates a ULID factory seeded from a string (id + variant + props hash). */
export function createIdFactory(seedBase: string): () => ULID {
  const rand = mulberry32(hashSeed(seedBase));
  return () => {
    let out = '';
    for (let i = 0; i < 26; i += 1) {
      out += ALPHABET[Math.floor(rand() * ALPHABET.length)];
    }
    return out as ULID;
  };
}

/** Stable seed for a component instance expansion. */
export function seedFor(instanceId: string, variantId: string, props: Record<string, unknown>): string {
  return `${instanceId}::${variantId}::${stableStringify(props)}`;
}

/** Order-stable JSON stringify for seeding. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const keys = Object.keys(value as Record<string, unknown>).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify((value as Record<string, unknown>)[k])}`).join(',')}}`;
}
