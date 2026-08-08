import { describe, expect, it } from 'vitest';
import {
  HashChainedAudienceAuditEmitter,
  InMemoryIdempotencyStore,
  InMemoryParticipantSessionStore,
  ParticipantSessionService,
} from './index.js';
import { AudienceSessionNotFoundError } from './presenter-lookup.js';
import type { AudienceSnapshot } from '@domio/audience-service';
import { generateSessionCode } from '@domio/session-code';
import { participantId, sessionCode } from '@domio/audience-service';

function fixedClock(ms: number) {
  return () => ms;
}

function snapshotFor(): AudienceSnapshot {
  return {
    session_id: 'psess-1',
    ended_at: null,
    current_slide_id: 'slide-1',
    presenter_display_name: 'Alice',
    title: 'My deck',
  };
}

function snapshotLookup(_input: { session_code: unknown; workspace_id: string }): Promise<AudienceSnapshot> {
  return Promise.resolve(snapshotFor());
}

function buildService(opts: { snapshot?: () => Promise<AudienceSnapshot> } = {}) {
  const store = new InMemoryParticipantSessionStore();
  const audit = new HashChainedAudienceAuditEmitter({ workspaceId: 'default' });
  const idem = new InMemoryIdempotencyStore();
  return {
    service: new ParticipantSessionService({
      store,
      audit,
      idempotency: idem,
      presenterLookup: opts.snapshot ?? snapshotLookup,
    }),
    store,
    audit,
    idem,
  };
}

describe('participant-session', () => {
  it('joins a session and creates a row', async () => {
    const code = generateSessionCode({ random: () => 0xdeadbeef });
    const { service } = buildService();
    const result = await service.join({
      session_code: sessionCode(code),
      workspace_id: 'w1',
      participant_id: participantId('p1'),
      display_name: 'Alice',
      locale: 'en-US',
    });
    expect(result.session.state).toBe('active');
    expect(result.session.shard_index).toBeGreaterThanOrEqual(0);
    expect(result.session.version).toBe(1);
    expect(result.bundle.session_id).toBe('psess-1');
  });

  it('rejects duplicate joins for the same participant', async () => {
    const code = generateSessionCode({ random: () => 0xdeadbeef });
    const { service } = buildService();
    await service.join({
      session_code: sessionCode(code),
      workspace_id: 'w1',
      participant_id: participantId('p1'),
      display_name: 'Alice',
      locale: 'en-US',
    });
    await expect(
      service.join({
        session_code: sessionCode(code),
        workspace_id: 'w1',
        participant_id: participantId('p1'),
        display_name: 'Alice',
        locale: 'en-US',
      }),
    ).rejects.toThrow(/already joined/);
  });

  it('re-joins after a graceful leave', async () => {
    const code = generateSessionCode({ random: () => 0xdeadbeef });
    const { service } = buildService();
    const first = await service.join({
      session_code: sessionCode(code),
      workspace_id: 'w1',
      participant_id: participantId('p1'),
      display_name: 'Alice',
      locale: 'en-US',
    });
    await service.leave({
      session_id: first.session.id,
      participant_id: participantId('p1'),
      reason: 'user_action',
    });
    const second = await service.join({
      session_code: sessionCode(code),
      workspace_id: 'w1',
      participant_id: participantId('p1'),
      display_name: 'Alice',
      locale: 'en-US',
    });
    expect(second.session.version).toBeGreaterThan(first.session.version);
    expect(second.session.state).toBe('active');
  });

  it('replays idempotently', async () => {
    const code = generateSessionCode({ random: () => 0x12345 });
    const { service } = buildService();
    const key = 'idem-1';
    const first = await service.join({
      session_code: sessionCode(code),
      workspace_id: 'w1',
      participant_id: participantId('p1'),
      display_name: 'Alice',
      locale: 'en-US',
      idempotency_key: key,
    });
    const second = await service.join({
      session_code: sessionCode(code),
      workspace_id: 'w1',
      participant_id: participantId('p1'),
      display_name: 'Alice',
      locale: 'en-US',
      idempotency_key: key,
    });
    expect(second.session.id).toBe(first.session.id);
    expect(second.idempotent_replay).not.toBeNull();
  });

  it('heartbeat transitions state to active and bumps version', async () => {
    const code = generateSessionCode({ random: () => 0x99 });
    const { service } = buildService();
    const first = await service.join({
      session_code: sessionCode(code),
      workspace_id: 'w1',
      participant_id: participantId('p1'),
      display_name: 'Alice',
      locale: 'en-US',
    });
    const next = await service.heartbeat({
      session_id: first.session.id,
      participant_id: participantId('p1'),
    });
    expect(next.version).toBe(first.session.version + 1);
    expect(next.state).toBe('active');
  });

  it('leave sets state to left and bumps version', async () => {
    const code = generateSessionCode({ random: () => 0x77 });
    const { service } = buildService();
    const first = await service.join({
      session_code: sessionCode(code),
      workspace_id: 'w1',
      participant_id: participantId('p1'),
      display_name: 'Alice',
      locale: 'en-US',
    });
    const left = await service.leave({
      session_id: first.session.id,
      participant_id: participantId('p1'),
      reason: 'user_action',
    });
    expect(left.state).toBe('left');
    expect(left.left_at).not.toBeNull();
  });

  it('moderator kick sets state to kicked and increments kick_count', async () => {
    const code = generateSessionCode({ random: () => 0x55 });
    const { service } = buildService();
    const first = await service.join({
      session_code: sessionCode(code),
      workspace_id: 'w1',
      participant_id: participantId('p1'),
      display_name: 'Alice',
      locale: 'en-US',
    });
    const kicked = await service.leave({
      session_id: first.session.id,
      participant_id: participantId('p1'),
      reason: 'moderator_kick',
    });
    expect(kicked.state).toBe('kicked');
    expect(kicked.kick_count).toBe(1);
  });

  it('leave is idempotent on a left session', async () => {
    const code = generateSessionCode({ random: () => 0xab });
    const { service } = buildService();
    const first = await service.join({
      session_code: sessionCode(code),
      workspace_id: 'w1',
      participant_id: participantId('p1'),
      display_name: 'Alice',
      locale: 'en-US',
    });
    const left1 = await service.leave({
      session_id: first.session.id,
      participant_id: participantId('p1'),
      reason: 'user_action',
    });
    const left2 = await service.leave({
      session_id: first.session.id,
      participant_id: participantId('p1'),
      reason: 'user_action',
    });
    expect(left2.version).toBe(left1.version);
  });

  it('rejects heartbeat with mismatched participant_id', async () => {
    const code = generateSessionCode({ random: () => 0x42 });
    const { service } = buildService();
    const first = await service.join({
      session_code: sessionCode(code),
      workspace_id: 'w1',
      participant_id: participantId('p1'),
      display_name: 'Alice',
      locale: 'en-US',
    });
    await expect(
      service.heartbeat({
        session_id: first.session.id,
        participant_id: participantId('p2'),
      }),
    ).rejects.toThrow(/participant_id mismatch/);
  });

  it('rejects join when presenter session is missing', async () => {
    const code = generateSessionCode({ random: () => 0x88 });
    const { service } = buildService({
      snapshot: () => Promise.reject(new AudienceSessionNotFoundError(code)),
    });
    await expect(
      service.join({
        session_code: sessionCode(code),
        workspace_id: 'w1',
        participant_id: participantId('p1'),
        display_name: 'Alice',
        locale: 'en-US',
      }),
    ).rejects.toThrow(/audience session not found/);
  });

  it('listActive returns only active rows', async () => {
    const code = generateSessionCode({ random: () => 0x33 });
    const { service } = buildService();
    const a = await service.join({
      session_code: sessionCode(code),
      workspace_id: 'w1',
      participant_id: participantId('p1'),
      display_name: 'Alice',
      locale: 'en-US',
    });
    await service.join({
      session_code: sessionCode(code),
      workspace_id: 'w1',
      participant_id: participantId('p2'),
      display_name: 'Bob',
      locale: 'en-US',
    });
    await service.leave({
      session_id: a.session.id,
      participant_id: participantId('p1'),
      reason: 'user_action',
    });
    const list = await service.listActive({ workspace_id: 'w1' });
    expect(list.items).toHaveLength(1);
    expect(list.items[0]?.participant_id).toBe('p2');
  });

  it('respects a fixed clock for time-based assertions', async () => {
    const code = generateSessionCode({ random: () => 0x21 });
    const store = new InMemoryParticipantSessionStore();
    const audit = new HashChainedAudienceAuditEmitter({ workspaceId: 'default' });
    const service = new ParticipantSessionService({
      store,
      audit,
      presenterLookup: snapshotLookup,
      clock: fixedClock(1_000_000),
    });
    const result = await service.join({
      session_code: sessionCode(code),
      workspace_id: 'w1',
      participant_id: participantId('p1'),
      display_name: 'Alice',
      locale: 'en-US',
    });
    expect(result.session.joined_at).toBe('1970-01-01T00:16:40.000Z');
    expect(result.session.last_seen_at).toBe('1970-01-01T00:16:40.000Z');
  });

  it('rate bucket refills tokens on heartbeat', async () => {
    const code = generateSessionCode({ random: () => 0x11 });
    const store = new InMemoryParticipantSessionStore();
    const audit = new HashChainedAudienceAuditEmitter({ workspaceId: 'default' });
    let now = 1_000;
    const service = new ParticipantSessionService({
      store,
      audit,
      presenterLookup: snapshotLookup,
      clock: () => now,
    });
    const first = await service.join({
      session_code: sessionCode(code),
      workspace_id: 'w1',
      participant_id: participantId('p1'),
      display_name: 'Alice',
      locale: 'en-US',
    });
    expect(first.session.rate_bucket.tokens).toBe(20);
    // 5 seconds later — 4 tokens/sec * 5 = 20 tokens, capped at 20.
    now = 1_000 + 5_000;
    const next = await service.heartbeat({
      session_id: first.session.id,
      participant_id: participantId('p1'),
    });
    expect(next.rate_bucket.tokens).toBe(20);
  });

  it('audit chain stays intact across join + leave', async () => {
    const code = generateSessionCode({ random: () => 0x10 });
    const { service, audit } = buildService();
    const first = await service.join({
      session_code: sessionCode(code),
      workspace_id: 'w1',
      participant_id: participantId('p1'),
      display_name: 'Alice',
      locale: 'en-US',
    });
    await service.leave({
      session_id: first.session.id,
      participant_id: participantId('p1'),
      reason: 'user_action',
    });
    const verdict = await audit.verify();
    expect(verdict.ok).toBe(true);
    if (verdict.ok) {
      expect(verdict.entries).toBe(2);
    }
  });
});