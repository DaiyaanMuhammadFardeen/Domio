import { describe, expect, it } from 'vitest';
import {
  participantId,
  sessionCode,
  type AudienceWidgetDescriptor,
} from './types.js';
import {
  AudienceConflictError,
  AudienceModerationError,
  AudienceRateLimitedError,
  AudienceSessionEndedError,
  AudienceSessionNotFoundError,
  AudienceValidationError,
} from './errors.js';

describe('audience-service types', () => {
  it('branded participant id round-trips', () => {
    const id = participantId('p-1');
    expect(id).toBe('p-1');
  });

  it('branded session code round-trips', () => {
    const c = sessionCode('ABCD1234');
    expect(c).toBe('ABCD1234');
  });

  it('widget descriptor is widget-typed', () => {
    const w: AudienceWidgetDescriptor = {
      widget_id: 'w1',
      type: 'poll',
      position: 0,
      payload: { question: 'Pick one' },
      updated_at_ms: 1,
    };
    expect(w.type).toBe('poll');
  });
});

describe('audience-service errors', () => {
  it('SessionNotFoundError is 404', () => {
    const e = new AudienceSessionNotFoundError('CODE');
    expect(e.status).toBe(404);
    expect(e.code).toBe('SESSION_NOT_FOUND');
  });

  it('SessionEndedError is 410', () => {
    const e = new AudienceSessionEndedError('CODE');
    expect(e.status).toBe(410);
  });

  it('RateLimitedError carries retry_after_ms', () => {
    const e = new AudienceRateLimitedError(1000);
    expect(e.status).toBe(429);
    expect(e.retry_after_ms).toBe(1000);
  });

  it('ValidationError is 400', () => {
    const e = new AudienceValidationError('bad input');
    expect(e.status).toBe(400);
  });

  it('ModerationError is 422', () => {
    const e = new AudienceModerationError('blocked');
    expect(e.status).toBe(422);
  });

  it('ConflictError is 409', () => {
    const e = new AudienceConflictError('dup');
    expect(e.status).toBe(409);
  });
});