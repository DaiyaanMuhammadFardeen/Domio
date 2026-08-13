/**
 * Audit-log service tests — Wave 8 §S8.4.
 */

import { describe, it, expect } from 'vitest';
import { listAuditEvents, getAuditEvent, exportAuditEventsCSV } from './audit-service';
import type { AuditFilter } from './types';

describe('audit-service', () => {
  it('lists 100+ events by default', async () => {
    const list = await listAuditEvents();
    expect(list.total).toBeGreaterThanOrEqual(100);
    expect(list.items.length).toBe(list.total);
  });

  it('returns empty filter == no filter behavior', async () => {
    const filtered = await listAuditEvents({});
    const all = await listAuditEvents();
    expect(filtered.total).toBe(all.total);
  });

  it('orders results most-recent first', async () => {
    const { items } = await listAuditEvents();
    for (let i = 1; i < items.length; i++) {
      const prev = items[i - 1];
      const curr = items[i];
      if (!prev || !curr) continue;
      expect(prev.timestamp_ms).toBeGreaterThanOrEqual(curr.timestamp_ms);
    }
  });

  it('filters by action', async () => {
    const list = await listAuditEvents({ action: 'user.login' });
    expect(list.items.length).toBeGreaterThan(0);
    expect(list.items.every((e) => e.action === 'user.login')).toBe(true);
  });

  it('filters by actor_id', async () => {
    const list = await listAuditEvents({ actor_id: 'u-alice' });
    expect(list.items.length).toBeGreaterThan(0);
    expect(list.items.every((e) => e.actor.id === 'u-alice')).toBe(true);
  });

  it('filters by target_type', async () => {
    const list = await listAuditEvents({ target_type: 'plugin' });
    expect(list.items.length).toBeGreaterThan(0);
    expect(list.items.every((e) => e.target_type === 'plugin')).toBe(true);
  });

  it('filters by from_ms (time range lower bound)', async () => {
    const cutoff = await listAuditEvents();
    const newest = cutoff.items[0];
    expect(newest).toBeDefined();
    if (!newest) return;
    const from = newest.timestamp_ms - 60 * 60_000; // 1h before newest
    const list = await listAuditEvents({ from_ms: from });
    expect(list.items.length).toBeGreaterThan(0);
    expect(list.items.every((e) => e.timestamp_ms >= from)).toBe(true);
  });

  it('filters by to_ms (time range upper bound)', async () => {
    const all = await listAuditEvents();
    const oldest = all.items[all.items.length - 1];
    expect(oldest).toBeDefined();
    if (!oldest) return;
    const to = oldest.timestamp_ms + 60 * 60_000; // 1h after oldest
    const list = await listAuditEvents({ to_ms: to });
    expect(list.items.every((e) => e.timestamp_ms <= to)).toBe(true);
  });

  it('combines multiple filters', async () => {
    const filter: AuditFilter = {
      actor_id: 'u-bob',
      target_type: 'plugin',
    };
    const list = await listAuditEvents(filter);
    expect(list.items.every((e) => e.actor.id === 'u-bob' && e.target_type === 'plugin')).toBe(
      true,
    );
  });

  it('returns empty list when filters exclude everything', async () => {
    const list = await listAuditEvents({
      actor_id: 'u-does-not-exist',
    });
    expect(list.items.length).toBe(0);
    expect(list.total).toBe(0);
  });

  it('exports a non-empty CSV with the expected header', async () => {
    const csv = await exportAuditEventsCSV();
    const lines = csv.split('\n');
    expect(lines.length).toBeGreaterThan(1);
    expect(lines[0]).toBe('timestamp,actor_email,action,target_type,target_id,trace_id');
    // Each data row has 6 cells (no commas inside cells for these seeds).
    const firstRow = lines[1] ?? '';
    expect(firstRow.split(',').length).toBeGreaterThanOrEqual(6);
  });

  it('CSV export respects filters', async () => {
    const csv = await exportAuditEventsCSV({ actor_id: 'u-alice' });
    const lines = csv.split('\n').slice(1); // skip header
    expect(lines.length).toBeGreaterThan(0);
    // Every data line's actor_email column should be alice@domio.app.
    for (const line of lines) {
      const cells = line.split(',');
      expect(cells[1]).toBe('alice@domio.app');
    }
  });

  it('CSV header uses the required column order', async () => {
    const csv = await exportAuditEventsCSV();
    const [header] = csv.split('\n');
    expect(header).toBe('timestamp,actor_email,action,target_type,target_id,trace_id');
  });

  it('getAuditEvent returns the matching event by id', async () => {
    const list = await listAuditEvents();
    const first = list.items[0];
    expect(first).toBeDefined();
    if (!first) return;
    const detail = await getAuditEvent(first.id);
    expect(detail?.id).toBe(first.id);
    expect(detail?.action).toBe(first.action);
  });

  it('getAuditEvent returns null for an unknown id', async () => {
    expect(await getAuditEvent('ev-does-not-exist')).toBeNull();
  });

  it('seeds events covering system / service / user actor kinds', async () => {
    const list = await listAuditEvents();
    const kinds = new Set(list.items.map((e) => e.actor.kind));
    expect(kinds.has('user')).toBe(true);
    expect(kinds.has('service')).toBe(true);
    expect(kinds.has('system')).toBe(true);
  });
});
