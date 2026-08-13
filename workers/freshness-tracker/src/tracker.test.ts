/**
 * Freshness tracker tests — covers all 4 statuses (ok/stale/error/never),
 * append-only records (accumulate, never mutated), staleness computed
 * from expires_at, and signalStale/signalError writing correct records.
 */

import { describe, it, expect } from 'vitest';
import { FreshnessTracker } from './tracker.js';

function makeTracker(ttlMs = 5000, staleGraceMs = 0) {
  let now = 1000;
  const clock = () => new Date(now);
  const tracker = new FreshnessTracker({ clock });
  const advance = (ms: number) => {
    now += ms;
  };
  tracker.addBinding({
    bindingId: 'binding-1',
    freshnessTtlMs: ttlMs,
    staleGraceMs,
  });
  return { tracker, clock, advance, now: () => now };
}

describe('FreshnessTracker — statuses', () => {
  it('returns "never" for unregistered binding', () => {
    const { tracker } = makeTracker();
    expect(tracker.computeStatus('unknown')).toBe('never');
  });

  it('returns "never" for registered binding with no records', () => {
    const { tracker } = makeTracker();
    expect(tracker.computeStatus('binding-1')).toBe('never');
  });

  it('returns "ok" after signalOk', () => {
    const { tracker } = makeTracker();
    tracker.signalOk('binding-1');
    expect(tracker.computeStatus('binding-1')).toBe('ok');
  });

  it('returns "stale" after signalStale', () => {
    const { tracker } = makeTracker();
    tracker.signalOk('binding-1');
    tracker.signalStale('binding-1');
    expect(tracker.computeStatus('binding-1')).toBe('stale');
  });

  it('returns "error" after signalError', () => {
    const { tracker } = makeTracker();
    tracker.signalOk('binding-1');
    tracker.signalError('binding-1', 'network timeout');
    expect(tracker.computeStatus('binding-1')).toBe('error');
  });

  it('transitions ok → stale after TTL expires', () => {
    const { tracker, advance } = makeTracker(1000);
    tracker.signalOk('binding-1');
    expect(tracker.computeStatus('binding-1')).toBe('ok');
    advance(1001); // expire
    expect(tracker.computeStatus('binding-1')).toBe('stale');
  });

  it('transitions ok → stale after TTL + grace period', () => {
    const { tracker, advance } = makeTracker(1000, 500);
    tracker.signalOk('binding-1');
    advance(1000); // at TTL boundary, still ok due to grace
    expect(tracker.computeStatus('binding-1')).toBe('ok');
    advance(500); // now past grace
    expect(tracker.computeStatus('binding-1')).toBe('stale');
  });

  it('stays ok within grace period after TTL', () => {
    const { tracker, advance } = makeTracker(1000, 500);
    tracker.signalOk('binding-1');
    advance(1200); // past TTL but within grace
    expect(tracker.computeStatus('binding-1')).toBe('ok');
  });
});

describe('FreshnessTracker — append-only records', () => {
  it('records accumulate with each signal', () => {
    const { tracker } = makeTracker();
    tracker.signalOk('binding-1');
    tracker.signalStale('binding-1');
    tracker.signalError('binding-1', 'fail');
    tracker.signalOk('binding-1');
    expect(tracker.recordCount()).toBe(4);
  });

  it('records are never mutated after creation', () => {
    const { tracker } = makeTracker();
    const record1 = tracker.signalOk('binding-1');
    const snapshot1 = { ...record1 };
    const record2 = tracker.signalStale('binding-1');
    const snapshot2 = { ...record2 };
    // Add more records
    tracker.signalOk('binding-1');
    // Verify originals unchanged
    expect(record1).toEqual(snapshot1);
    expect(record2).toEqual(snapshot2);
  });

  it('getRecords returns records in append order', () => {
    const { tracker } = makeTracker();
    tracker.signalOk('binding-1');
    tracker.signalError('binding-1', 'err1');
    tracker.signalOk('binding-1');
    const records = tracker.getRecords('binding-1');
    expect(records).toHaveLength(3);
    expect(records[0]!.status).toBe('ok');
    expect(records[1]!.status).toBe('error');
    expect(records[2]!.status).toBe('ok');
  });

  it('getAllRecords returns all records across bindings', () => {
    const { tracker } = makeTracker();
    tracker.addBinding({ bindingId: 'binding-2', freshnessTtlMs: 1000 });
    tracker.signalOk('binding-1');
    tracker.signalOk('binding-2');
    tracker.signalStale('binding-1');
    expect(tracker.getAllRecords()).toHaveLength(3);
  });

  it('getLatestRecord returns the most recent record for a binding', () => {
    const { tracker } = makeTracker();
    tracker.signalOk('binding-1');
    tracker.signalError('binding-1', 'fail');
    const latest = tracker.getLatestRecord('binding-1');
    expect(latest).not.toBeNull();
    expect(latest!.status).toBe('error');
  });

  it('getLatestRecord returns null for no records', () => {
    const { tracker } = makeTracker();
    expect(tracker.getLatestRecord('binding-1')).toBeNull();
  });
});

describe('FreshnessTracker — staleness from expires_at', () => {
  it('record with expires_at in the past is stale', () => {
    const { tracker, advance } = makeTracker(1000);
    tracker.signalOk('binding-1');
    advance(2000); // TTL expired
    const records = tracker.getRecords('binding-1');
    const record = records[0]!;
    expect(tracker.isRecordStale(record)).toBe(true);
  });

  it('record with expires_at in the future is not stale', () => {
    const { tracker } = makeTracker(10_000);
    tracker.signalOk('binding-1');
    const records = tracker.getRecords('binding-1');
    const record = records[0]!;
    expect(tracker.isRecordStale(record)).toBe(false);
  });

  it('record with null expires_at (error/stale) is stale if status is error', () => {
    const { tracker } = makeTracker();
    tracker.signalError('binding-1', 'fail');
    const records = tracker.getRecords('binding-1');
    const record = records[0]!;
    expect(tracker.isRecordStale(record)).toBe(true);
  });

  it('record with null expires_at (stale) is stale if status is stale', () => {
    const { tracker } = makeTracker();
    tracker.signalStale('binding-1');
    const records = tracker.getRecords('binding-1');
    const record = records[0]!;
    expect(tracker.isRecordStale(record)).toBe(true);
  });

  it('staleness respects grace period from binding config', () => {
    const { tracker, advance } = makeTracker(1000, 500);
    tracker.signalOk('binding-1');
    advance(1200); // past TTL but within grace
    const records = tracker.getRecords('binding-1');
    const record = records[0]!;
    expect(tracker.isRecordStale(record)).toBe(false);
    advance(300); // now past grace
    expect(tracker.isRecordStale(record)).toBe(true);
  });
});

describe('FreshnessTracker — signalStale and signalError', () => {
  it('signalStale writes a stale record with null expiresAt', () => {
    const { tracker } = makeTracker();
    const record = tracker.signalStale('binding-1');
    expect(record.bindingId).toBe('binding-1');
    expect(record.status).toBe('stale');
    expect(record.expiresAt).toBeNull();
    expect(record.error).toBeUndefined();
    expect(record.recordedAt).toBeInstanceOf(Date);
  });

  it('signalError writes an error record with message and null expiresAt', () => {
    const { tracker } = makeTracker();
    const record = tracker.signalError('binding-1', 'connection refused');
    expect(record.bindingId).toBe('binding-1');
    expect(record.status).toBe('error');
    expect(record.expiresAt).toBeNull();
    expect(record.error).toBe('connection refused');
    expect(record.recordedAt).toBeInstanceOf(Date);
  });

  it('signalOk writes an ok record with expiresAt', () => {
    const { tracker } = makeTracker(5000);
    const record = tracker.signalOk('binding-1');
    expect(record.bindingId).toBe('binding-1');
    expect(record.status).toBe('ok');
    expect(record.expiresAt).not.toBeNull();
    expect(record.expiresAt!.getTime()).toBe(1000 + 5000);
  });
});

describe('FreshnessTracker — scanAll', () => {
  it('returns status for all registered bindings', () => {
    const { tracker } = makeTracker();
    tracker.addBinding({ bindingId: 'binding-2', freshnessTtlMs: 2000 });
    tracker.signalOk('binding-1');
    const results = tracker.scanAll();
    expect(results).toHaveLength(2);
    expect(results.find((r) => r.bindingId === 'binding-1')!.status).toBe('ok');
    expect(results.find((r) => r.bindingId === 'binding-2')!.status).toBe('never');
  });

  it('getBindings returns all registered bindings', () => {
    const { tracker } = makeTracker();
    tracker.addBinding({ bindingId: 'binding-2', freshnessTtlMs: 2000 });
    expect(tracker.getBindings()).toHaveLength(2);
  });

  it('removeBinding removes a binding', () => {
    const { tracker } = makeTracker();
    tracker.addBinding({ bindingId: 'binding-2', freshnessTtlMs: 2000 });
    tracker.removeBinding('binding-2');
    expect(tracker.getBindings()).toHaveLength(1);
    expect(tracker.computeStatus('binding-2')).toBe('never');
  });
});
