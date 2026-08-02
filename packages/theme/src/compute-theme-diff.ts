/**
 * @domio/theme — Theme diff computation.
 *
 * Compares two token maps and returns which tokens changed vs unchanged.
 * Used by the theme swap UI to show a preview of what will change.
 */

import type {
  TokenRef,
  TokenValue,
  ThemeDiffEntry,
} from './types.js';

/**
 * Compute the diff between two theme token maps.
 *
 * Returns entries for all tokens in either map, with a `changed` flag
 * indicating whether the value differs between A and B.
 */
export function computeThemeDiff(
  themeA: ReadonlyMap<TokenRef, TokenValue>,
  themeB: ReadonlyMap<TokenRef, TokenValue>,
): readonly ThemeDiffEntry[] {
  const allTokens = new Set<TokenRef>([...themeA.keys(), ...themeB.keys()]);
  const diff: ThemeDiffEntry[] = [];

  for (const tokenId of allTokens) {
    const valA = themeA.get(tokenId) ?? null;
    const valB = themeB.get(tokenId) ?? null;
    const changed = !tokenValuesEqual(valA, valB);
    diff.push({ tokenId, changed, valueA: valA, valueB: valB });
  }

  return diff;
}

/**
 * Deep-equality check for TokenValue objects.
 * Handles the discriminated union by comparing type + serialized value.
 */
function tokenValuesEqual(a: TokenValue | null, b: TokenValue | null): boolean {
  if (a === null && b === null) return true;
  if (a === null || b === null) return false;
  if (a.type !== b.type) return false;
  return JSON.stringify(a.value) === JSON.stringify(b.value);
}
