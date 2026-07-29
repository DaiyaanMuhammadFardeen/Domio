import { describe, it, expect } from 'vitest';
import {
  isValidResourceId,
  resourceIdToString,
  parseResourceId,
  newId,
  newToken,
} from './ids.js';

describe('ResourceId', () => {
  it('accepts a valid resource id', () => {
    expect(
      isValidResourceId({ kind: 'deck', org_id: 'org-1', tenant_id: 'tenant-1', id: 'd-1' }),
    ).toBe(true);
  });

  it('rejects a resource id with bad kind', () => {
    expect(
      isValidResourceId({ kind: 'Deck', org_id: 'org-1', tenant_id: 'tenant-1', id: 'd-1' }),
    ).toBe(false);
  });

  it('rejects a resource id with bad id', () => {
    expect(
      isValidResourceId({ kind: 'deck', org_id: 'org-1', tenant_id: 'tenant-1', id: '' }),
    ).toBe(false);
  });

  it('round-trips via string', () => {
    const rid = { kind: 'deck', org_id: 'a', tenant_id: 'b', id: 'c' };
    expect(parseResourceId(resourceIdToString(rid))).toEqual(rid);
  });
});

describe('newId', () => {
  it('returns a UUID-shaped string', () => {
    const id = newId();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it('returns unique values', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) ids.add(newId());
    expect(ids.size).toBe(100);
  });
});

describe('newToken', () => {
  it('returns a base64url-shaped string', () => {
    expect(newToken()).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('returns unique values', () => {
    const tokens = new Set<string>();
    for (let i = 0; i < 100; i++) tokens.add(newToken());
    expect(tokens.size).toBe(100);
  });
});