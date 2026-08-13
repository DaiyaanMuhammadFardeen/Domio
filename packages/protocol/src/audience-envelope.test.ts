import { describe, expect, it } from 'vitest';
import { isAudienceEnvelope, narrowEnvelope, type AudienceEnvelope } from './index.js';

function makeEnvelope(overrides: Partial<AudienceEnvelope> = {}): AudienceEnvelope {
  return {
    kind: 'hello',
    ts_ms: 1000,
    participant_id: 'p1',
    idempotency_key: 'k1',
    session_code: 'ABCD1234',
    display_name: 'Alice',
    locale: 'en-US',
    ...overrides,
  } as AudienceEnvelope;
}

describe('audience-envelope', () => {
  it('recognises a valid envelope', () => {
    expect(isAudienceEnvelope(makeEnvelope())).toBe(true);
  });

  it('rejects missing fields', () => {
    expect(isAudienceEnvelope({ kind: 'hello' })).toBe(false);
    expect(isAudienceEnvelope(null)).toBe(false);
    expect(isAudienceEnvelope('not an object')).toBe(false);
  });

  it('rejects non-string kinds', () => {
    const e = makeEnvelope();
    expect(isAudienceEnvelope({ ...e, kind: 42 })).toBe(false);
  });

  it('narrowEnvelope returns the narrowed frame when matches', () => {
    const env = makeEnvelope({
      kind: 'poll_vote',
    } as Partial<AudienceEnvelope>) as AudienceEnvelope;
    const narrowed = narrowEnvelope(env, 'poll_vote');
    expect(narrowed).not.toBeNull();
    expect(narrowed?.kind).toBe('poll_vote');
  });

  it('narrowEnvelope returns null on mismatch', () => {
    const env = makeEnvelope();
    expect(narrowEnvelope(env, 'poll_vote')).toBeNull();
  });

  it('round-trips a poll vote', () => {
    const env: AudienceEnvelope = {
      kind: 'poll_vote',
      ts_ms: 1234,
      participant_id: 'p1',
      idempotency_key: 'k1',
      session_code: 'ABCD1234',
      poll_id: 'poll_1',
      option_id: 'opt_2',
    };
    expect(isAudienceEnvelope(env)).toBe(true);
    const narrowed = narrowEnvelope(env, 'poll_vote');
    expect(narrowed?.poll_id).toBe('poll_1');
  });
});
