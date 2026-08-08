import { describe, expect, it } from 'vitest';
import { InMemoryEdgeBus, decode, encode, topicFor } from './index.js';

describe('edge-pubsub', () => {
  it('publishes and receives a message on the same topic', async () => {
    const bus = new InMemoryEdgeBus();
    const topic = topicFor({ session_id: 's1', topic: 'poll' });
    const received: Array<{ seq: number; payload: unknown }> = [];
    const handle = await bus.subscribe({ topic, consumer: 'c1' });
    handle.handler = async (msg) => {
      received.push({ seq: msg.seq, payload: decode(msg.payload) });
    };
    const res = await bus.publish({
      session_id: 's1', topic: 'poll', payload: encode({ option: 'yes' }),
    });
    expect(res.seq).toBe(1);
    expect(received).toHaveLength(1);
    expect(received[0]?.payload).toEqual({ option: 'yes' });
    await bus.close();
  });

  it('fans out to multiple consumers', async () => {
    const bus = new InMemoryEdgeBus();
    const topic = topicFor({ session_id: 's1', topic: 'qa' });
    const a: number[] = [];
    const b: number[] = [];
    const ha = await bus.subscribe({ topic, consumer: 'a' });
    const hb = await bus.subscribe({ topic, consumer: 'b' });
    ha.handler = async () => { a.push(1); };
    hb.handler = async () => { b.push(1); };
    await bus.publish({ session_id: 's1', topic: 'qa', payload: encode({}) });
    expect(a).toEqual([1]);
    expect(b).toEqual([1]);
    await bus.close();
  });

  it('stop receiving after unsubscribe', async () => {
    const bus = new InMemoryEdgeBus();
    const topic = topicFor({ session_id: 's1', topic: 'reaction' });
    const seen: number[] = [];
    const handle = await bus.subscribe({ topic, consumer: 'c1' });
    handle.handler = async (msg) => { seen.push(msg.seq); };
    await bus.publish({ session_id: 's1', topic: 'reaction', payload: encode({}) });
    await handle.unsubscribe();
    await bus.publish({ session_id: 's1', topic: 'reaction', payload: encode({}) });
    expect(seen).toEqual([1]);
    await bus.close();
  });

  it('assigns monotonically-increasing seq per topic', async () => {
    const bus = new InMemoryEdgeBus();
    const seqs: number[] = [];
    const topic = topicFor({ session_id: 's1', topic: 'lifecycle' });
    const handle = await bus.subscribe({ topic, consumer: 'c1' });
    handle.handler = async (msg) => { seqs.push(msg.seq); };
    for (let i = 0; i < 5; i++) {
      await bus.publish({ session_id: 's1', topic: 'lifecycle', payload: encode({}) });
    }
    expect(seqs).toEqual([1, 2, 3, 4, 5]);
    await bus.close();
  });

  it('subscribes to a sharded topic only', async () => {
    const bus = new InMemoryEdgeBus();
    const tShard0 = topicFor({ session_id: 's1', topic: 'poll', shard_index: 0 });
    const seen: string[] = [];
    const handle = await bus.subscribe({ topic: tShard0, consumer: 'c1' });
    handle.handler = async (msg) => { seen.push(msg.topic); };
    await bus.publish({ session_id: 's1', topic: 'poll', shard_index: 0, payload: encode({}) });
    await bus.publish({ session_id: 's1', topic: 'poll', shard_index: 1, payload: encode({}) });
    expect(seen).toEqual([tShard0]);
    await bus.close();
  });

  it('publish respects start_seq floor', async () => {
    const bus = new InMemoryEdgeBus();
    const topic = topicFor({ session_id: 's1', topic: 'poll' });
    await bus.publish({ session_id: 's1', topic: 'poll', payload: encode({}) });
    await bus.publish({ session_id: 's1', topic: 'poll', payload: encode({}) });
    const seen: number[] = [];
    const handle = await bus.subscribe({ topic, consumer: 'late', start_seq: 2 });
    handle.handler = async (msg) => { seen.push(msg.seq); };
    await bus.publish({ session_id: 's1', topic: 'poll', payload: encode({}) });
    expect(seen).toEqual([3]);
    await bus.close();
  });

  it('rejects publish after close', async () => {
    const bus = new InMemoryEdgeBus();
    await bus.close();
    await expect(bus.publish({ session_id: 's1', topic: 'poll', payload: encode({}) }))
      .rejects.toThrow(/closed/);
  });

  it('round-trips encode/decode', () => {
    const payload = { foo: 'bar', n: 1, list: [1, 2, 3] };
    expect(decode(encode(payload))).toEqual(payload);
  });

  it('isolates topics per session', async () => {
    const bus = new InMemoryEdgeBus();
    const topicA = topicFor({ session_id: 'sA', topic: 'poll' });
    const seen: string[] = [];
    const handle = await bus.subscribe({ topic: topicA, consumer: 'c1' });
    handle.handler = async (msg) => { seen.push(msg.topic); };
    await bus.publish({ session_id: 'sB', topic: 'poll', payload: encode({}) });
    expect(seen).toEqual([]);
    await bus.close();
  });

  it('shardFromTopic and sessionFromTopic extract fields', async () => {
    const { shardFromTopic, sessionFromTopic } = await import('./topics.js');
    const t = topicFor({ session_id: 'abc', topic: 'poll', shard_index: 5 });
    expect(shardFromTopic(t)).toBe(5);
    expect(sessionFromTopic(t)).toBe('abc');
    expect(shardFromTopic('realtime.session.x.poll')).toBeNull();
  });
});