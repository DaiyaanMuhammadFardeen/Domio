import { describe, expect, it, beforeEach } from 'vitest';
import { InMemoryEdgeBus } from '@domio/edge-pubsub';
import { SentimentCollector } from './service.js';

describe('sentiment-collector', () => {
  let bus: InMemoryEdgeBus;
  let collector: SentimentCollector;

  beforeEach(() => {
    bus = new InMemoryEdgeBus();
    collector = new SentimentCollector({ bus });
  });

  it('records sentiment votes and computes summary', async () => {
    await collector.cast({
      workspace_id: 'w1',
      session_id: 's1',
      slide_id: 'sl-1',
      participant_id: 'u-1',
      score: 2,
      idempotency_key: 'k1',
    });
    await collector.cast({
      workspace_id: 'w1',
      session_id: 's1',
      slide_id: 'sl-1',
      participant_id: 'u-2',
      score: 1,
      idempotency_key: 'k2',
    });
    await collector.cast({
      workspace_id: 'w1',
      session_id: 's1',
      slide_id: 'sl-1',
      participant_id: 'u-3',
      score: -1,
      idempotency_key: 'k3',
    });
    const s = collector.summary('sl-1');
    expect(s.count).toBe(3);
    expect(s.average).toBeCloseTo(0.666, 2);
    expect(s.by_score[2]).toBe(1);
    expect(s.by_score[1]).toBe(1);
    expect(s.by_score[-1]).toBe(1);
  });

  it('dedupes retries by idempotency_key', async () => {
    await collector.cast({
      workspace_id: 'w1',
      session_id: 's1',
      slide_id: 'sl-1',
      participant_id: 'u-1',
      score: 2,
      idempotency_key: 'k1',
    });
    await collector.cast({
      workspace_id: 'w1',
      session_id: 's1',
      slide_id: 'sl-1',
      participant_id: 'u-1',
      score: -2,
      idempotency_key: 'k1',
    });
    const s = collector.summary('sl-1');
    expect(s.count).toBe(1);
    expect(s.by_score[2]).toBe(1);
  });
});
