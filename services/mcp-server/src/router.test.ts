import { describe, it, expect, beforeEach } from 'vitest';
import {
  claimCapability,
  grantCapability,
  revokeCapability,
  listCapabilities,
  resetRouter,
} from './router.js';
import type { Capability } from '@domio/agent-schema';

describe('mcp router', () => {
  beforeEach(() => resetRouter());

  it('returns PERMISSION_DENIED for unknown agents', () => {
    const r = claimCapability('unknown', 'rules:read');
    expect(r.granted).toBe(false);
    expect(r.reason).toBeDefined();
  });

  it('grants a capability when explicitly granted', () => {
    grantCapability('agent-1', 'rules:read');
    expect(claimCapability('agent-1', 'rules:read').granted).toBe(true);
  });

  it('revokes a capability', () => {
    grantCapability('agent-1', 'rules:read');
    revokeCapability('agent-1', 'rules:read');
    expect(claimCapability('agent-1', 'rules:read').granted).toBe(false);
  });

  it('isolates grants per agent', () => {
    grantCapability('agent-1', 'rules:read');
    expect(claimCapability('agent-2', 'rules:read').granted).toBe(false);
    expect(claimCapability('agent-1', 'rules:read').granted).toBe(true);
  });

  it('listCapabilities returns all granted capabilities', () => {
    const expected: Capability[] = ['rules:read', 'rules:write', 'variables:write'];
    expected.forEach((c) => grantCapability('a', c));
    const list = listCapabilities('a');
    expect(list.length).toBe(3);
    expect(new Set(list)).toEqual(new Set(expected));
  });

  it('rejects empty agentId', () => {
    const r = claimCapability('', 'rules:read');
    expect(r.granted).toBe(false);
    expect(r.reason).toContain('non-empty');
  });
});
