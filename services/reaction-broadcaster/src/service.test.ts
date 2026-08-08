import { describe, expect, it, beforeEach } from 'vitest';
import { InMemoryEdgeBus } from '@domio/edge-pubsub';
import { ReactionBroadcaster } from './service.js';

describe('reaction-broadcaster', () => {
  let bus: InMemoryEdgeBus;
  let broadcaster: ReactionBroadcaster;

  beforeEach(() => {
    bus = new InMemoryEdgeBus();
    broadcaster = new ReactionBroadcaster({ bus });
  });

  it('broadcasts a reaction', async () => {
    const e = await broadcaster.broadcast({
      workspace_id: 'w1', session_id: 's1', slide_id: 'slide-1',
      participant_id: 'u-1', emoji: '👏', idempotency_key: 'k1',
    });
    expect(e.emoji).toBe('👏');
    expect(e.idempotency_key).toBe('k1');
    expect(broadcaster.recentCount()).toBe(1);
  });

  it('dedupes retries within the ring window', async () => {
    const e1 = await broadcaster.broadcast({
      workspace_id: 'w1', session_id: 's1', slide_id: 'slide-1',
      participant_id: 'u-1', emoji: '👏', idempotency_key: 'k1',
    });
    const e2 = await broadcaster.broadcast({
      workspace_id: 'w1', session_id: 's1', slide_id: 'slide-1',
      participant_id: 'u-1', emoji: '👏', idempotency_key: 'k1',
    });
    expect(e1.idempotency_key).toBe(e2.idempotency_key);
    expect(e1.posted_at_ms).toBe(e2.posted_at_ms);
    expect(broadcaster.recentCount()).toBe(1);
  });

  it('different idempotency keys create separate entries', async () => {
    await broadcaster.broadcast({
      workspace_id: 'w1', session_id: 's1', slide_id: 'slide-1',
      participant_id: 'u-1', emoji: '👏', idempotency_key: 'k1',
    });
    await broadcaster.broadcast({
      workspace_id: 'w1', session_id: 's1', slide_id: 'slide-1',
      participant_id: 'u-1', emoji: '🎉', idempotency_key: 'k2',
    });
    expect(broadcaster.recentCount()).toBe(2);
  });

  it('ring evicts oldest when capacity is reached', async () => {
    const small = new ReactionBroadcaster({ bus, ring: { capacity: 2 } as never });
    void small;
    // Use a fresh broadcaster with a 2-cap ring directly:
    const { ReactionRing } = await import('./ring.js');
    const ring = new ReactionRing({ capacity: 2 });
    const r = new ReactionBroadcaster({ bus, ring });
    await r.broadcast({ workspace_id: 'w1', session_id: 's1', slide_id: 's', participant_id: 'u', emoji: 'a', idempotency_key: 'k1' });
    await r.broadcast({ workspace_id: 'w1', session_id: 's1', slide_id: 's', participant_id: 'u', emoji: 'b', idempotency_key: 'k2' });
    await r.broadcast({ workspace_id: 'w1', session_id: 's1', slide_id: 's', participant_id: 'u', emoji: 'c', idempotency_key: 'k3' });
    expect(r.recentCount()).toBe(2);
    expect(ring.get('k1')).toBeNull();
    expect(ring.get('k3')).not.toBeNull();
  });
});
