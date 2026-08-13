import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NatsSubscriptionManager } from './nats_manager.js';
import type { NatsConnection, Codec, Subscription } from 'nats';

// ─── Fake NATS helpers ──────────────────────────────────────────

/** Minimal fake NatsConnection that tracks subscribe calls. */
function fakeNc(): NatsConnection & { _subs: Record<string, Subscription> } {
  const subs: Record<string, Subscription> = {} as Record<string, Subscription>;
  const nc = {
    _subs: subs,
    subscribe: vi.fn((subject: string, _opts?: unknown) => {
      const sub = {
        getSubject: () => subject,
        unsubscribe: vi.fn(async () => {}),
        drain: vi.fn(async () => {}),
      } as unknown as Subscription;
      subs[subject] = sub;
      return sub;
    }),
    publish: vi.fn(),
    drain: vi.fn(async () => {}),
    close: vi.fn(async () => {}),
    isClosed: vi.fn(() => false),
    isDraining: vi.fn(() => false),
    stats: vi.fn(() => ({ in_msgs: 0, in_bytes: 0, out_msgs: 0, out_bytes: 0 })),
    request: vi.fn(),
    requestMany: vi.fn(),
    flush: vi.fn(async () => {}),
    jetstream: vi.fn(),
    jetstreamManager: vi.fn(),
    services: { add: vi.fn() },
  } as unknown as NatsConnection & { _subs: Record<string, Subscription> };
  return nc;
}

/** Fake StringCodec — encodes/decodes via TextEncoder/Decoder. */
function fakeSc(): Codec<string> {
  const enc = new TextEncoder();
  const dec = new TextDecoder();
  return {
    encode: (d: string) => enc.encode(d),
    decode: (a: Uint8Array) => dec.decode(a),
  };
}

// ─── Tests ──────────────────────────────────────────────────────

describe('NatsSubscriptionManager', () => {
  let nc: ReturnType<typeof fakeNc>;
  let sc: Codec<string>;

  beforeEach(() => {
    nc = fakeNc();
    sc = fakeSc();
  });

  it('subscribes to crm.sync.events and collab.events.>', () => {
    const manager = new NatsSubscriptionManager({
      nc,
      sc,
      handlers: { onCrmEvent: async () => {}, onCollabEvent: async () => {} },
      collabEnabled: true,
    });
    const count = manager.start();
    expect(count).toBe(2);
    expect(nc.subscribe).toHaveBeenCalledTimes(2);
    expect(nc._subs['crm.sync.events']).toBeDefined();
    expect(nc._subs['collab.events.>']).toBeDefined();
  });

  it('skips collab subscription when collabEnabled is false', () => {
    const manager = new NatsSubscriptionManager({
      nc,
      sc,
      handlers: { onCrmEvent: async () => {}, onCollabEvent: async () => {} },
      collabEnabled: false,
    });
    const count = manager.start();
    expect(count).toBe(1);
    expect(nc.subscribe).toHaveBeenCalledTimes(1);
    expect(nc._subs['crm.sync.events']).toBeDefined();
    expect(nc._subs['collab.events.>']).toBeUndefined();
  });

  it('calls onCrmEvent with decoded JSON payload', async () => {
    const onCrmEvent = vi.fn(async () => {});
    const manager = new NatsSubscriptionManager({
      nc,
      sc,
      handlers: { onCrmEvent, onCollabEvent: async () => {} },
      collabEnabled: true,
    });
    manager.start();

    // Simulate a NATS message on crm.sync.events
    const payload = JSON.stringify({ workspace_id: 'w-1', event_name: 'view' });
    const msg = { data: sc.encode(payload) };
    const crmCall = (nc.subscribe as ReturnType<typeof vi.fn>).mock.calls.find(
      (c: unknown[]) => c[0] === 'crm.sync.events',
    );
    expect(crmCall).toBeDefined();
    // The second arg is options with callback
    const callback = crmCall![1]?.callback ?? crmCall![1];
    if (typeof callback === 'function') {
      callback(null, msg);
    } else if (
      callback &&
      typeof callback === 'object' &&
      typeof (callback as Record<string, unknown>).callback === 'function'
    ) {
      (callback as { callback: (err: unknown, msg: unknown) => void }).callback(null, msg);
    }

    await vi.waitFor(() => expect(onCrmEvent).toHaveBeenCalledTimes(1));
    expect(onCrmEvent).toHaveBeenCalledWith(payload);
  });

  it('calls onCollabEvent with decoded JSON payload', async () => {
    const onCollabEvent = vi.fn(async () => {});
    const manager = new NatsSubscriptionManager({
      nc,
      sc,
      handlers: { onCrmEvent: async () => {}, onCollabEvent },
      collabEnabled: true,
    });
    manager.start();

    const payload = JSON.stringify({ event_type: 'comment.mentioned', workspace_id: 'w-1' });
    const msg = { data: sc.encode(payload), subject: 'collab.events.comment' };
    const collabCall = (nc.subscribe as ReturnType<typeof vi.fn>).mock.calls.find(
      (c: unknown[]) => c[0] === 'collab.events.>',
    );
    expect(collabCall).toBeDefined();
    const callback = collabCall![1]?.callback ?? collabCall![1];
    if (typeof callback === 'function') {
      callback(null, msg);
    } else if (
      callback &&
      typeof callback === 'object' &&
      typeof (callback as Record<string, unknown>).callback === 'function'
    ) {
      (callback as { callback: (err: unknown, msg: unknown) => void }).callback(null, msg);
    }

    await vi.waitFor(() => expect(onCollabEvent).toHaveBeenCalledTimes(1));
    expect(onCollabEvent).toHaveBeenCalledWith(payload);
  });

  it('skips invalid JSON messages without crashing', async () => {
    const onCrmEvent = vi.fn(async () => {});
    const manager = new NatsSubscriptionManager({
      nc,
      sc,
      handlers: { onCrmEvent, onCollabEvent: async () => {} },
      collabEnabled: false,
    });
    manager.start();

    // Send malformed data
    const badData = new TextEncoder().encode('NOT VALID JSON {{{');
    const msg = { data: badData };
    const crmCall = (nc.subscribe as ReturnType<typeof vi.fn>).mock.calls.find(
      (c: unknown[]) => c[0] === 'crm.sync.events',
    );
    const callback = crmCall![1]?.callback ?? crmCall![1];
    if (typeof callback === 'function') {
      callback(null, msg);
    } else if (
      callback &&
      typeof callback === 'object' &&
      typeof (callback as Record<string, unknown>).callback === 'function'
    ) {
      (callback as { callback: (err: unknown, msg: unknown) => void }).callback(null, msg);
    }

    // Give async handlers a tick to NOT be called
    await new Promise((r) => setTimeout(r, 50));
    expect(onCrmEvent).not.toHaveBeenCalled();
  });

  it('handler errors are caught and do not crash the loop', async () => {
    let callCount = 0;
    const onCrmEvent = vi.fn(async () => {
      callCount++;
      if (callCount === 1) throw new Error('handler boom');
    });
    const manager = new NatsSubscriptionManager({
      nc,
      sc,
      handlers: { onCrmEvent, onCollabEvent: async () => {} },
      collabEnabled: false,
    });
    manager.start();

    const payload = JSON.stringify({ ok: true });
    const msg = { data: sc.encode(payload) };
    const crmCall = (nc.subscribe as ReturnType<typeof vi.fn>).mock.calls.find(
      (c: unknown[]) => c[0] === 'crm.sync.events',
    );
    const callback = crmCall![1]?.callback ?? crmCall![1];
    const invoke = () => {
      if (typeof callback === 'function') {
        callback(null, msg);
      } else if (
        callback &&
        typeof callback === 'object' &&
        typeof (callback as Record<string, unknown>).callback === 'function'
      ) {
        (callback as { callback: (err: unknown, msg: unknown) => void }).callback(null, msg);
      }
    };

    // First call throws — should not crash
    invoke();
    await new Promise((r) => setTimeout(r, 50));
    expect(onCrmEvent).toHaveBeenCalledTimes(1);

    // Second call succeeds — proves the loop continued
    invoke();
    await vi.waitFor(() => expect(onCrmEvent).toHaveBeenCalledTimes(2));
  });

  it('stop() unsubscribes all subscriptions', async () => {
    const manager = new NatsSubscriptionManager({
      nc,
      sc,
      handlers: { onCrmEvent: async () => {}, onCollabEvent: async () => {} },
      collabEnabled: true,
    });
    manager.start();
    expect(Object.keys(nc._subs)).toHaveLength(2);

    await manager.stop();
    // All subs should have been unsubscribed
    for (const sub of Object.values(nc._subs)) {
      expect(sub.unsubscribe).toHaveBeenCalled();
    }
  });

  it('stop() is idempotent (safe to call multiple times)', async () => {
    const manager = new NatsSubscriptionManager({
      nc,
      sc,
      handlers: { onCrmEvent: async () => {}, onCollabEvent: async () => {} },
      collabEnabled: true,
    });
    manager.start();
    await manager.stop();
    await manager.stop(); // second call should not throw
  });
});
