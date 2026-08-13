/**
 * Meeting token pure logic tests (Phase 18).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  issueMeetingToken,
  verifyMeetingToken,
  validateMeetingTokenScope,
  setTokenSecret,
} from './tokens.js';
import { TokenInvalidError } from './types.js';

describe('Meeting tokens', () => {
  const testSecret = 'test-secret-key-for-meeting-tokens';

  beforeEach(() => {
    setTokenSecret(testSecret);
  });

  describe('issueMeetingToken', () => {
    it('creates a token with correct expiry (meeting end + 1h)', () => {
      const now = new Date('2025-06-01T10:00:00Z');
      const meetingEndAt = new Date('2025-06-01T11:00:00Z');

      const token = issueMeetingToken(
        {
          integration: {} as any,
          meeting_id: 'meet-1',
          presenter_id: 'presenter-1',
          deck_id: 'deck-1',
          meeting_end_at: meetingEndAt,
        },
        { now: () => now, secret: Buffer.from(testSecret) },
      );

      expect(token.token).toBeTruthy();
      expect(token.meeting_id).toBe('meet-1');
      expect(token.presenter_id).toBe('presenter-1');
      expect(token.deck_id).toBe('deck-1');
      // meeting_end_at + 1h = 12:00
      expect(token.expires_at.toISOString()).toBe('2025-06-01T12:00:00.000Z');
    });

    it('caps expiry at now + 4h when meeting runs long', () => {
      const now = new Date('2025-06-01T10:00:00Z');
      const meetingEndAt = new Date('2025-06-02T10:00:00Z'); // 24h meeting

      const token = issueMeetingToken(
        {
          integration: {} as any,
          meeting_id: 'meet-2',
          presenter_id: 'presenter-2',
          deck_id: 'deck-2',
          meeting_end_at: meetingEndAt,
        },
        { now: () => now, secret: Buffer.from(testSecret) },
      );

      // now + 4h = 14:00 (capped)
      expect(token.expires_at.toISOString()).toBe('2025-06-01T14:00:00.000Z');
    });

    it('generates different tokens for different meetings', () => {
      const now = new Date('2025-06-01T10:00:00Z');
      const meetingEndAt = new Date('2025-06-01T11:00:00Z');

      const token1 = issueMeetingToken(
        {
          integration: {} as any,
          meeting_id: 'meet-1',
          presenter_id: 'presenter-1',
          deck_id: 'deck-1',
          meeting_end_at: meetingEndAt,
        },
        { now: () => now, secret: Buffer.from(testSecret) },
      );

      const token2 = issueMeetingToken(
        {
          integration: {} as any,
          meeting_id: 'meet-2',
          presenter_id: 'presenter-1',
          deck_id: 'deck-1',
          meeting_end_at: meetingEndAt,
        },
        { now: () => now, secret: Buffer.from(testSecret) },
      );

      expect(token1.token).not.toBe(token2.token);
    });
  });

  describe('verifyMeetingToken', () => {
    it('returns ok for valid token', () => {
      const now = new Date('2025-06-01T10:00:00Z');
      const meetingEndAt = new Date('2025-06-01T11:00:00Z');
      const secret = Buffer.from(testSecret);

      const token = issueMeetingToken(
        {
          integration: {} as any,
          meeting_id: 'meet-1',
          presenter_id: 'presenter-1',
          deck_id: 'deck-1',
          meeting_end_at: meetingEndAt,
        },
        { now: () => now, secret },
      );

      const result = verifyMeetingToken(
        {
          token: token.token,
          meeting_id: 'meet-1',
          presenter_id: 'presenter-1',
          deck_id: 'deck-1',
        },
        token.expires_at.getTime(),
        { now: () => now, secret },
      );

      expect(result.ok).toBe(true);
    });

    it('throws TokenInvalidError for expired token', () => {
      const now = new Date('2025-06-01T13:00:00Z'); // After expiry
      const meetingEndAt = new Date('2025-06-01T11:00:00Z');
      const secret = Buffer.from(testSecret);

      const token = issueMeetingToken(
        {
          integration: {} as any,
          meeting_id: 'meet-1',
          presenter_id: 'presenter-1',
          deck_id: 'deck-1',
          meeting_end_at: meetingEndAt,
        },
        { now: () => new Date('2025-06-01T10:00:00Z'), secret },
      );

      expect(() =>
        verifyMeetingToken(
          {
            token: token.token,
            meeting_id: 'meet-1',
            presenter_id: 'presenter-1',
            deck_id: 'deck-1',
          },
          token.expires_at.getTime(),
          { now: () => now, secret },
        ),
      ).toThrow(TokenInvalidError);
    });

    it('throws TokenInvalidError for signature mismatch', () => {
      const now = new Date('2025-06-01T10:00:00Z');
      const meetingEndAt = new Date('2025-06-01T11:00:00Z');
      const secret = Buffer.from(testSecret);

      const token = issueMeetingToken(
        {
          integration: {} as any,
          meeting_id: 'meet-1',
          presenter_id: 'presenter-1',
          deck_id: 'deck-1',
          meeting_end_at: meetingEndAt,
        },
        { now: () => now, secret },
      );

      expect(() =>
        verifyMeetingToken(
          {
            token: token.token,
            meeting_id: 'meet-2',
            presenter_id: 'presenter-1',
            deck_id: 'deck-1',
          },
          token.expires_at.getTime(),
          { now: () => now, secret },
        ),
      ).toThrow(TokenInvalidError);
    });

    it('throws TokenInvalidError for wrong secret', () => {
      const now = new Date('2025-06-01T10:00:00Z');
      const meetingEndAt = new Date('2025-06-01T11:00:00Z');
      const secret = Buffer.from(testSecret);
      const wrongSecret = Buffer.from('wrong-secret');

      const token = issueMeetingToken(
        {
          integration: {} as any,
          meeting_id: 'meet-1',
          presenter_id: 'presenter-1',
          deck_id: 'deck-1',
          meeting_end_at: meetingEndAt,
        },
        { now: () => now, secret },
      );

      expect(() =>
        verifyMeetingToken(
          {
            token: token.token,
            meeting_id: 'meet-1',
            presenter_id: 'presenter-1',
            deck_id: 'deck-1',
          },
          token.expires_at.getTime(),
          { now: () => now, secret: wrongSecret },
        ),
      ).toThrow(TokenInvalidError);
    });
  });

  describe('validateMeetingTokenScope', () => {
    it('validates correct scope', () => {
      const now = new Date('2025-06-01T10:00:00Z');
      const meetingEndAt = new Date('2025-06-01T11:00:00Z');
      const secret = Buffer.from(testSecret);

      const token = issueMeetingToken(
        {
          integration: {} as any,
          meeting_id: 'meet-1',
          presenter_id: 'presenter-1',
          deck_id: 'deck-1',
          meeting_end_at: meetingEndAt,
        },
        { now: () => now, secret },
      );

      const result = validateMeetingTokenScope(
        token.token,
        'meet-1',
        'presenter-1',
        'deck-1',
        token.expires_at.getTime(),
        { now: () => now, secret },
      );

      expect(result.ok).toBe(true);
    });

    it('rejects wrong scope', () => {
      const now = new Date('2025-06-01T10:00:00Z');
      const meetingEndAt = new Date('2025-06-01T11:00:00Z');
      const secret = Buffer.from(testSecret);

      const token = issueMeetingToken(
        {
          integration: {} as any,
          meeting_id: 'meet-1',
          presenter_id: 'presenter-1',
          deck_id: 'deck-1',
          meeting_end_at: meetingEndAt,
        },
        { now: () => now, secret },
      );

      expect(() =>
        validateMeetingTokenScope(
          token.token,
          'meet-1',
          'presenter-2',
          'deck-1',
          token.expires_at.getTime(),
          { now: () => now, secret },
        ),
      ).toThrow(TokenInvalidError);
    });
  });
});
