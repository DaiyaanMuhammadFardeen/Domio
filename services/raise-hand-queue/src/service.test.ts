import { describe, expect, it, beforeEach } from 'vitest';
import { InMemoryEdgeBus } from '@domio/edge-pubsub';
import { RaiseHandService } from './service.js';

describe('raise-hand-queue', () => {
  let bus: InMemoryEdgeBus;
  let svc: RaiseHandService;

  beforeEach(() => {
    bus = new InMemoryEdgeBus();
    svc = new RaiseHandService({ bus });
  });

  it('enqueues in FIFO order', async () => {
    await svc.raise({ workspace_id: 'w1', session_id: 's1', participant_id: 'u-1' });
    await svc.raise({ workspace_id: 'w1', session_id: 's1', participant_id: 'u-2' });
    await svc.raise({ workspace_id: 'w1', session_id: 's1', participant_id: 'u-3' });
    const list = svc.list();
    expect(list.map((h) => h.participant_id)).toEqual(['u-1', 'u-2', 'u-3']);
    expect(list[0]?.position).toBe(0);
  });

  it('dedupes same participant raising twice', async () => {
    await svc.raise({ workspace_id: 'w1', session_id: 's1', participant_id: 'u-1' });
    await svc.raise({ workspace_id: 'w1', session_id: 's1', participant_id: 'u-1' });
    expect(svc.size()).toBe(1);
  });

  it('calls head and clears the queue', async () => {
    await svc.raise({ workspace_id: 'w1', session_id: 's1', participant_id: 'u-1' });
    await svc.raise({ workspace_id: 'w1', session_id: 's1', participant_id: 'u-2' });
    const called = await svc.call('s1', 'u-1', 'p1');
    expect(called?.status).toBe('called');
    expect(svc.size()).toBe(1);
    expect(svc.list()[0]?.participant_id).toBe('u-2');
  });

  it('dismisses an individual hand', async () => {
    await svc.raise({ workspace_id: 'w1', session_id: 's1', participant_id: 'u-1' });
    await svc.raise({ workspace_id: 'w1', session_id: 's1', participant_id: 'u-2' });
    const dismissed = await svc.dismiss('s1', 'u-2', 'p1');
    expect(dismissed?.status).toBe('dismissed');
    expect(svc.size()).toBe(1);
    expect(svc.list()[0]?.participant_id).toBe('u-1');
  });

  it('expires stale hands beyond ttl', async () => {
    const { RaiseHandQueue } = await import('./queue.js');
    const queue = new RaiseHandQueue({ default_ttl_ms: 1000 });
    const fast = new RaiseHandService({ bus, queue, now_ms: () => 0 });
    await fast.raise({ workspace_id: 'w1', session_id: 's1', participant_id: 'u-1' });
    const slow = new RaiseHandService({ bus, queue, now_ms: () => 2000 });
    expect(slow.size()).toBe(0);
    expect(slow.list()).toEqual([]);
  });
});
