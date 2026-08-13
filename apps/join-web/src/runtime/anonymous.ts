/**
 * Anonymous-mode handle generator.
 *
 * Per Wave 5 §S5.10 of docs/frontend-roadmap/05-wave-audience-participation.md.
 *
 * `generateHandle()` returns a stable, opaque 2-word handle from a
 * curated HANDLES list. The generator is non-cryptographic — handles
 * are display aliases only, never cryptographic identifiers.
 *
 * The function accepts an optional `rng()` so tests can pin the
 * random seed. By default it uses `Math.random`.
 *
 *   generateHandle()  →  "Cosmic Otter"
 *   generateHandle()  →  "Quiet Falcon"
 *   HANDLES.length  ===  ≥ 20
 */

export const HANDLES: ReadonlyArray<string> = [
  'Cosmic Otter',
  'Quiet Falcon',
  'Bright Comet',
  'Lucky Lynx',
  'Gentle Heron',
  'Swift Fox',
  'Honest Bear',
  'Mellow Moose',
  'Calm Cricket',
  'Sunny Sparrow',
  'Brave Badger',
  'Cheerful Cub',
  'Daring Diver',
  'Easy Eagle',
  'Friendly Finch',
  'Gliding Goose',
  'Humble Hare',
  'Jovial Jay',
  'Kind Koala',
  'Lively Lark',
  'Merry Marten',
  'Noble Newt',
  'Plucky Penguin',
  'Radiant Raven',
  'Stalwart Stork',
];

export type HandleRng = () => number;

export function generateHandle(rng: HandleRng = Math.random): string {
  const list = HANDLES as ReadonlyArray<string>;
  if (list.length === 0) return 'Anon';
  const idx = Math.max(0, Math.min(list.length - 1, Math.floor(rng() * list.length)));
  // The type-system asserts list[idx] exists; the runtime guard is for
  // the rare empty-list case.
  const out = (list[idx] ?? list[0]) as string;
  return out;
}