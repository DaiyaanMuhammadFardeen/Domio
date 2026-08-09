/**
 * @domio/audit-service — tests (P20.5 B2).
 *
 * Covers §6.1 verification matrix:
 *   - Emit within same transaction (outbox pattern)
 *   - Query with actor / action / time filters
 *   - Retention 91-day-old rows deleted; 89-day-old kept
 *   - Sensitive fields never appear in metadata
 *   - CSV export contains all filtered rows
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { AuditService } from './service.js';
import { InMemoryAuditStore } from './stores.js';
import type { AuditEventInput, PgClient } from './types.js';
import type { OutboxContext } from './service.js';

describe('AuditService — emit', () => {
  let service: AuditService;
  beforeEach(() => {
    service = new AuditService({ clock: () => new Date('2026-08-01T12:00:00Z') });
  });

  it('writes an audit row in the same transaction when given an OutboxContext', async () => {
    const inserted: unknown[][] = [];
    const pg: PgClient = {
      query: async (sql, params) => {
        if (sql.startsWith('INSERT')) inserted.push([...(params ?? [])]);
        return { rows: [], rowCount: 1 };
      },
    };
    const ctx: OutboxContext = { pg };

    await service.emit(
      {
        tenantId: 'tenant-1',
        actorId: 'user-1',
        action: 'deck.created',
        targetKind: 'deck',
        targetId: 'deck-99',
        metadata: { name: 'My deck' },
      },
      ctx,
    );

    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toContain('tenant-1');
    expect(inserted[0]).toContain('deck.created');
  });

  it('writes to the standalone store when no OutboxContext is given', async () => {
    const store = new InMemoryAuditStore();
    const svc = new AuditService({ store, clock: () => new Date('2026-08-01T12:00:00Z') });

    await svc.emit({
      tenantId: 'tenant-1',
      actorId: 'user-1',
      action: 'auth.login',
    });

    const result = await store.query({ tenantId: 'tenant-1' });
    expect(result.events).toHaveLength(1);
    expect(result.events[0]!.action).toBe('auth.login');
  });

  it('rejects unknown actions', async () => {
    await expect(
      service.emit({
        tenantId: 't1',
        action: 'unknown.action' as AuditEventInput['action'],
      }),
    ).rejects.toThrow(/unknown action/);
  });

  it('rejects forbidden metadata keys (passwords, MFA secrets, tokens)', async () => {
    const forbidden = ['password', 'mfa_secret', 'access_token', 'refresh_token'];
    for (const key of forbidden) {
      await expect(
        service.emit({
          tenantId: 't1',
          action: 'auth.login',
          metadata: { [key]: 'sensitive' },
        }),
      ).rejects.toThrow(new RegExp(`forbidden metadata key "${key}"`));
    }
  });

  it('allows safe metadata', async () => {
    await expect(
      service.emit({
        tenantId: 't1',
        action: 'deck.created',
        metadata: { deck_name: 'Sales Q3', slide_count: 12 },
      }),
    ).resolves.toBeDefined();
  });
});

describe('AuditService — query', () => {
  let service: AuditService;
  beforeEach(async () => {
    service = new AuditService({ clock: () => new Date('2026-08-01T12:00:00Z') });
    await service.emit({ tenantId: 't1', actorId: 'alice', action: 'deck.created', targetKind: 'deck', targetId: 'd1' });
    await service.emit({ tenantId: 't1', actorId: 'alice', action: 'deck.edited', targetKind: 'deck', targetId: 'd1' });
    await service.emit({ tenantId: 't1', actorId: 'bob', action: 'deck.shared', targetKind: 'deck', targetId: 'd1' });
    await service.emit({ tenantId: 't2', actorId: 'carol', action: 'deck.created', targetKind: 'deck', targetId: 'd2' });
  });

  it('scopes to tenant', async () => {
    const result = await service.query({ tenantId: 't1' });
    expect(result.events.every((e) => e.tenantId === 't1')).toBe(true);
    expect(result.events).toHaveLength(3);
    expect(result.total).toBe(3);
  });

  it('filters by actor', async () => {
    const result = await service.query({ tenantId: 't1', actorId: 'alice' });
    expect(result.events).toHaveLength(2);
    expect(result.events.every((e) => e.actorId === 'alice')).toBe(true);
  });

  it('filters by action', async () => {
    const result = await service.query({ tenantId: 't1', action: 'deck.shared' });
    expect(result.events).toHaveLength(1);
    expect(result.events[0]!.action).toBe('deck.shared');
  });

  it('filters by multiple actions (comma-separated in URL)', async () => {
    const result = await service.query({
      tenantId: 't1',
      action: ['deck.created', 'deck.shared'],
    });
    expect(result.events).toHaveLength(2);
  });

  it('respects limit + offset', async () => {
    const page1 = await service.query({ tenantId: 't1', limit: 2, offset: 0 });
    const page2 = await service.query({ tenantId: 't1', limit: 2, offset: 2 });
    expect(page1.events).toHaveLength(2);
    expect(page2.events).toHaveLength(1);
    // No overlap
    const ids = new Set([...page1.events, ...page2.events].map((e) => e.id));
    expect(ids.size).toBe(3);
  });

  it('returns total count independent of limit', async () => {
    const result = await service.query({ tenantId: 't1', limit: 1 });
    expect(result.events).toHaveLength(1);
    expect(result.total).toBe(3);
  });
});

describe('AuditService — retention', () => {
  it('deletes 91-day-old rows but keeps 89-day-old rows', async () => {
    const store = new InMemoryAuditStore();
    let now = new Date('2026-08-01T12:00:00Z').getTime();
    const clock = () => new Date(now);

    const svc = new AuditService({ store, clock });

    // Insert an "89-day-old" event by clock-walking
    now -= 89 * 86_400_000;
    await svc.emit({ tenantId: 't1', action: 'deck.created' });

    now = new Date('2026-08-01T12:00:00Z').getTime() - 91 * 86_400_000;
    await svc.emit({ tenantId: 't1', action: 'deck.deleted' });

    // Reset clock to now
    now = new Date('2026-08-01T12:00:00Z').getTime();
    const record = await svc.runRetention('t1', 90);
    expect(record.rowsDeleted).toBe(1);

    const remaining = await store.query({ tenantId: 't1' });
    expect(remaining.events).toHaveLength(1);
    expect(remaining.events[0]!.action).toBe('deck.created');
  });

  it('dry-run reports count without deleting', async () => {
    const store = new InMemoryAuditStore();
    let now = new Date('2026-08-01T12:00:00Z').getTime() - 100 * 86_400_000;
    const clock = () => new Date(now);
    const svc = new AuditService({ store, clock });

    await svc.emit({ tenantId: 't1', action: 'deck.created' });
    await svc.emit({ tenantId: 't1', action: 'deck.edited' });

    now = new Date('2026-08-01T12:00:00Z').getTime();
    const would = await svc.dryRunRetention('t1', 90);
    expect(would).toBe(2);

    const remaining = await store.query({ tenantId: 't1' });
    expect(remaining.events).toHaveLength(2);
  });

  it('rejects retentionDays < 1', async () => {
    const svc = new AuditService();
    await expect(svc.runRetention('t1', 0)).rejects.toThrow(/retentionDays/);
  });
});

describe('AuditService — CSV export', () => {
  it('emits CSV with header + rows', async () => {
    const svc = new AuditService({ clock: () => new Date('2026-08-01T12:00:00Z') });
    await svc.emit({ tenantId: 't1', actorId: 'alice', action: 'deck.created' });
    await svc.emit({ tenantId: 't1', actorId: 'bob', action: 'deck.edited' });

    const csv = await svc.exportCsv({ tenantId: 't1' });
    const lines = csv.split('\n').filter(Boolean);
    expect(lines[0]).toBe('id,tenant_id,actor_id,actor_kind,action,target_kind,target_id,ip,user_agent,created_at,metadata');
    expect(lines).toHaveLength(3); // 1 header + 2 events
    expect(lines[1]).toContain('deck.created');
    expect(lines[2]).toContain('deck.edited');
  });

  it('escapes commas and quotes in metadata', async () => {
    const svc = new AuditService({ clock: () => new Date('2026-08-01T12:00:00Z') });
    await svc.emit({
      tenantId: 't1',
      action: 'deck.edited',
      metadata: { note: 'Hello, "world"' },
    });
    const csv = await svc.exportCsv({ tenantId: 't1' });
    // The metadata field has a comma, so it must be wrapped in CSV quotes.
    // JSON-encoded values use \" for inner quotes; CSV further doubles those.
    expect(csv).toContain('note');
    expect(csv).toContain('Hello,');
    expect(csv).toContain('world');
    // Field must be quoted because of the comma (RFC 4180)
    expect(csv).toMatch(/"\{/);   // opens with "{
    expect(csv).toMatch(/\}"/);   // closes with }"
  });
});