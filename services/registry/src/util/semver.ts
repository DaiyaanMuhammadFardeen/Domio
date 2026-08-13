/** Minimal semver utilities for pin/range resolution (no external deps). */

export interface SemVer {
  major: number;
  minor: number;
  patch: number;
  prerelease?: string | undefined;
}

export function parseSemver(input: string): SemVer | null {
  const m = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z-.]+))?(?:\+[0-9A-Za-z-.]+)?$/.exec(input.trim());
  if (!m) return null;
  return {
    major: Number(m[1]),
    minor: Number(m[2]),
    patch: Number(m[3]),
    prerelease: m[4],
  };
}

export function isSemver(input: string): boolean {
  return parseSemver(input) !== null;
}

export function compareSemver(a: SemVer, b: SemVer): number {
  if (a.major !== b.major) return a.major - b.major;
  if (a.minor !== b.minor) return a.minor - b.minor;
  if (a.patch !== b.patch) return a.patch - b.patch;
  const ap = a.prerelease ?? '';
  const bp = b.prerelease ?? '';
  if (ap === bp) return 0;
  if (ap === '') return 1; // release > prerelease
  if (bp === '') return -1;
  return ap < bp ? -1 : 1;
}

export function compareVersionStrings(a: string, b: string): number {
  const pa = parseSemver(a);
  const pb = parseSemver(b);
  if (!pa || !pb) return a.localeCompare(b);
  return compareSemver(pa, pb);
}

/** Sort versions ascending (semver aware). */
export function sortVersions(versions: string[]): string[] {
  return [...versions].sort(compareVersionStrings);
}

export function maxVersion(versions: string[]): string | null {
  const sorted = sortVersions(versions);
  return sorted.length ? sorted[sorted.length - 1]! : null;
}

/** Match "1.2.3", "1.2.x", "1.x", "^1.2.3", "~1.2.3". */
export function matchesRange(version: string, range: string): boolean {
  const v = parseSemver(version);
  if (!v) return false;
  const r = range.trim();
  if (isSemver(r)) return compareVersionStrings(version, r) === 0;

  if (r.startsWith('^')) {
    const base = parseSemver(r.slice(1));
    if (!base) return false;
    if (base.major !== v.major) return false;
    if (base.minor > v.minor) return false;
    if (base.minor === v.minor && base.patch > v.patch) return false;
    return true;
  }
  if (r.startsWith('~')) {
    const base = parseSemver(r.slice(1));
    if (!base) return false;
    return base.major === v.major && base.minor === v.minor && base.patch <= v.patch;
  }
  if (r.endsWith('.x') || r.endsWith('.*')) {
    const prefix = r.slice(0, -2);
    const parts = prefix.split('.');
    if (parts.length === 1) return v.major === Number(parts[0]);
    if (parts.length === 2) return v.major === Number(parts[0]) && v.minor === Number(parts[1]);
    return false;
  }
  if (r.includes(',') || r.includes('||')) {
    // interval: ">=1.2.0 <2.0.0" or "1.x || 2.x"
    const alternatives = r.split('||').map((s) => s.trim());
    return alternatives.some((alt) => matchInterval(version, alt));
  }
  return matchInterval(version, r);
}

function matchInterval(version: string, interval: string): boolean {
  const clauses = interval.split(/\s+/).filter(Boolean);
  if (clauses.length === 1) {
    const c = clauses[0]!;
    if (c.startsWith('>=')) return compareVersionStrings(version, c.slice(2)) >= 0;
    if (c.startsWith('<=')) return compareVersionStrings(version, c.slice(2)) <= 0;
    if (c.startsWith('>')) return compareVersionStrings(version, c.slice(1)) > 0;
    if (c.startsWith('<')) return compareVersionStrings(version, c.slice(1)) < 0;
    return matchesRange(version, c);
  }
  return clauses.every((c) => matchInterval(version, c));
}

/** Latest version matching a patch/minor policy mode. */
export function resolvePolicyTarget(
  versions: string[],
  mode: 'latest' | 'patch' | 'minor' | 'pinned',
): string | null {
  if (mode === 'latest') return maxVersion(versions);
  const sorted = sortVersions(versions).reverse();
  const latest = sorted[0];
  if (!latest) return null;
  const lv = parseSemver(latest)!;
  if (mode === 'patch') {
    return (
      sorted.find((v) => {
        const p = parseSemver(v)!;
        return p.major === lv.major && p.minor === lv.minor;
      }) ?? latest
    );
  }
  if (mode === 'minor') {
    return (
      sorted.find((v) => {
        const p = parseSemver(v)!;
        return p.major === lv.major;
      }) ?? latest
    );
  }
  return latest;
}
