import { describe, it, expect } from 'vitest';
import { isQuietHour, buildDigest, defaultOffsetMinutes } from './quiet_hours.js';

describe('quiet_hours', () => {
  describe('isQuietHour', () => {
    // Helper: create a fixed offsetMinutes function for testing
    function fixedOffset(minutes: number) {
      return () => minutes;
    }

    it('returns false for empty window (start === end)', () => {
      // 09:00–09:00 = empty window
      expect(isQuietHour({ start: 9, end: 9, tz: 'UTC' }, Date.now(), { offsetMinutes: fixedOffset(0) })).toBe(false);
    });

    it('same-day window: quiet during hours', () => {
      // Window: 22:00–07:00 (overnight)
      // Simulate local hour = 23 → quiet
      const now = new Date('2024-01-15T23:00:00Z').getTime();
      expect(isQuietHour({ start: 22, end: 7, tz: 'UTC' }, now, { offsetMinutes: fixedOffset(0) })).toBe(true);
    });

    it('same-day window: not quiet outside hours', () => {
      // Window: 22:00–07:00
      // Simulate local hour = 12 → not quiet
      const now = new Date('2024-01-15T12:00:00Z').getTime();
      expect(isQuietHour({ start: 22, end: 7, tz: 'UTC' }, now, { offsetMinutes: fixedOffset(0) })).toBe(false);
    });

    it('overnight window: quiet at 23:00', () => {
      const now = new Date('2024-01-15T23:00:00Z').getTime();
      expect(isQuietHour({ start: 22, end: 7, tz: 'UTC' }, now, { offsetMinutes: fixedOffset(0) })).toBe(true);
    });

    it('overnight window: quiet at 03:00', () => {
      const now = new Date('2024-01-15T03:00:00Z').getTime();
      expect(isQuietHour({ start: 22, end: 7, tz: 'UTC' }, now, { offsetMinutes: fixedOffset(0) })).toBe(true);
    });

    it('overnight window: not quiet at 10:00', () => {
      const now = new Date('2024-01-15T10:00:00Z').getTime();
      expect(isQuietHour({ start: 22, end: 7, tz: 'UTC' }, now, { offsetMinutes: fixedOffset(0) })).toBe(false);
    });

    it('daytime window: quiet at 14:00 in 09:00–17:00', () => {
      const now = new Date('2024-01-15T14:00:00Z').getTime();
      expect(isQuietHour({ start: 9, end: 17, tz: 'UTC' }, now, { offsetMinutes: fixedOffset(0) })).toBe(true);
    });

    it('daytime window: not quiet at 18:00 in 09:00–17:00', () => {
      const now = new Date('2024-01-15T18:00:00Z').getTime();
      expect(isQuietHour({ start: 9, end: 17, tz: 'UTC' }, now, { offsetMinutes: fixedOffset(0) })).toBe(false);
    });

    it('applies timezone offset', () => {
      // UTC 22:00 + offset +600 (UTC+10) → local 08:00 next day
      // Window: 22:00–07:00 → 08:00 is NOT quiet
      const now = new Date('2024-01-15T22:00:00Z').getTime();
      expect(isQuietHour({ start: 22, end: 7, tz: 'Australia/Sydney' }, now, {
        offsetMinutes: fixedOffset(600),
      })).toBe(false);
    });

    it('applies timezone offset — quiet when local is in window', () => {
      // UTC 16:00 + offset +600 (UTC+10) → local 02:00 next day
      // Window: 22:00–07:00 → 02:00 IS quiet
      const now = new Date('2024-01-15T16:00:00Z').getTime();
      expect(isQuietHour({ start: 22, end: 7, tz: 'Australia/Sydney' }, now, {
        offsetMinutes: fixedOffset(600),
      })).toBe(true);
    });
  });

  describe('buildDigest', () => {
    it('returns empty message for zero items', () => {
      const digest = buildDigest([]);
      expect(digest.count).toBe(0);
      expect(digest.body).toContain('No new notifications');
    });

    it('aggregates items into a formatted body', () => {
      const items = [
        { title: 'Mentioned in comment', body: 'Hello @user', ts_ms: 1000 },
        { title: 'Approval requested', body: 'Please approve deck', link: '/decks/d-1', ts_ms: 2000 },
      ];
      const digest = buildDigest(items);
      expect(digest.count).toBe(2);
      expect(digest.title).toContain('2 notifications');
      expect(digest.body).toContain('Mentioned in comment');
      expect(digest.body).toContain('Approval requested');
      expect(digest.body).toContain('[View]');
      expect(digest.link).toBe('/notifications/digest');
    });

    it('uses singular "notification" for count=1', () => {
      const items = [{ title: 'T', body: 'B', ts_ms: 1000 }];
      const digest = buildDigest(items);
      expect(digest.title).toContain('1 notification');
      expect(digest.title).not.toContain('notifications');
    });
  });

  describe('defaultOffsetMinutes', () => {
    it('returns 0 for UTC timezone', () => {
      const now = new Date('2024-06-15T12:00:00Z');
      expect(defaultOffsetMinutes(now, 'UTC')).toBe(0);
    });
  });
});
