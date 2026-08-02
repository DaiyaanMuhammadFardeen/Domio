import { describe, it, expect } from 'vitest';
import {
  parseSemver,
  isSemver,
  compareSemver,
  compareVersionStrings,
  sortVersions,
  maxVersion,
  matchesRange,
  resolvePolicyTarget,
  type SemVer,
} from './semver.js';

describe('semver', () => {
  describe('parseSemver', () => {
    it('parses standard semver', () => {
      expect(parseSemver('1.2.3')).toEqual({ major: 1, minor: 2, patch: 3, prerelease: undefined });
    });
    it('parses prerelease', () => {
      const v = parseSemver('1.2.3-beta.1');
      expect(v).not.toBeNull();
      expect(v!.prerelease).toBe('beta.1');
    });
    it('parses build metadata', () => {
      const v = parseSemver('1.2.3+build.456');
      expect(v).not.toBeNull();
      expect(v!.major).toBe(1);
    });
    it('returns null for invalid', () => {
      expect(parseSemver('not-a-version')).toBeNull();
      expect(parseSemver('1.2')).toBeNull();
      expect(parseSemver('v1.2.3')).toBeNull();
    });
    it('trims whitespace', () => {
      expect(parseSemver('  1.2.3  ')).not.toBeNull();
    });
  });

  describe('isSemver', () => {
    it('returns true for valid', () => expect(isSemver('1.0.0')).toBe(true));
    it('returns false for invalid', () => expect(isSemver('abc')).toBe(false));
  });

  describe('compareSemver', () => {
    it('compares major', () => {
      expect(compareSemver({ major: 2, minor: 0, patch: 0 }, { major: 1, minor: 0, patch: 0 })).toBeGreaterThan(0);
    });
    it('compares minor', () => {
      expect(compareSemver({ major: 1, minor: 3, patch: 0 }, { major: 1, minor: 2, patch: 0 })).toBeGreaterThan(0);
    });
    it('compares patch', () => {
      expect(compareSemver({ major: 1, minor: 2, patch: 4 }, { major: 1, minor: 2, patch: 3 })).toBeGreaterThan(0);
    });
    it('equal returns 0', () => {
      expect(compareSemver({ major: 1, minor: 2, patch: 3 }, { major: 1, minor: 2, patch: 3 })).toBe(0);
    });
    it('release > prerelease', () => {
      const a: SemVer = { major: 1, minor: 0, patch: 0 };
      const b: SemVer = { major: 1, minor: 0, patch: 0, prerelease: 'alpha' };
      expect(compareSemver(a, b)).toBe(1);
    });
    it('prerelease < release', () => {
      const a: SemVer = { major: 1, minor: 0, patch: 0, prerelease: 'alpha' };
      const b: SemVer = { major: 1, minor: 0, patch: 0 };
      expect(compareSemver(a, b)).toBe(-1);
    });
    it('prerelease compared alphabetically', () => {
      const a: SemVer = { major: 1, minor: 0, patch: 0, prerelease: 'alpha' };
      const b: SemVer = { major: 1, minor: 0, patch: 0, prerelease: 'beta' };
      expect(compareSemver(a, b)).toBe(-1);
    });
  });

  describe('compareVersionStrings', () => {
    it('compares semver strings', () => {
      expect(compareVersionStrings('1.0.0', '2.0.0')).toBeLessThan(0);
    });
    it('falls back to localeCompare for non-semver', () => {
      expect(compareVersionStrings('abc', 'abd')).toBeLessThan(0);
    });
  });

  describe('sortVersions', () => {
    it('sorts semver ascending', () => {
      expect(sortVersions(['2.0.0', '1.0.0', '1.1.0'])).toEqual(['1.0.0', '1.1.0', '2.0.0']);
    });
    it('handles prerelease', () => {
      const sorted = sortVersions(['1.0.0', '1.0.0-beta', '1.0.0-alpha']);
      expect(sorted[0]).toBe('1.0.0-alpha');
      expect(sorted[1]).toBe('1.0.0-beta');
    });
  });

  describe('maxVersion', () => {
    it('returns highest', () => { expect(maxVersion(['1.0.0', '2.0.0', '1.5.0'])).toBe('2.0.0'); });
    it('returns null for empty', () => { expect(maxVersion([])).toBeNull(); });
  });

  describe('matchesRange', () => {
    it('exact match', () => { expect(matchesRange('1.2.3', '1.2.3')).toBe(true); });
    it('exact mismatch', () => { expect(matchesRange('1.2.3', '1.2.4')).toBe(false); });
    it('^1.2.3 matches 1.2.4', () => { expect(matchesRange('1.2.4', '^1.2.3')).toBe(true); });
    it('^1.2.3 no match 2.0.0', () => { expect(matchesRange('2.0.0', '^1.2.3')).toBe(false); });
    it('^1.2.3 no match 1.1.0', () => { expect(matchesRange('1.1.0', '^1.2.3')).toBe(false); });
    it('^1.2.3 no match 1.2.2', () => { expect(matchesRange('1.2.2', '^1.2.3')).toBe(false); });
    it('~1.2.3 matches 1.2.5', () => { expect(matchesRange('1.2.5', '~1.2.3')).toBe(true); });
    it('~1.2.3 no match 1.3.0', () => { expect(matchesRange('1.3.0', '~1.2.3')).toBe(false); });
    it('~1.2.3 no match 1.2.2', () => { expect(matchesRange('1.2.2', '~1.2.3')).toBe(false); });
    it('1.x matches major', () => { expect(matchesRange('1.5.0', '1.x')).toBe(true); });
    it('1.x no match 2.0.0', () => { expect(matchesRange('2.0.0', '1.x')).toBe(false); });
    it('1.2.x matches 1.2.3', () => { expect(matchesRange('1.2.3', '1.2.x')).toBe(true); });
    it('1.2.x no match 1.3.0', () => { expect(matchesRange('1.3.0', '1.2.x')).toBe(false); });
    it('1.* matches major', () => { expect(matchesRange('1.9.9', '1.*')).toBe(true); });
    it('returns false for invalid version', () => { expect(matchesRange('not-semver', '1.0.0')).toBe(false); });
    it('|| with space-separated intervals', () => { expect(matchesRange('1.5.0', '>=1.0.0 <2.0.0 || >=3.0.0')).toBe(true); });
    it('|| alternates false', () => { expect(matchesRange('2.5.0', '>=1.0.0 <2.0.0 || >=3.0.0')).toBe(false); });
    it('>1.0.0 matches 2.0.0', () => { expect(matchesRange('2.0.0', '>1.0.0')).toBe(true); });
    it('>1.0.0 no match 1.0.0', () => { expect(matchesRange('1.0.0', '>1.0.0')).toBe(false); });
    it('<2.0.0 matches 1.0.0', () => { expect(matchesRange('1.0.0', '<2.0.0')).toBe(true); });
    it('<2.0.0 no match 2.0.0', () => { expect(matchesRange('2.0.0', '<2.0.0')).toBe(false); });
    it('>=1.0.0 matches 1.0.0', () => { expect(matchesRange('1.0.0', '>=1.0.0')).toBe(true); });
    it('>=1.0.0 no match 0.9.0', () => { expect(matchesRange('0.9.0', '>=1.0.0')).toBe(false); });
    it('<=1.0.0 matches 1.0.0', () => { expect(matchesRange('1.0.0', '<=1.0.0')).toBe(true); });
    it('<=1.0.0 no match 1.1.0', () => { expect(matchesRange('1.1.0', '<=1.0.0')).toBe(false); });
    it('invalid ^ range', () => { expect(matchesRange('1.0.0', '^abc')).toBe(false); });
    it('invalid ~ range', () => { expect(matchesRange('1.0.0', '~abc')).toBe(false); });
    it('complex range: >=1.0.0 <2.0.0', () => { expect(matchesRange('1.5.0', '>=1.0.0 <2.0.0')).toBe(true); });
    it('complex range: >=1.0.0 <2.0.0 no match', () => { expect(matchesRange('2.0.0', '>=1.0.0 <2.0.0')).toBe(false); });
    it('1.x || 2.x matches 3.0.0 no (|| with .x not supported)', () => { expect(matchesRange('3.0.0', '1.x || 2.x')).toBe(false); });
  });

  describe('resolvePolicyTarget', () => {
    it('latest picks highest', () => {
      expect(resolvePolicyTarget(['1.0.0', '2.0.0'], 'latest')).toBe('2.0.0');
    });
    it('patch picks latest matching major.minor of the highest version', () => {
      // Highest is 1.1.0, so patch matches major=1,minor=1 → first in reverse-sorted order = 1.1.0
      expect(resolvePolicyTarget(['1.0.0', '1.0.1', '1.1.0'], 'patch')).toBe('1.1.0');
    });
    it('patch with multiple same minor', () => {
      expect(resolvePolicyTarget(['1.0.0', '1.0.1', '1.0.2'], 'patch')).toBe('1.0.2');
    });
    it('minor picks latest matching major of the highest version', () => {
      // Highest is 2.0.0, so minor matches major=2 → 2.0.0
      expect(resolvePolicyTarget(['1.0.0', '1.1.0', '2.0.0'], 'minor')).toBe('2.0.0');
    });
    it('minor with multiple same major', () => {
      expect(resolvePolicyTarget(['1.0.0', '1.1.0', '1.2.0'], 'minor')).toBe('1.2.0');
    });
    it('pinned picks highest', () => {
      expect(resolvePolicyTarget(['1.0.0', '2.0.0'], 'pinned')).toBe('2.0.0');
    });
    it('returns null for empty', () => {
      expect(resolvePolicyTarget([], 'latest')).toBeNull();
    });
  });
});
