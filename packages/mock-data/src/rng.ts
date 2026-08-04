/**
 * Seeded PRNG (mulberry32) and distribution helpers.
 *
 * Deterministic: same seed always produces the same sequence.
 * All helpers are pure — no hidden state between calls.
 */

/** Mulberry32: fast 32-bit seeded PRNG. Returns [0, 1). */
export function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Uniform random in [min, max). */
export function uniform(rng: () => number, min = 0, max = 1): number {
  return min + rng() * (max - min);
}

/** Box-Muller normal distribution. */
export function normal(rng: () => number, mean = 0, stddev = 1): number {
  const u1 = rng();
  const u2 = rng();
  const z = Math.sqrt(-2 * Math.log(u1 || 1e-10)) * Math.cos(2 * Math.PI * u2);
  return mean + stddev * z;
}

/** Lognormal: exp(normal(mean, stddev)). */
export function lognormal(rng: () => number, mean = 0, stddev = 1): number {
  return Math.exp(normal(rng, mean, stddev));
}

/** Poisson distribution via Knuth's algorithm. */
export function poisson(rng: () => number, lambda = 1): number {
  const L = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= rng();
  } while (p > L && k < 1000);
  return k - 1;
}

/** Categorical: pick one from categories with equal weight. */
export function categorical(rng: () => number, categories: string[]): string {
  if (categories.length === 0) return '';
  return categories[Math.floor(rng() * categories.length)]!;
}

/** Pick a random element from an array. */
export function pick<T>(rng: () => number, arr: T[]): T {
  return arr[Math.floor(rng() * arr.length)]!;
}

/** Fisher-Yates shuffle (in-place, returns same array). */
export function shuffle<T>(rng: () => number, arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = tmp;
  }
  return arr;
}

/** Generate a date between start and end. */
export function dateBetween(rng: () => number, start: Date, end: Date): Date {
  const t = start.getTime() + rng() * (end.getTime() - start.getTime());
  return new Date(t);
}

/** Generate a datetime (same as dateBetween but aliased for clarity). */
export function datetimeBetween(rng: () => number, start: Date, end: Date): Date {
  return dateBetween(rng, start, end);
}
