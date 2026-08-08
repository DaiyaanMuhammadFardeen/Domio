/**
 * Auto-update binding logic tests (Phase 18 Wave 3).
 */

import { describe, it, expect } from 'vitest';
import { isBindingDue, shouldApply } from './entries.js';
import type { AutoUpdateBinding } from './types.js';

const fixedDate = new Date('2026-01-15T10:00:00Z');

function makeBinding(overrides: Partial<AutoUpdateBinding> = {}): AutoUpdateBinding {
  return {
    id: 'binding-1',
    workspace_id: 'ws-1',
    consumer_deck_id: 'deck-1',
    consumer_slide_id: 'slide-1',
    library_entry_id: 'entry-1',
    mode: 'manual',
    schedule: {},
    is_mandatory: false,
    created_at: fixedDate,
    updated_at: fixedDate,
    created_by: 'user-1',
    updated_by: 'user-1',
    ...overrides,
  };
}

describe('isBindingDue', () => {
  it('immediate bindings are always due', () => {
    const binding = makeBinding({ mode: 'immediate' });
    expect(isBindingDue(binding, Date.now())).toBe(true);
  });

  it('manual bindings are never due', () => {
    const binding = makeBinding({ mode: 'manual' });
    expect(isBindingDue(binding, Date.now())).toBe(false);
  });

  it('frozen bindings are never due', () => {
    const binding = makeBinding({ mode: 'frozen' });
    expect(isBindingDue(binding, Date.now())).toBe(false);
  });

  it('scheduled binding is due when never synced', () => {
    const binding = makeBinding({ mode: 'scheduled' });
    expect(isBindingDue(binding, Date.now())).toBe(true);
  });

  it('scheduled binding is due after 60s window', () => {
    const lastSync = new Date('2026-01-15T09:59:00Z');
    const binding = makeBinding({ mode: 'scheduled', last_synced_at: lastSync });
    const nowMs = fixedDate.getTime();
    expect(isBindingDue(binding, nowMs)).toBe(true);
  });

  it('scheduled binding is NOT due within 60s window', () => {
    const lastSync = new Date('2026-01-15T09:59:30Z');
    const binding = makeBinding({ mode: 'scheduled', last_synced_at: lastSync });
    const nowMs = fixedDate.getTime();
    expect(isBindingDue(binding, nowMs)).toBe(false);
  });
});

describe('shouldApply', () => {
  it('frozen never applies', () => {
    const binding = makeBinding({ mode: 'frozen' });
    const result = shouldApply(binding, 5);
    expect(result.apply).toBe(false);
    expect(result.reason).toBe('frozen');
  });

  it('conflict status prevents apply', () => {
    const binding = makeBinding({ mode: 'immediate', last_sync_status: 'conflict' });
    const result = shouldApply(binding, 5, 3);
    expect(result.apply).toBe(false);
    expect(result.reason).toBe('consumer_conflict');
  });

  it('pinned binding applies on first sync', () => {
    const binding = makeBinding({
      mode: 'immediate',
      pinned_version_id: 'ver-3',
    });
    const result = shouldApply(binding, 5);
    expect(result.apply).toBe(true);
    expect(result.reason).toBe('pinned_first_sync');
  });

  it('pinned binding does not apply after first sync', () => {
    const binding = makeBinding({
      mode: 'immediate',
      pinned_version_id: 'ver-3',
    });
    const result = shouldApply(binding, 5, 3);
    expect(result.apply).toBe(false);
    expect(result.reason).toBe('pinned_already_applied');
  });

  it('follow-latest applies when newer version exists', () => {
    const binding = makeBinding({ mode: 'immediate' });
    const result = shouldApply(binding, 5, 3);
    expect(result.apply).toBe(true);
  });

  it('follow-latest applies on first sync', () => {
    const binding = makeBinding({ mode: 'immediate' });
    const result = shouldApply(binding, 5);
    expect(result.apply).toBe(true);
  });

  it('follow-latest does not apply when already up to date', () => {
    const binding = makeBinding({ mode: 'immediate' });
    const result = shouldApply(binding, 3, 3);
    expect(result.apply).toBe(false);
    expect(result.reason).toBe('already_up_to_date');
  });
});
