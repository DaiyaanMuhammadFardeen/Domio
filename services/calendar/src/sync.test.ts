/**
 * Calendar sync pure logic tests (Phase 18 W3).
 *
 * Tests syncPlan, computeChangeType, and shouldSkipDueToOverride.
 */

import { describe, it, expect, vi } from 'vitest';
import { syncPlan, computeChangeType, shouldSkipDueToOverride } from './sync.js';
import type { CalendarLink, CalendarEventState, OverrideProvider } from './types.js';

function makeLink(overrides?: Partial<CalendarLink>): CalendarLink {
  return {
    id: 'link-001',
    workspace_id: 'ws-001',
    deck_id: 'deck-001',
    user_id: 'user-001',
    vendor: 'google',
    event_id: 'evt-123',
    event_start_at: new Date('2026-08-15T10:00:00Z'),
    is_recurring: false,
    recurrence_id: null,
    last_synced_at: new Date('2026-08-15T09:50:00Z'),
    created_at: new Date('2026-08-15T09:00:00Z'),
    updated_at: new Date('2026-08-15T09:00:00Z'),
    ...overrides,
  };
}

describe('syncPlan', () => {
  it('returns is_due=true when last_synced_at is older than 5 minutes', () => {
    const link = makeLink({
      last_synced_at: new Date('2026-08-15T09:50:00Z'),
    });
    const now = new Date('2026-08-15T09:56:00Z'); // 6 minutes later

    const plan = syncPlan(link, now);
    expect(plan.is_due).toBe(true);
  });

  it('returns is_due=false when last_synced_at is within 5 minutes', () => {
    const link = makeLink({
      last_synced_at: new Date('2026-08-15T09:50:00Z'),
    });
    const now = new Date('2026-08-15T09:54:00Z'); // 4 minutes later

    const plan = syncPlan(link, now);
    expect(plan.is_due).toBe(false);
  });

  it('returns is_due=true at exactly 5 minutes', () => {
    const link = makeLink({
      last_synced_at: new Date('2026-08-15T09:50:00Z'),
    });
    const now = new Date('2026-08-15T09:55:00Z'); // exactly 5 minutes

    const plan = syncPlan(link, now);
    expect(plan.is_due).toBe(true);
  });

  it('returns is_recurring_instance=true when is_recurring and recurrence_id set', () => {
    const link = makeLink({
      is_recurring: true,
      recurrence_id: 'rrule-001',
    });
    const now = new Date('2026-08-15T10:00:00Z');

    const plan = syncPlan(link, now);
    expect(plan.is_recurring_instance).toBe(true);
  });

  it('returns is_recurring_instance=false when not recurring', () => {
    const link = makeLink({
      is_recurring: false,
      recurrence_id: null,
    });
    const now = new Date('2026-08-15T10:00:00Z');

    const plan = syncPlan(link, now);
    expect(plan.is_recurring_instance).toBe(false);
  });

  it('returns is_recurring_instance=false when recurring but no recurrence_id', () => {
    const link = makeLink({
      is_recurring: true,
      recurrence_id: null,
    });
    const now = new Date('2026-08-15T10:00:00Z');

    const plan = syncPlan(link, now);
    expect(plan.is_recurring_instance).toBe(false);
  });
});

describe('computeChangeType', () => {
  it('returns "created" when prev is null', () => {
    const next: CalendarEventState = {
      event_id: 'evt-123',
      event_start_at: new Date('2026-08-15T10:00:00Z'),
    };
    expect(computeChangeType(null, next)).toBe('created');
  });

  it('returns "canceled" when next.canceled is true', () => {
    const prev: CalendarEventState = {
      event_id: 'evt-123',
      event_start_at: new Date('2026-08-15T10:00:00Z'),
    };
    const next: CalendarEventState = {
      event_id: 'evt-123',
      event_start_at: new Date('2026-08-15T10:00:00Z'),
      canceled: true,
    };
    expect(computeChangeType(prev, next)).toBe('canceled');
  });

  it('returns "updated" when event_start_at changes', () => {
    const prev: CalendarEventState = {
      event_id: 'evt-123',
      event_start_at: new Date('2026-08-15T10:00:00Z'),
    };
    const next: CalendarEventState = {
      event_id: 'evt-123',
      event_start_at: new Date('2026-08-15T11:00:00Z'),
    };
    expect(computeChangeType(prev, next)).toBe('updated');
  });

  it('returns "updated" when state is otherwise different', () => {
    const prev: CalendarEventState = {
      event_id: 'evt-123',
      event_start_at: new Date('2026-08-15T10:00:00Z'),
    };
    const next: CalendarEventState = {
      event_id: 'evt-123',
      event_start_at: new Date('2026-08-15T10:00:00Z'),
    };
    // Conservative default
    expect(computeChangeType(prev, next)).toBe('updated');
  });
});

describe('shouldSkipDueToOverride', () => {
  it('returns false when no recurrence_id', async () => {
    const provider: OverrideProvider = {
      getInstanceOverride: vi.fn().mockResolvedValue(null),
    };
    const result = await shouldSkipDueToOverride(provider, 'link-001', null);
    expect(result).toBe(false);
  });

  it('returns false when no override exists', async () => {
    const provider: OverrideProvider = {
      getInstanceOverride: vi.fn().mockResolvedValue(null),
    };
    const result = await shouldSkipDueToOverride(provider, 'link-001', 'rrule-001');
    expect(result).toBe(false);
    expect(provider.getInstanceOverride).toHaveBeenCalledWith('link-001', 'rrule-001');
  });

  it('returns true when override has canceled=true', async () => {
    const provider: OverrideProvider = {
      getInstanceOverride: vi.fn().mockResolvedValue({ canceled: true }),
    };
    const result = await shouldSkipDueToOverride(provider, 'link-001', 'rrule-001');
    expect(result).toBe(true);
  });

  it('returns false when override exists but not canceled', async () => {
    const provider: OverrideProvider = {
      getInstanceOverride: vi.fn().mockResolvedValue({ canceled: false }),
    };
    const result = await shouldSkipDueToOverride(provider, 'link-001', 'rrule-001');
    expect(result).toBe(false);
  });
});
