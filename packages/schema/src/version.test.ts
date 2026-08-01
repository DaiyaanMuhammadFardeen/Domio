import { describe, it, expect } from 'vitest';
import { DECK_SCHEMA_VERSION, parseVersion, SEMVER_COMPATIBLE } from './version.js';

describe('schema version', () => {
  it('exposes a v1 major schema version', () => {
    expect(parseVersion(DECK_SCHEMA_VERSION)).toEqual({ major: 1, minor: 0, patch: 0 });
  });

  it('parses semver-like strings', () => {
    expect(parseVersion('2.3.4')).toEqual({ major: 2, minor: 3, patch: 4 });
  });

  it('returns null for invalid versions', () => {
    expect(parseVersion('v1.0.0')).toBeNull();
    expect(parseVersion('1.0')).toBeNull();
  });

  it('SEMVER_COMPATIBLE accepts same-major versions', () => {
    expect(SEMVER_COMPATIBLE('1.0.0', '1.4.0')).toBe(true);
    expect(SEMVER_COMPATIBLE('1.4.0', '1.0.0')).toBe(true);
  });

  it('SEMVER_COMPATIBLE rejects different-major versions', () => {
    expect(SEMVER_COMPATIBLE('1.0.0', '2.0.0')).toBe(false);
    expect(SEMVER_COMPATIBLE('0.9.0', '1.0.0')).toBe(false);
  });
});
