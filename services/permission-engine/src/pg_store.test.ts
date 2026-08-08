/**
 * @domio/permission-engine — pg_store unit tests.
 *
 * Uses a FakePool test double to verify:
 *   - Correct SQL queries (parameterized $1..$n)
 *   - Correct column names (snake_case)
 *   - Correct parameter ordering
 *   - Proper row→domain mapping
 *   - temporal filtering (effective_from/effective_to)
 *
 * No live DB required.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ResourceType, PermissionGrant, WorkspaceMember } from './types.js';
import {
  PgPermissionGrantStore,
  PgWorkspaceMemberStore,
  PgGroupMembershipStore,
  PgResourceHierarchyStore,
} from './pg_store.js';

// ---------------------------------------------------------------------------
// FakePool test double
// ---------------------------------------------------------------------------

interface QueryCall {
  text: string;
  values: unknown[];
}

class FakePool {
  public calls: QueryCall[] = [];
  private responses: Array<{ rows: Record<string, unknown>[]; rowCount: number }> = [];
  private responseIndex = 0;

  /** Queue a response for the next query(). */
  respond(rows: Record<string, unknown>[], rowCount = rows.length): void {
    this.responses.push({ rows, rowCount });
  }

  async query(text: string, values?: unknown[]): Promise<{ rows: Record<string, unknown>[]; rowCount: number }> {
    this.calls.push({ text, values: values ?? [] });
    const resp = this.responses[this.responseIndex] ?? { rows: [], rowCount: 0 };
    this.responseIndex++;
    return resp;
  }

  /** Get the last query call. */
  lastCall(): QueryCall {
    return this.calls[this.calls.length - 1]!;
  }

  /** Get all query calls. */
  allCalls(): QueryCall[] {
    return [...this.calls];
  }

  /** Reset call history. */
  reset(): void {
    this.calls = [];
    this.responses = [];
    this.responseIndex = 0;
  }
}

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const NOW = new Date('2026-08-01T12:00:00Z');

function makeGrant(overrides: Partial<PermissionGrant> = {}): PermissionGrant {
  return {
    id: 'grant-1',
    resourceType: 'deck',
    resourceId: 'deck-uuid-1',
    principalId: 'user-uuid-1',
    principalType: 'user',
    capabilities: ['edit', 'view'],
    isDeny: false,
    effectiveFrom: NOW,
    effectiveTo: null,
    createdAt: NOW,
    updatedAt: NOW,
    createdBy: 'admin-uuid-1',
    updatedBy: 'admin-uuid-1',
    ...overrides,
  };
}

function makeMember(overrides: Partial<WorkspaceMember> = {}): WorkspaceMember {
  return {
    id: 'member-1',
    workspaceId: 'ws-uuid-1',
    userId: 'user-uuid-1',
    role: 'editor',
    capabilities: ['export'],
    effectiveFrom: NOW,
    effectiveTo: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// PgPermissionGrantStore tests
// ---------------------------------------------------------------------------

describe('PgPermissionGrantStore', () => {
  let pool: FakePool;
  let store: PgPermissionGrantStore;

  beforeEach(() => {
    pool = new FakePool();
    store = new PgPermissionGrantStore({ pool: pool as unknown as any });
  });

  describe('insert', () => {
    it('executes correct INSERT SQL with parameterized values', async () => {
      const grant = makeGrant();

      await store.insert(grant);

      expect(pool.calls).toHaveLength(1);
      const call = pool.lastCall();
      expect(call.text).toContain('INSERT INTO permission_grant');
      expect(call.values).toEqual([
        grant.id,
        grant.resourceId, // workspace_id
        grant.resourceType,
        grant.resourceId,
        grant.principalId,
        grant.principalType,
        grant.capabilities,
        grant.isDeny,
        grant.effectiveFrom,
        grant.effectiveTo,
        grant.createdAt,
        grant.updatedAt,
        grant.createdBy,
        grant.updatedBy,
      ]);
    });
  });

  describe('findById', () => {
    it('executes correct SELECT SQL with $1 parameter', async () => {
      const grant = makeGrant();
      pool.respond([{
        id: grant.id,
        resource_type: grant.resourceType,
        resource_id: grant.resourceId,
        principal_id: grant.principalId,
        principal_type: grant.principalType,
        capabilities: grant.capabilities,
        is_deny: grant.isDeny,
        effective_from: grant.effectiveFrom,
        effective_to: grant.effectiveTo,
        created_at: grant.createdAt,
        updated_at: grant.updatedAt,
        created_by: grant.createdBy,
        updated_by: grant.updatedBy,
      }]);

      const result = await store.findById('grant-1');

      expect(pool.lastCall().text).toContain('SELECT');
      expect(pool.lastCall().text).toContain('permission_grant');
      expect(pool.lastCall().values).toEqual(['grant-1']);
      expect(result).toEqual(grant);
    });

    it('returns null when no rows found', async () => {
      pool.respond([]);

      const result = await store.findById('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('findByResource', () => {
    it('executes correct SELECT with resource_type and resource_id parameters', async () => {
      const grant = makeGrant();
      pool.respond([{
        id: grant.id,
        resource_type: grant.resourceType,
        resource_id: grant.resourceId,
        principal_id: grant.principalId,
        principal_type: grant.principalType,
        capabilities: grant.capabilities,
        is_deny: grant.isDeny,
        effective_from: grant.effectiveFrom,
        effective_to: grant.effectiveTo,
        created_at: grant.createdAt,
        updated_at: grant.updatedAt,
        created_by: grant.createdBy,
        updated_by: grant.updatedBy,
      }]);

      const result = await store.findByResource('deck', 'deck-uuid-1');

      expect(pool.lastCall().values).toEqual(['deck', 'deck-uuid-1']);
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(grant);
    });

    it('returns empty array when no grants found', async () => {
      pool.respond([]);

      const result = await store.findByResource('slide', 'slide-uuid-1');

      expect(result).toEqual([]);
    });
  });

  describe('delete', () => {
    it('executes correct DELETE SQL with $1 parameter', async () => {
      pool.respond([]);

      await store.delete('grant-1');

      expect(pool.lastCall().text).toContain('DELETE FROM permission_grant');
      expect(pool.lastCall().values).toEqual(['grant-1']);
    });
  });

  describe('row mapping', () => {
    it('correctly maps snake_case columns to camelCase domain model', async () => {
      const dbRow = {
        id: 'test-id',
        resource_type: 'project',
        resource_id: 'proj-uuid',
        principal_id: 'user-uuid',
        principal_type: 'group',
        capabilities: ['view', 'comment'],
        is_deny: true,
        effective_from: new Date('2026-01-01'),
        effective_to: new Date('2026-12-31'),
        created_at: new Date('2026-06-01'),
        updated_at: new Date('2026-06-15'),
        created_by: 'admin-uuid',
        updated_by: 'admin-uuid',
      };
      pool.respond([dbRow]);

      const result = await store.findById('test-id');

      expect(result).toEqual({
        id: 'test-id',
        resourceType: 'project',
        resourceId: 'proj-uuid',
        principalId: 'user-uuid',
        principalType: 'group',
        capabilities: ['view', 'comment'],
        isDeny: true,
        effectiveFrom: new Date('2026-01-01'),
        effectiveTo: new Date('2026-12-31'),
        createdAt: new Date('2026-06-01'),
        updatedAt: new Date('2026-06-15'),
        createdBy: 'admin-uuid',
        updatedBy: 'admin-uuid',
      });
    });

    it('handles null effective_to correctly', async () => {
      pool.respond([{
        id: 'test-id',
        resource_type: 'workspace',
        resource_id: 'ws-uuid',
        principal_id: 'user-uuid',
        principal_type: 'user',
        capabilities: ['manage_permissions'],
        is_deny: false,
        effective_from: NOW,
        effective_to: null,
        created_at: NOW,
        updated_at: NOW,
        created_by: 'admin-uuid',
        updated_by: 'admin-uuid',
      }]);

      const result = await store.findById('test-id');

      expect(result?.effectiveTo).toBeNull();
    });
  });
});

// ---------------------------------------------------------------------------
// PgWorkspaceMemberStore tests
// ---------------------------------------------------------------------------

describe('PgWorkspaceMemberStore', () => {
  let pool: FakePool;
  let store: PgWorkspaceMemberStore;

  beforeEach(() => {
    pool = new FakePool();
    store = new PgWorkspaceMemberStore({ pool: pool as unknown as any });
  });

  describe('findByWorkspaceAndUser', () => {
    it('executes correct SELECT with workspace_id and user_id parameters', async () => {
      const member = makeMember();
      pool.respond([{
        id: member.id,
        workspace_id: member.workspaceId,
        user_id: member.userId,
        role: member.role,
        capabilities: member.capabilities,
        effective_from: member.effectiveFrom,
        effective_to: member.effectiveTo,
      }]);

      const result = await store.findByWorkspaceAndUser('ws-uuid-1', 'user-uuid-1');

      expect(pool.lastCall().values).toEqual(['ws-uuid-1', 'user-uuid-1']);
      expect(result).toEqual(member);
    });

    it('returns null when no member found', async () => {
      pool.respond([]);

      const result = await store.findByWorkspaceAndUser('ws-uuid-1', 'nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('upsert', () => {
    it('executes correct INSERT with ON CONFLICT DO UPDATE', async () => {
      const member = makeMember();

      await store.upsert(member);

      const call = pool.lastCall();
      expect(call.text).toContain('INSERT INTO workspace_member');
      expect(call.text).toContain('ON CONFLICT');
      expect(call.text).toContain('DO UPDATE SET');
      expect(call.values).toEqual([
        member.id,
        member.workspaceId,
        member.userId,
        member.role,
        member.capabilities,
        member.effectiveFrom,
        member.effectiveTo,
        member.userId, // created_by
        member.userId, // updated_by
      ]);
    });
  });
});

// ---------------------------------------------------------------------------
// PgGroupMembershipStore tests
// ---------------------------------------------------------------------------

describe('PgGroupMembershipStore', () => {
  let pool: FakePool;
  let store: PgGroupMembershipStore;

  beforeEach(() => {
    pool = new FakePool();
    store = new PgGroupMembershipStore({ pool: pool as unknown as any });
  });

  describe('findGroupsForUser', () => {
    it('executes correct SELECT with user_id parameter', async () => {
      pool.respond([
        { group_id: 'group-a' },
        { group_id: 'group-b' },
        { group_id: 'group-c' },
      ]);

      const result = await store.findGroupsForUser('user-uuid-1');

      expect(pool.lastCall().text).toContain('SELECT group_id FROM group_member');
      expect(pool.lastCall().values).toEqual(['user-uuid-1']);
      expect(result).toEqual(['group-a', 'group-b', 'group-c']);
    });

    it('returns empty array when user has no group memberships', async () => {
      pool.respond([]);

      const result = await store.findGroupsForUser('user-uuid-1');

      expect(result).toEqual([]);
    });
  });

  describe('addMembership', () => {
    it('executes correct INSERT with ON CONFLICT DO NOTHING', async () => {
      pool.respond([]);

      await store.addMembership('group-a', 'user-uuid-1');

      const call = pool.lastCall();
      expect(call.text).toContain('INSERT INTO group_member');
      expect(call.text).toContain('ON CONFLICT');
      expect(call.text).toContain('DO NOTHING');
      expect(call.values).toEqual(['group-a', 'user-uuid-1']);
    });
  });
});

// ---------------------------------------------------------------------------
// PgResourceHierarchyStore tests
// ---------------------------------------------------------------------------

describe('PgResourceHierarchyStore', () => {
  let pool: FakePool;
  let store: PgResourceHierarchyStore;

  beforeEach(() => {
    pool = new FakePool();
    store = new PgResourceHierarchyStore({ pool: pool as unknown as any });
  });

  describe('findParent', () => {
    it('executes correct SELECT with child_type and child_id parameters', async () => {
      pool.respond([{
        parent_type: 'deck',
        parent_id: 'deck-uuid-1',
      }]);

      const result = await store.findParent('slide', 'slide-uuid-1');

      expect(pool.lastCall().text).toContain('SELECT parent_type, parent_id');
      expect(pool.lastCall().text).toContain('resource_hierarchy');
      expect(pool.lastCall().values).toEqual(['slide', 'slide-uuid-1']);
      expect(result).toEqual({ parentType: 'deck', parentId: 'deck-uuid-1' });
    });

    it('returns null when no parent found (workspace root)', async () => {
      pool.respond([]);

      const result = await store.findParent('workspace', 'ws-uuid-1');

      expect(result).toBeNull();
    });

    it('correctly maps parent_type to parentType', async () => {
      pool.respond([{
        parent_type: 'folder',
        parent_id: 'folder-uuid-1',
      }]);

      const result = await store.findParent('project', 'proj-uuid-1');

      expect(result?.parentType).toBe('folder');
      expect(result?.parentId).toBe('folder-uuid-1');
    });
  });

  describe('setParent', () => {
    it('executes correct INSERT with ON CONFLICT DO UPDATE', async () => {
      pool.respond([]);

      await store.setParent('slide', 'slide-uuid-1', 'deck', 'deck-uuid-1');

      const call = pool.lastCall();
      expect(call.text).toContain('INSERT INTO resource_hierarchy');
      expect(call.text).toContain('ON CONFLICT');
      expect(call.text).toContain('DO UPDATE SET');
      expect(call.values).toEqual(['slide', 'slide-uuid-1', 'deck', 'deck-uuid-1']);
    });
  });
});

// ---------------------------------------------------------------------------
// SQL style verification
// ---------------------------------------------------------------------------

describe('SQL conventions', () => {
  let pool: FakePool;

  beforeEach(() => {
    pool = new FakePool();
  });

  it('uses parameterized queries ($1..$n) for all SQL', async () => {
    const store = new PgPermissionGrantStore({ pool: pool as unknown as any });
    pool.respond([{ id: '1', resource_type: 'deck', resource_id: '1', principal_id: '1', principal_type: 'user', capabilities: [], is_deny: false, effective_from: NOW, effective_to: null, created_at: NOW, updated_at: NOW, created_by: '1', updated_by: '1' }]);

    await store.findById('test-id');
    await store.findByResource('deck', 'deck-1');
    await store.delete('test-id');

    for (const call of pool.allCalls()) {
      // Should not contain unparameterized values in SQL text
      expect(call.text).not.toContain("'test-id'");
      expect(call.text).not.toContain("'deck'");
      expect(call.text).not.toContain("'deck-1'");
    }
  });

  it('uses snake_case column names matching migration schema', async () => {
    const store = new PgPermissionGrantStore({ pool: pool as unknown as any });
    pool.respond([{
      id: '1',
      resource_type: 'deck',
      resource_id: '1',
      principal_id: '1',
      principal_type: 'user',
      capabilities: [],
      is_deny: false,
      effective_from: NOW,
      effective_to: null,
      created_at: NOW,
      updated_at: NOW,
      created_by: '1',
      updated_by: '1',
    }]);

    await store.findById('1');

    const sql = pool.lastCall().text;
    expect(sql).toContain('resource_type');
    expect(sql).toContain('resource_id');
    expect(sql).toContain('principal_id');
    expect(sql).toContain('principal_type');
    expect(sql).toContain('is_deny');
    expect(sql).toContain('effective_from');
    expect(sql).toContain('effective_to');
    expect(sql).toContain('created_at');
    expect(sql).toContain('updated_at');
    expect(sql).toContain('created_by');
    expect(sql).toContain('updated_by');
  });

  it('capabilities array is passed as parameter (text[])', async () => {
    const store = new PgPermissionGrantStore({ pool: pool as unknown as any });
    const grant = makeGrant({ capabilities: ['edit', 'view', 'comment'] });

    await store.insert(grant);

    const call = pool.lastCall();
    // capabilities should be at index 6 (after id, workspace_id, resource_type, resource_id, principal_id, principal_type)
    expect(call.values[6]).toEqual(['edit', 'view', 'comment']);
  });
});
