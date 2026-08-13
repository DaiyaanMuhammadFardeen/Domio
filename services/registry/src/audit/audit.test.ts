import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryStore } from '../store/memory.js';
import { defaultDeps, type ServiceDeps } from '../deps.js';
import { withAudit, listAgentActions } from './audit.js';
import { uuid } from '../crypto/index.js';

function createTestDeps(): { deps: ServiceDeps; store: InMemoryStore } {
  const store = new InMemoryStore();
  const deps = defaultDeps(store);
  return { deps, store };
}

describe('audit', () => {
  let store: InMemoryStore;
  let deps: ServiceDeps;

  beforeEach(() => {
    ({ deps, store } = createTestDeps());
  });

  describe('withAudit', () => {
    it('appends audit row on successful fn', async () => {
      const ctx = { agentId: 'agent-1', workspaceId: 'ws-1' };
      const result = await withAudit(deps, ctx, 'test.action', 'test', 'res-1', async () => {
        return { value: 42 };
      });
      expect(result).toEqual({ value: 42 });

      const rows = await store.listAudit('agent');
      expect(rows.length).toBe(1);
      expect(rows[0]!.actorId).toBe('agent-1');
      expect(rows[0]!.actorKind).toBe('agent');
      expect(rows[0]!.action).toBe('test.action');
      expect(rows[0]!.resourceType).toBe('test');
      expect(rows[0]!.resourceId).toBe('res-1');
    });

    it('does NOT append audit row when fn throws', async () => {
      const ctx = { agentId: 'agent-1' };
      await expect(
        withAudit(deps, ctx, 'test.fail', 'test', 'res-2', async () => {
          throw new Error('boom');
        }),
      ).rejects.toThrow('boom');

      const rows = await store.listAudit('agent');
      expect(rows.length).toBe(0);
    });

    it('includes detail in audit row', async () => {
      const ctx = { agentId: 'agent-1' };
      await withAudit(deps, ctx, 'test.detail', 'test', 'res-3', async () => 'ok', { foo: 'bar' });

      const rows = await store.listAudit('agent');
      expect(rows[0]!.detail).toEqual({ foo: 'bar' });
    });
  });

  describe('listAgentActions', () => {
    it('returns agent audit rows only', async () => {
      const ctx = { agentId: 'agent-1' };
      await withAudit(deps, ctx, 'a1', 't', 'r', async () => 'ok');
      await withAudit(deps, ctx, 'a2', 't', 'r', async () => 'ok');

      // Also add a human audit row
      await store.appendAudit({
        id: uuid(),
        actorId: 'human-1',
        actorKind: 'human',
        action: 'h1',
        resourceType: 't',
        resourceId: 'r',
        detail: {},
        createdAt: Date.now(),
      });

      const rows = await listAgentActions(deps);
      expect(rows.length).toBe(2);
      expect(rows.every((r) => r.actorKind === 'agent')).toBe(true);
    });

    it('filters by agentId', async () => {
      const ctx1 = { agentId: 'agent-1' };
      const ctx2 = { agentId: 'agent-2' };
      await withAudit(deps, ctx1, 'a1', 't', 'r', async () => 'ok');
      await withAudit(deps, ctx2, 'a2', 't', 'r', async () => 'ok');

      const rows = await listAgentActions(deps, { agentId: 'agent-1' });
      expect(rows.length).toBe(1);
      expect(rows[0]!.actorId).toBe('agent-1');
    });

    it('respects limit', async () => {
      const ctx = { agentId: 'agent-1' };
      await withAudit(deps, ctx, 'a1', 't', 'r', async () => 'ok');
      await withAudit(deps, ctx, 'a2', 't', 'r', async () => 'ok');
      await withAudit(deps, ctx, 'a3', 't', 'r', async () => 'ok');

      const rows = await listAgentActions(deps, { limit: 2 });
      expect(rows.length).toBe(2);
    });
  });
});
