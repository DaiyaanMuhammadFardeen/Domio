/**
 * Permission engine — resolver tests.
 *
 * Covers:
 *   - Deny overrides allow at same level
 *   - Deny at ancestor blocks descendant
 *   - Role baseline grants view to viewer
 *   - Temporal: grant not effective before effective_from / after effective_to
 *   - Inheritance workspace → deck
 *   - Group grant applies via membership
 *   - Point-in-time resolution
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { resolvePermission, buildAncestorChain } from './resolver.js';
import type { ResolverContext } from './resolver.js';
import type { ResourceType, PermissionGrant, WorkspaceRole } from './types.js';
import {
  InMemoryPermissionGrantStore,
  InMemoryWorkspaceMemberStore,
  InMemoryGroupMembershipStore,
  InMemoryResourceHierarchyStore,
} from './stores.js';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const W = 'ws-1';
const F = 'folder-1';
const P = 'proj-1';
const D = 'deck-1';
const S = 'slide-1';
const U = 'alice';
const G = 'editors-group';

function grant(
  resourceType: ResourceType,
  resourceId: string,
  principalId: string,
  principalType: 'user' | 'group',
  capabilities: string[],
  isDeny: boolean,
  effectiveFrom?: Date,
  effectiveTo?: Date | null,
): PermissionGrant {
  const now = new Date('2026-01-01T00:00:00Z');
  return {
    id: `g-${Math.random().toString(36).slice(2, 8)}`,
    resourceType,
    resourceId,
    principalId,
    principalType,
    capabilities,
    isDeny,
    effectiveFrom: effectiveFrom ?? now,
    effectiveTo: effectiveTo ?? null,
    createdAt: now,
    updatedAt: now,
    createdBy: 'system',
    updatedBy: 'system',
  };
}

function buildCtx(opts: {
  grants?: PermissionGrant[];
  role?: WorkspaceRole;
  groups?: string[];
}): ResolverContext {
  const grantStore = new InMemoryPermissionGrantStore();
  const memberStore = new InMemoryWorkspaceMemberStore();
  const groupStore = new InMemoryGroupMembershipStore();
  const hierarchyStore = new InMemoryResourceHierarchyStore();

  // Wire up hierarchy: slide → deck → project → folder → workspace
  const setup = async () => {
    await hierarchyStore.setParent('slide', S, 'deck', D);
    await hierarchyStore.setParent('deck', D, 'project', P);
    await hierarchyStore.setParent('project', P, 'folder', F);
    await hierarchyStore.setParent('folder', F, 'workspace', W);

    for (const g of opts.grants ?? []) {
      await grantStore.insert(g);
    }

    if (opts.role) {
      const now = new Date('2026-01-01T00:00:00Z');
      await (memberStore as any).upsert({
        id: `wm-${Math.random().toString(36).slice(2, 8)}`,
        workspaceId: W,
        userId: U,
        role: opts.role,
        capabilities: [],
        effectiveFrom: now,
        effectiveTo: null,
      });
    }

    for (const gid of opts.groups ?? []) {
      await groupStore.addMembership(gid, U);
    }
  };

  // We return a "thenable" that resolves to the context
  return {
    getGrantsForResource: (rt, rid) => grantStore.findByResource(rt, rid),
    getWorkspaceMember: (wid, uid) => memberStore.findByWorkspaceAndUser(wid, uid),
    getGroupIdsForUser: (uid) => groupStore.findGroupsForUser(uid),
    getParentResource: (rt, rid) => hierarchyStore.findParent(rt, rid),
  };
}

async function setupCtx(opts: {
  grants?: PermissionGrant[];
  role?: WorkspaceRole;
  groups?: string[];
}): Promise<ResolverContext> {
  const grantStore = new InMemoryPermissionGrantStore();
  const memberStore = new InMemoryWorkspaceMemberStore();
  const groupStore = new InMemoryGroupMembershipStore();
  const hierarchyStore = new InMemoryResourceHierarchyStore();

  await hierarchyStore.setParent('slide', S, 'deck', D);
  await hierarchyStore.setParent('deck', D, 'project', P);
  await hierarchyStore.setParent('project', P, 'folder', F);
  await hierarchyStore.setParent('folder', F, 'workspace', W);

  for (const g of opts.grants ?? []) {
    await grantStore.insert(g);
  }

  if (opts.role) {
    const now = new Date('2026-01-01T00:00:00Z');
    await (memberStore as any).upsert({
      id: `wm-${Math.random().toString(36).slice(2, 8)}`,
      workspaceId: W,
      userId: U,
      role: opts.role,
      capabilities: [],
      effectiveFrom: now,
      effectiveTo: null,
    });
  }

  for (const gid of opts.groups ?? []) {
    await groupStore.addMembership(gid, U);
  }

  return {
    getGrantsForResource: (rt, rid) => grantStore.findByResource(rt, rid),
    getWorkspaceMember: (wid, uid) => memberStore.findByWorkspaceAndUser(wid, uid),
    getGroupIdsForUser: (uid) => groupStore.findGroupsForUser(uid),
    getParentResource: (rt, rid) => hierarchyStore.findParent(rt, rid),
  };
}

const NOW = new Date('2026-06-01T12:00:00Z');

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('buildAncestorChain', () => {
  it('builds full chain from slide to workspace', async () => {
    const ctx = await setupCtx({});
    const chain = await buildAncestorChain(
      (rt, rid) => ctx.getParentResource(rt, rid),
      'slide',
      S,
    );
    expect(chain).toEqual([
      { resourceType: 'slide', resourceId: S },
      { resourceType: 'deck', resourceId: D },
      { resourceType: 'project', resourceId: P },
      { resourceType: 'folder', resourceId: F },
      { resourceType: 'workspace', resourceId: W },
    ]);
  });

  it('builds chain from workspace (single element)', async () => {
    const ctx = await setupCtx({});
    const chain = await buildAncestorChain(
      (rt, rid) => ctx.getParentResource(rt, rid),
      'workspace',
      W,
    );
    expect(chain).toEqual([
      { resourceType: 'workspace', resourceId: W },
    ]);
  });
});

describe('resolvePermission — deny overrides allow at same level', () => {
  it('deny at same level overrides allow for same principal', async () => {
    const allowGrant = grant('deck', D, U, 'user', ['edit'], false);
    const denyGrant = grant('deck', D, U, 'user', ['edit'], true);
    const ctx = await setupCtx({ grants: [allowGrant, denyGrant] });

    const result = await resolvePermission(ctx, U, 'edit', 'deck', D, NOW);
    expect(result.decision).toBe('deny');
    expect(result.reason).toContain('deny at deck');
  });

  it('allow wins when only allow grants exist at same level', async () => {
    const allowGrant = grant('deck', D, U, 'user', ['edit'], false);
    const ctx = await setupCtx({ grants: [allowGrant] });

    const result = await resolvePermission(ctx, U, 'edit', 'deck', D, NOW);
    expect(result.decision).toBe('allow');
  });
});

describe('resolvePermission — deny at ancestor blocks descendant', () => {
  it('deny at workspace blocks deck', async () => {
    const denyGrant = grant('workspace', W, U, 'user', ['edit'], true);
    const allowGrant = grant('deck', D, U, 'user', ['edit'], false);
    const ctx = await setupCtx({ grants: [denyGrant, allowGrant] });

    const result = await resolvePermission(ctx, U, 'edit', 'deck', D, NOW);
    expect(result.decision).toBe('deny');
    expect(result.reason).toContain('deny at ancestor workspace');
  });

  it('deny at folder blocks slide', async () => {
    const denyGrant = grant('folder', F, U, 'user', ['edit'], true);
    const allowGrant = grant('slide', S, U, 'user', ['edit'], false);
    const ctx = await setupCtx({ grants: [denyGrant, allowGrant] });

    const result = await resolvePermission(ctx, U, 'edit', 'slide', S, NOW);
    expect(result.decision).toBe('deny');
    expect(result.reason).toContain('deny at ancestor folder');
  });

  it('allow at ancestor is honored when no deny exists', async () => {
    const allowGrant = grant('workspace', W, U, 'user', ['edit'], false);
    const ctx = await setupCtx({ grants: [allowGrant] });

    const result = await resolvePermission(ctx, U, 'edit', 'deck', D, NOW);
    expect(result.decision).toBe('allow');
    expect(result.reason).toContain('allow at workspace');
  });
});

describe('resolvePermission — workspace role baseline', () => {
  it('owner gets manage_permissions', async () => {
    const ctx = await setupCtx({ role: 'owner' });

    const result = await resolvePermission(ctx, U, 'manage_permissions', 'deck', D, NOW);
    expect(result.decision).toBe('allow');
    expect(result.reason).toContain('workspace role baseline: owner');
  });

  it('viewer gets view', async () => {
    const ctx = await setupCtx({ role: 'viewer' });

    const result = await resolvePermission(ctx, U, 'view', 'deck', D, NOW);
    expect(result.decision).toBe('allow');
    expect(result.reason).toContain('workspace role baseline: viewer');
  });

  it('viewer cannot edit via role baseline', async () => {
    const ctx = await setupCtx({ role: 'viewer' });

    const result = await resolvePermission(ctx, U, 'edit', 'deck', D, NOW);
    expect(result.decision).toBe('deny');
    expect(result.reason).toContain('no matching grant');
  });

  it('editor can edit via role baseline', async () => {
    const ctx = await setupCtx({ role: 'editor' });

    const result = await resolvePermission(ctx, U, 'edit', 'deck', D, NOW);
    expect(result.decision).toBe('allow');
  });

  it('commenter can comment via role baseline', async () => {
    const ctx = await setupCtx({ role: 'commenter' });

    const result = await resolvePermission(ctx, U, 'comment', 'slide', S, NOW);
    expect(result.decision).toBe('allow');
  });

  it('no role baseline for unknown user → deny', async () => {
    const ctx = await setupCtx({});

    const result = await resolvePermission(ctx, 'unknown-user', 'view', 'deck', D, NOW);
    expect(result.decision).toBe('deny');
  });
});

describe('resolvePermission — temporal grants', () => {
  it('grant not effective before effective_from', async () => {
    const futureStart = new Date('2027-01-01T00:00:00Z');
    const g = grant('deck', D, U, 'user', ['edit'], false, futureStart);
    const ctx = await setupCtx({ grants: [g] });

    const result = await resolvePermission(ctx, U, 'edit', 'deck', D, NOW);
    expect(result.decision).toBe('deny');
  });

  it('grant effective after effective_from', async () => {
    const pastStart = new Date('2025-01-01T00:00:00Z');
    const g = grant('deck', D, U, 'user', ['edit'], false, pastStart);
    const ctx = await setupCtx({ grants: [g] });

    const result = await resolvePermission(ctx, U, 'edit', 'deck', D, NOW);
    expect(result.decision).toBe('allow');
  });

  it('grant not effective after effective_to', async () => {
    const pastStart = new Date('2025-01-01T00:00:00Z');
    const pastEnd = new Date('2025-12-31T23:59:59Z');
    const g = grant('deck', D, U, 'user', ['edit'], false, pastStart, pastEnd);
    const ctx = await setupCtx({ grants: [g] });

    const result = await resolvePermission(ctx, U, 'edit', 'deck', D, NOW);
    expect(result.decision).toBe('deny');
  });

  it('grant effective within temporal window', async () => {
    const start = new Date('2026-01-01T00:00:00Z');
    const end = new Date('2026-12-31T23:59:59Z');
    const g = grant('deck', D, U, 'user', ['edit'], false, start, end);
    const ctx = await setupCtx({ grants: [g] });

    const result = await resolvePermission(ctx, U, 'edit', 'deck', D, NOW);
    expect(result.decision).toBe('allow');
  });

  it('workspace role baseline respects temporal bounds', async () => {
    const futureStart = new Date('2027-01-01T00:00:00Z');
    const memberStore = new InMemoryWorkspaceMemberStore();
    const grantStore = new InMemoryPermissionGrantStore();
    const groupStore = new InMemoryGroupMembershipStore();
    const hierarchyStore = new InMemoryResourceHierarchyStore();

    await hierarchyStore.setParent('slide', S, 'deck', D);
    await hierarchyStore.setParent('deck', D, 'project', P);
    await hierarchyStore.setParent('project', P, 'folder', F);
    await hierarchyStore.setParent('folder', F, 'workspace', W);

    await (memberStore as any).upsert({
      id: 'wm-1',
      workspaceId: W,
      userId: U,
      role: 'owner',
      capabilities: [],
      effectiveFrom: futureStart,
      effectiveTo: null,
    });

    const ctx: ResolverContext = {
      getGrantsForResource: (rt, rid) => grantStore.findByResource(rt, rid),
      getWorkspaceMember: (wid, uid) => memberStore.findByWorkspaceAndUser(wid, uid),
      getGroupIdsForUser: () => Promise.resolve([]),
      getParentResource: (rt, rid) => hierarchyStore.findParent(rt, rid),
    };

    const result = await resolvePermission(ctx, U, 'edit', 'deck', D, NOW);
    expect(result.decision).toBe('deny');
    expect(result.reason).toContain('no matching grant');
  });
});

describe('resolvePermission — group membership', () => {
  it('group grant applies via membership', async () => {
    const g = grant('deck', D, G, 'group', ['edit'], false);
    const ctx = await setupCtx({ grants: [g], groups: [G] });

    const result = await resolvePermission(ctx, U, 'edit', 'deck', D, NOW);
    expect(result.decision).toBe('allow');
    expect(result.reason).toContain('allow at deck');
  });

  it('group deny blocks via membership', async () => {
    const g = grant('deck', D, G, 'group', ['edit'], true);
    const ctx = await setupCtx({ grants: [g], groups: [G] });

    const result = await resolvePermission(ctx, U, 'edit', 'deck', D, NOW);
    expect(result.decision).toBe('deny');
    expect(result.reason).toContain('deny at deck');
  });

  it('no group membership → group grant ignored', async () => {
    const g = grant('deck', D, G, 'group', ['edit'], false);
    const ctx = await setupCtx({ grants: [g], groups: [] });

    const result = await resolvePermission(ctx, U, 'edit', 'deck', D, NOW);
    expect(result.decision).toBe('deny');
  });
});

describe('resolvePermission — inheritance workspace → deck', () => {
  it('workspace-level grant applies to deck', async () => {
    const g = grant('workspace', W, U, 'user', ['view'], false);
    const ctx = await setupCtx({ grants: [g] });

    const result = await resolvePermission(ctx, U, 'view', 'deck', D, NOW);
    expect(result.decision).toBe('allow');
    expect(result.reason).toContain('allow at workspace');
  });

  it('most-specific grant wins over ancestor grant', async () => {
    const wsGrant = grant('workspace', W, U, 'user', ['edit'], false);
    const deckDeny = grant('deck', D, U, 'user', ['edit'], true);
    const ctx = await setupCtx({ grants: [wsGrant, deckDeny] });

    // Deny at deck is the target level, not an ancestor, so step 2 checks it
    const result = await resolvePermission(ctx, U, 'edit', 'deck', D, NOW);
    expect(result.decision).toBe('deny');
  });

  it('folder-level grant applies to slide (full chain)', async () => {
    const g = grant('folder', F, U, 'user', ['comment'], false);
    const ctx = await setupCtx({ grants: [g] });

    const result = await resolvePermission(ctx, U, 'comment', 'slide', S, NOW);
    expect(result.decision).toBe('allow');
    expect(result.reason).toContain('allow at folder');
  });
});

describe('resolvePermission — point-in-time', () => {
  it('resolves using historical at timestamp', async () => {
    const pastStart = new Date('2025-01-01T00:00:00Z');
    const pastEnd = new Date('2025-06-01T00:00:00Z');
    const g = grant('deck', D, U, 'user', ['edit'], false, pastStart, pastEnd);
    const ctx = await setupCtx({ grants: [g] });

    // At the grant's active time
    const atActive = new Date('2025-03-01T00:00:00Z');
    const result1 = await resolvePermission(ctx, U, 'edit', 'deck', D, atActive);
    expect(result1.decision).toBe('allow');

    // After the grant expired
    const atExpired = new Date('2025-07-01T00:00:00Z');
    const result2 = await resolvePermission(ctx, U, 'edit', 'deck', D, atExpired);
    expect(result2.decision).toBe('deny');
  });

  it('resolves using future at timestamp', async () => {
    const futureStart = new Date('2027-01-01T00:00:00Z');
    const g = grant('deck', D, U, 'user', ['edit'], false, futureStart);
    const ctx = await setupCtx({ grants: [g] });

    // Now → deny
    const result1 = await resolvePermission(ctx, U, 'edit', 'deck', D, NOW);
    expect(result1.decision).toBe('deny');

    // In 2027 → allow
    const atFuture = new Date('2027-06-01T00:00:00Z');
    const result2 = await resolvePermission(ctx, U, 'edit', 'deck', D, atFuture);
    expect(result2.decision).toBe('allow');
  });
});

describe('resolvePermission — no grants, no role', () => {
  it('returns deny for unknown user with no grants', async () => {
    const ctx = await setupCtx({});

    const result = await resolvePermission(ctx, 'unknown', 'view', 'workspace', W, NOW);
    expect(result.decision).toBe('deny');
    expect(result.reason).toContain('no matching grant');
  });
});
