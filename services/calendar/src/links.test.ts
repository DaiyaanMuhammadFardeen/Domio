/**
 * Calendar link pure logic tests (Phase 18 W3).
 *
 * Tests validateCalendarLinkInput and buildEventStartKey.
 */

import { describe, it, expect } from 'vitest';
import { validateCalendarLinkInput, buildEventStartKey } from './links.js';
import { CalendarValidationError } from './types.js';
import type { CalendarLinkInput } from './types.js';

function makeInput(overrides?: Partial<CalendarLinkInput>): CalendarLinkInput {
  return {
    deck_id: 'deck-001',
    vendor: 'google',
    event_id: 'evt-123',
    event_start_at: '2026-08-15T10:00:00Z',
    is_recurring: false,
    recurrence_id: null,
    ...overrides,
  };
}

describe('validateCalendarLinkInput', () => {
  it('passes with valid input', () => {
    expect(() => validateCalendarLinkInput(makeInput(), 'user-001')).not.toThrow();
  });

  it('throws when deck_id is missing', () => {
    expect(() => validateCalendarLinkInput(makeInput({ deck_id: '' }), 'user-001'))
      .toThrow(CalendarValidationError);
  });

  it('throws when user_id is empty', () => {
    expect(() => validateCalendarLinkInput(makeInput(), ''))
      .toThrow(CalendarValidationError);
  });

  it('throws when vendor is invalid', () => {
    expect(() => validateCalendarLinkInput(makeInput({ vendor: 'invalid' as 'google' }), 'user-001'))
      .toThrow(CalendarValidationError);
  });

  it('passes for all valid vendors', () => {
    const vendors = ['google', 'outlook', 'icloud'] as const;
    for (const vendor of vendors) {
      expect(() => validateCalendarLinkInput(makeInput({ vendor }), 'user-001'))
        .not.toThrow();
    }
  });

  it('throws when event_id is empty', () => {
    expect(() => validateCalendarLinkInput(makeInput({ event_id: '' }), 'user-001'))
      .toThrow(CalendarValidationError);
  });

  it('throws when event_start_at is invalid', () => {
    expect(() => validateCalendarLinkInput(makeInput({ event_start_at: 'not-a-date' }), 'user-001'))
      .toThrow(CalendarValidationError);
  });

  it('throws when is_recurring is true but recurrence_id is missing', () => {
    expect(() => validateCalendarLinkInput(
      makeInput({ is_recurring: true, recurrence_id: null }),
      'user-001',
    )).toThrow(CalendarValidationError);
  });

  it('throws when is_recurring is true but recurrence_id is empty string', () => {
    expect(() => validateCalendarLinkInput(
      makeInput({ is_recurring: true, recurrence_id: '' }),
      'user-001',
    )).toThrow(CalendarValidationError);
  });

  it('passes when is_recurring is true and recurrence_id is provided', () => {
    expect(() => validateCalendarLinkInput(
      makeInput({ is_recurring: true, recurrence_id: 'rrule-001' }),
      'user-001',
    )).not.toThrow();
  });
});

describe('buildEventStartKey', () => {
  it('builds key from deckId + vendor + eventId', () => {
    const key = buildEventStartKey('deck-001', 'google', 'evt-123');
    expect(key).toBe('deck-001:google:evt-123');
  });

  it('differs for different vendors', () => {
    const key1 = buildEventStartKey('deck-001', 'google', 'evt-123');
    const key2 = buildEventStartKey('deck-001', 'outlook', 'evt-123');
    expect(key1).not.toBe(key2);
  });

  it('differs for different event IDs', () => {
    const key1 = buildEventStartKey('deck-001', 'google', 'evt-123');
    const key2 = buildEventStartKey('deck-001', 'google', 'evt-456');
    expect(key1).not.toBe(key2);
  });
});
