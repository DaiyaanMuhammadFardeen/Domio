/**
 * Permission engine — service tests.
 *
 * Covers:
 *   - createGrant validation errors
 *   - require() throws PermissionDeniedError with reason
 *   - check returns allowed:false for unknown actor
 *   - historical check uses `at`
 *   - audit recording when enabled
 */

import { describe, it, expect } from 'vitest';
import { PermissionService } from './service.js';
import { ValidationError, PermissionDeniedError } from './types.js';
import {
  InMemoryPermissionGrantStore,
  InMemoryWorkspaceMemberStore,
  InMemoryGroupMembershipStore,
  InMemoryResourceHierarchyStore,
} from './stores.js';
import { InMemoryPermissionAuditRecorder } from './audit.js';

// ---------------------------------------------------------------------------
// Test constants
// ---------------------------------------------------------------------------

const W = 'ws-1';
const F = 'folder-1';
const P = 'proj-1';
const D = 'deck-1';
const S = 'slide-1';
const U = 'alice';
const ACTOR = 'admin-user';

// ---------------------------------------------------------------------------
// Test factory
// ---------------------------------------------------------------------------

async function makeService(opts: { auditEnabled?: boolean } = {}) {
  let counter = 0;
  const idGen = (): string => `perm-${(counter++).toString().padStart(4, '0')}`;
  let now = new Date('2026-06-01T12:00:00Z');
  const clock = (): Date => now;
  const advanceTime = (ms: number): void => {
    now = new Date(now.getTime() + ms);
  };

  const grants = new InMemoryPermissionGrantStore();
  const workspaceMembers = new InMemoryWorkspaceMemberStore();
  const groupMemberships = new InMemoryGroupMembershipStore();
  const resourceHierarchy = new InMemoryResourceHierarchyStore();
  const audit = new InMemoryPermissionAuditRecorder(clock);

  // Wire up hierarchy
  await resourceHierarchy.setParent('slide', S, 'deck', D);
  await resourceHierarchy.setParent('deck', D, 'project', P);
  await resourceHierarchy.setParent('project', P, 'folder', F);
  await resourceHierarchy.setParent('folder', F, 'workspace', W);

  const svc = new PermissionService({
    grants,
    workspaceMembers,
    groupMemberships,
    resourceHierarchy,
    auditEnabled: opts.auditEnabled ?? false,
    audit,
    idGenerator: idGen,
    clock,
  });

  return {
    svc,
    grants,
    workspaceMembers,
    groupMemberships,
    resourceHierarchy,
    audit,
    idGen,
    clock,
    advanceTime,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PermissionService — createGrant validation', () => {
  it('throws ValidationError for missing resourceId', async () => {
    const { svc } = await makeService();
    await expect(
      svc.createGrant({
        resourceType: 'deck',
        resourceId: '',
        principalId: U,
        principalType: 'user',
        capabilities: ['edit'],
        createdBy: ACTOR,
      }),
    ).rejects.toThrow(ValidationError);
  });

  it('throws ValidationError for missing principalId', async () => {
    const { svc } = await makeService();
    await expect(
      svc.createGrant({
        resourceType: 'deck',
        resourceId: D,
        principalId: '',
        principalType: 'user',
        capabilities: ['edit'],
        createdBy: ACTOR,
      }),
    ).rejects.toThrow(ValidationError);
  });

  it('throws ValidationError for empty capabilities', async () => {
    const { svc } = await makeService();
    await expect(
      svc.createGrant({
        resourceType: 'deck',
        resourceId: D,
        principalId: U,
        principalType: 'user',
        capabilities: [],
        createdBy: ACTOR,
      }),
    ).rejects.toThrow(ValidationError);
  });

  it('throws ValidationError for missing createdBy', async () => {
    const { svc } = await makeService();
    await expect(
      svc.createGrant({
        resourceType: 'deck',
        resourceId: D,
        principalId: U,
        principalType: 'user',
        capabilities: ['edit'],
        createdBy: '',
      }),
    ).rejects.toThrow(ValidationError);
  });

  it('creates a valid grant', async () => {
    const { svc } = await makeService();
    const grant = await svc.createGrant({
      resourceType: 'deck',
      resourceId: D,
      principalId: U,
      principalType: 'user',
      capabilities: ['edit', 'view'],
      createdBy: ACTOR,
    });

    expect(grant.id).toBe('perm-0000');
    expect(grant.resourceType).toBe('deck');
    expect(grant.resourceId).toBe(D);
    expect(grant.capabilities).toEqual(['edit', 'view']);
    expect(grant.isDeny).toBe(false);
    expect(grant.createdBy).toBe(ACTOR);
  });

  it('creates a deny grant', async () => {
    const { svc } = await makeService();
    const grant = await svc.createGrant({
      resourceType: 'deck',
      resourceId: D,
      principalId: U,
      principalType: 'user',
      capabilities: ['edit'],
      isDeny: true,
      createdBy: ACTOR,
    });

    expect(grant.isDeny).toBe(true);
  });
});

describe('PermissionService — require()', () => {
  it('resolves successfully when allowed', async () => {
    const { svc } = await makeService();
    await svc.createGrant({
      resourceType: 'deck',
      resourceId: D,
      principalId: U,
      principalType: 'user',
      capabilities: ['edit'],
      createdBy: ACTOR,
    });

    // Should not throw
    await expect(svc.require(U, 'edit', 'deck', D)).resolves.toBeUndefined();
  });

  it('throws PermissionDeniedError when denied', async () => {
    const { svc } = await makeService();
    // No grants → deny
    await expect(svc.require(U, 'edit', 'deck', D)).rejects.toThrow(PermissionDeniedError);
  });

  it('PermissionDeniedError contains correct fields', async () => {
    const { svc } = await makeService();
    try {
      await svc.require(U, 'edit', 'deck', D);
      expect.fail('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(PermissionDeniedError);
      const err = e as PermissionDeniedError;
      expect(err.code).toBe('PERMISSION_DENIED');
      expect(err.principalId).toBe(U);
      expect(err.capability).toBe('edit');
      expect(err.resourceType).toBe('deck');
      expect(err.resourceId).toBe(D);
    }
  });
});

describe('PermissionService — checkPermission', () => {
  it('returns allowed:true for matching grant', async () => {
    const { svc } = await makeService();
    await svc.createGrant({
      resourceType: 'deck',
      resourceId: D,
      principalId: U,
      principalType: 'user',
      capabilities: ['view'],
      createdBy: ACTOR,
    });

    const result = await svc.checkPermission({
      principalId: U,
      resourceType: 'deck',
      resourceId: D,
      capability: 'view',
    });

    expect(result.allowed).toBe(true);
    expect(result.decision).toBe('allow');
  });

  it('returns allowed:false for unknown actor', async () => {
    const { svc } = await makeService();
    await svc.createGrant({
      resourceType: 'deck',
      resourceId: D,
      principalId: U,
      principalType: 'user',
      capabilities: ['edit'],
      createdBy: ACTOR,
    });

    const result = await svc.checkPermission({
      principalId: 'unknown-user',
      resourceType: 'deck',
      resourceId: D,
      capability: 'edit',
    });

    expect(result.allowed).toBe(false);
    expect(result.decision).toBe('deny');
  });

  it('returns allowed:false when capability not in grant', async () => {
    const { svc } = await makeService();
    await svc.createGrant({
      resourceType: 'deck',
      resourceId: D,
      principalId: U,
      principalType: 'user',
      capabilities: ['view'],
      createdBy: ACTOR,
    });

    const result = await svc.checkPermission({
      principalId: U,
      resourceType: 'deck',
      resourceId: D,
      capability: 'edit',
    });

    expect(result.allowed).toBe(false);
  });

  it('throws ValidationError for missing principalId', async () => {
    const { svc } = await makeService();
    await expect(
      svc.checkPermission({
        principalId: '',
        resourceType: 'deck',
        resourceId: D,
        capability: 'edit',
      }),
    ).rejects.toThrow(ValidationError);
  });

  it('throws ValidationError for missing capability', async () => {
    const { svc } = await makeService();
    await expect(
      svc.checkPermission({
        principalId: U,
        resourceType: 'deck',
        resourceId: D,
        capability: '',
      }),
    ).rejects.toThrow(ValidationError);
  });
});

describe('PermissionService — historical check (at)', () => {
  it('uses at timestamp for point-in-time evaluation', async () => {
    const { svc } = await makeService();
    // Grant active from 2026-01 to 2026-12
    await svc.createGrant({
      resourceType: 'deck',
      resourceId: D,
      principalId: U,
      principalType: 'user',
      capabilities: ['edit'],
      effectiveFrom: new Date('2026-01-01T00:00:00Z'),
      effectiveTo: new Date('2026-12-31T23:59:59Z'),
      createdBy: ACTOR,
    });

    // At active time → allowed
    const result1 = await svc.checkPermission({
      principalId: U,
      resourceType: 'deck',
      resourceId: D,
      capability: 'edit',
      at: new Date('2026-06-01T00:00:00Z'),
    });
    expect(result1.allowed).toBe(true);

    // Before grant active → denied
    const result2 = await svc.checkPermission({
      principalId: U,
      resourceType: 'deck',
      resourceId: D,
      capability: 'edit',
      at: new Date('2025-12-31T23:59:59Z'),
    });
    expect(result2.allowed).toBe(false);

    // After grant expired → denied
    const result3 = await svc.checkPermission({
      principalId: U,
      resourceType: 'deck',
      resourceId: D,
      capability: 'edit',
      at: new Date('2027-01-01T00:00:00Z'),
    });
    expect(result3.allowed).toBe(false);
  });
});

describe('PermissionService — listGrants', () => {
  it('lists all grants for a resource', async () => {
    const { svc } = await makeService();
    await svc.createGrant({
      resourceType: 'deck',
      resourceId: D,
      principalId: U,
      principalType: 'user',
      capabilities: ['edit'],
      createdBy: ACTOR,
    });
    await svc.createGrant({
      resourceType: 'deck',
      resourceId: D,
      principalId: 'bob',
      principalType: 'user',
      capabilities: ['view'],
      createdBy: ACTOR,
    });

    const grants = await svc.listGrants('deck', D);
    expect(grants).toHaveLength(2);
  });

  it('returns empty array for resource with no grants', async () => {
    const { svc } = await makeService();
    const grants = await svc.listGrants('deck', 'nonexistent');
    expect(grants).toHaveLength(0);
  });
});

describe('PermissionService — audit', () => {
  it('records audit event when auditEnabled is true', async () => {
    const { svc, audit } = await makeService({ auditEnabled: true });
    await svc.createGrant({
      resourceType: 'deck',
      resourceId: D,
      principalId: U,
      principalType: 'user',
      capabilities: ['edit'],
      createdBy: ACTOR,
    });

    const events = await audit.list();
    expect(events).toHaveLength(1);
    expect(events[0]!.service).toBe('permission-engine');
    expect(events[0]!.eventType).toBe('permission.granted');
  });

  it('does not record audit when auditEnabled is false', async () => {
    const { svc, audit } = await makeService({ auditEnabled: false });
    await svc.createGrant({
      resourceType: 'deck',
      resourceId: D,
      principalId: U,
      principalType: 'user',
      capabilities: ['edit'],
      createdBy: ACTOR,
    });

    const events = await audit.list();
    expect(events).toHaveLength(0);
  });
});

describe('PermissionService — group membership integration', () => {
  it('allows via group grant through membership', async () => {
    const { svc, groupMemberships } = await makeService();
    await groupMemberships.addMembership('group-admins', U);

    await svc.createGrant({
      resourceType: 'deck',
      resourceId: D,
      principalId: 'group-admins',
      principalType: 'group',
      capabilities: ['manage_permissions'],
      createdBy: ACTOR,
    });

    const result = await svc.checkPermission({
      principalId: U,
      resourceType: 'deck',
      resourceId: D,
      capability: 'manage_permissions',
    });

    expect(result.allowed).toBe(true);
  });
});

describe('PermissionService — workspace role baseline', () => {
  it('allows viewer to view via role baseline', async () => {
    const { svc, workspaceMembers } = await makeService();
    await workspaceMembers.upsert({
      id: 'wm-1',
      workspaceId: W,
      userId: U,
      role: 'viewer',
      capabilities: [],
      effectiveFrom: new Date('2026-01-01T00:00:00Z'),
      effectiveTo: null,
    });

    const result = await svc.checkPermission({
      principalId: U,
      resourceType: 'deck',
      resourceId: D,
      capability: 'view',
    });

    expect(result.allowed).toBe(true);
    expect(result.reason).toContain('workspace role baseline: viewer');
  });

  it('denies viewer to edit via role baseline', async () => {
    const { svc, workspaceMembers } = await makeService();
    await workspaceMembers.upsert({
      id: 'wm-1',
      workspaceId: W,
      userId: U,
      role: 'viewer',
      capabilities: [],
      effectiveFrom: new Date('2026-01-01T00:00:00Z'),
      effectiveTo: null,
    });

    const result = await svc.checkPermission({
      principalId: U,
      resourceType: 'deck',
      resourceId: D,
      capability: 'edit',
    });

    expect(result.allowed).toBe(false);
  });
});

describe('PermissionService — deny overrides', () => {
  it('deny at target level overrides workspace allow', async () => {
    const { svc } = await makeService();
    await svc.createGrant({
      resourceType: 'workspace',
      resourceId: W,
      principalId: U,
      principalType: 'user',
      capabilities: ['edit'],
      createdBy: ACTOR,
    });
    await svc.createGrant({
      resourceType: 'deck',
      resourceId: D,
      principalId: U,
      principalType: 'user',
      capabilities: ['edit'],
      isDeny: true,
      createdBy: ACTOR,
    });

    const result = await svc.checkPermission({
      principalId: U,
      resourceType: 'deck',
      resourceId: D,
      capability: 'edit',
    });

    expect(result.allowed).toBe(false);
  });

  it('deny at ancestor blocks descendant even with descendant allow', async () => {
    const { svc } = await makeService();
    await svc.createGrant({
      resourceType: 'folder',
      resourceId: F,
      principalId: U,
      principalType: 'user',
      capabilities: ['edit'],
      isDeny: true,
      createdBy: ACTOR,
    });
    await svc.createGrant({
      resourceType: 'deck',
      resourceId: D,
      principalId: U,
      principalType: 'user',
      capabilities: ['edit'],
      createdBy: ACTOR,
    });

    const result = await svc.checkPermission({
      principalId: U,
      resourceType: 'deck',
      resourceId: D,
      capability: 'edit',
    });

    expect(result.allowed).toBe(false);
  });
});
