/**
 * Meeting marker pure logic tests (Phase 18).
 */

import { describe, it, expect } from 'vitest';
import { recordMarkerBody } from './markers.js';
import { ValidationError, MeetingNotActiveError } from './types.js';

describe('Meeting markers', () => {
  describe('recordMarkerBody', () => {
    it('creates a marker with valid transition time', async () => {
      const now = new Date('2025-06-01T10:00:00Z');
      const transitionedAt = new Date('2025-06-01T09:59:00Z');

      const marker = await recordMarkerBody(
        {
          meeting_id: 'meet-1',
          slide_id: 'slide-1',
          transitioned_at: transitionedAt,
        },
        { now: () => now },
      );

      expect(marker.id).toBeTruthy();
      expect(marker.meeting_id).toBe('meet-1');
      expect(marker.slide_id).toBe('slide-1');
      expect(marker.transitioned_at).toEqual(transitionedAt);
      expect(marker.created_at).toEqual(now);
    });

    it('allows transition within 2min clock skew', async () => {
      const now = new Date('2025-06-01T10:00:00Z');
      const transitionedAt = new Date('2025-06-01T10:01:30Z'); // 1.5 min in future

      const marker = await recordMarkerBody(
        {
          meeting_id: 'meet-1',
          slide_id: 'slide-1',
          transitioned_at: transitionedAt,
        },
        { now: () => now },
      );

      expect(marker).toBeTruthy();
    });

    it('rejects transition too far in future (>2min skew)', async () => {
      const now = new Date('2025-06-01T10:00:00Z');
      const transitionedAt = new Date('2025-06-01T10:03:00Z'); // 3 min in future

      await expect(
        recordMarkerBody(
          {
            meeting_id: 'meet-1',
            slide_id: 'slide-1',
            transitioned_at: transitionedAt,
          },
          { now: () => now },
        ),
      ).rejects.toThrow(ValidationError);
    });

    it('throws MeetingNotActiveError when meeting is not active', async () => {
      const now = new Date('2025-06-01T10:00:00Z');
      const transitionedAt = new Date('2025-06-01T09:59:00Z');

      await expect(
        recordMarkerBody(
          {
            meeting_id: 'meet-1',
            slide_id: 'slide-1',
            transitioned_at: transitionedAt,
          },
          {
            now: () => now,
            isMeetingActive: () => false,
          },
        ),
      ).rejects.toThrow(MeetingNotActiveError);
    });

    it('succeeds when meeting is active', async () => {
      const now = new Date('2025-06-01T10:00:00Z');
      const transitionedAt = new Date('2025-06-01T09:59:00Z');

      const marker = await recordMarkerBody(
        {
          meeting_id: 'meet-1',
          slide_id: 'slide-1',
          transitioned_at: transitionedAt,
        },
        {
          now: () => now,
          isMeetingActive: () => true,
        },
      );

      expect(marker).toBeTruthy();
    });

    it('supports async isMeetingActive predicate', async () => {
      const now = new Date('2025-06-01T10:00:00Z');
      const transitionedAt = new Date('2025-06-01T09:59:00Z');

      const marker = await recordMarkerBody(
        {
          meeting_id: 'meet-1',
          slide_id: 'slide-1',
          transitioned_at: transitionedAt,
        },
        {
          now: () => now,
          isMeetingActive: async () => true,
        },
      );

      expect(marker).toBeTruthy();
    });
  });
});
