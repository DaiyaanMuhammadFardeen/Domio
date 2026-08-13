import { describe, expect, it, beforeEach } from 'vitest';
import { InMemoryEdgeBus } from '@domio/edge-pubsub';
import { NavVoteCollector } from './service.js';

describe('nav-vote-collector', () => {
  let bus: InMemoryEdgeBus;
  let collector: NavVoteCollector;

  beforeEach(() => {
    bus = new InMemoryEdgeBus();
    collector = new NavVoteCollector({ bus });
  });

  it('collects votes and tallies', async () => {
    await collector.cast({
      workspace_id: 'w1',
      session_id: 's1',
      slide_id: 'sl-1',
      participant_id: 'u-1',
      direction: 'next',
      idempotency_key: 'k1',
    });
    await collector.cast({
      workspace_id: 'w1',
      session_id: 's1',
      slide_id: 'sl-1',
      participant_id: 'u-2',
      direction: 'next',
      idempotency_key: 'k2',
    });
    await collector.cast({
      workspace_id: 'w1',
      session_id: 's1',
      slide_id: 'sl-1',
      participant_id: 'u-3',
      direction: 'previous',
      idempotency_key: 'k3',
    });
    const t = collector.currentTally('sl-1');
    expect(t.next).toBe(2);
    expect(t.previous).toBe(1);
    expect(t.back).toBe(0);
  });

  it('dedupes retries by idempotency_key', async () => {
    await collector.cast({
      workspace_id: 'w1',
      session_id: 's1',
      slide_id: 'sl-1',
      participant_id: 'u-1',
      direction: 'next',
      idempotency_key: 'k1',
    });
    await collector.cast({
      workspace_id: 'w1',
      session_id: 's1',
      slide_id: 'sl-1',
      participant_id: 'u-1',
      direction: 'next',
      idempotency_key: 'k1',
    });
    const t = collector.currentTally('sl-1');
    expect(t.next).toBe(1);
  });
});
