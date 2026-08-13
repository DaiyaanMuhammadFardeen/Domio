export const DECK_SCHEMA_VERSION = '1.0.0';

/** True when two schema versions can safely exchange an additive document. */
export function SEMVER_COMPATIBLE(
  fromVersion: string,
  toVersion: string = DECK_SCHEMA_VERSION,
): boolean {
  const from = parseVersion(fromVersion);
  const to = parseVersion(toVersion);
  return from !== null && to !== null && from.major === to.major;
}

export interface Semver {
  major: number;
  minor: number;
  patch: number;
}

export function parseVersion(value: string): Semver | null {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(value);
  if (!match) return null;
  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) };
}
