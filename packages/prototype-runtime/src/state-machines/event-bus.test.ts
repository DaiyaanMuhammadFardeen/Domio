import { describe, expect, it, vi } from 'vitest';
import { EventBus } from './event-bus.js';

describe('EventBus', () => {
  it('invokes every registered handler on emit', () => {
    const bus = new EventBus();
    const a = vi.fn();
    const b = vi.fn();
    bus.onTransition(a);
    bus.onTransition(b);
    bus.handler({ instanceId: 'inst-1', previous: 'idle', current: 'active', event: 'click', at: 100 });
    expect(a).toHaveBeenCalledOnce();
    expect(b).toHaveBeenCalledOnce();
    expect(a.mock.calls[0]?.[0]).toMatchObject({ instanceId: 'inst-1' });
  });

  it('returns an unsubscribe function that removes the handler', () => {
    const bus = new EventBus();
    const fn = vi.fn();
    const off = bus.onTransition(fn);
    expect(bus.size()).toBe(1);
    off();
    expect(bus.size()).toBe(0);
    bus.handler({ instanceId: 'i', previous: 'a', current: 'b', event: 'hover', at: 1 });
    expect(fn).not.toHaveBeenCalled();
  });

  it('captures the last event', () => {
    const bus = new EventBus();
    bus.handler({ instanceId: 'i', previous: 'a', current: 'b', event: 'click', at: 1 });
    bus.handler({ instanceId: 'i', previous: 'b', current: 'c', event: 'press', at: 2 });
    const last = bus.lastEvent();
    expect(last?.previous).toBe('b');
    expect(last?.current).toBe('c');
    expect(last?.event).toBe('press');
  });

  it('isolates handler exceptions', () => {
    const bus = new EventBus();
    const a = vi.fn(() => {
      throw new Error('boom');
    });
    const b = vi.fn();
    bus.onTransition(a);
    bus.onTransition(b);
    expect(() => bus.handler({ instanceId: 'i', previous: 'a', current: 'b', event: 'click', at: 1 })).not.toThrow();
    expect(a).toHaveBeenCalledOnce();
    expect(b).toHaveBeenCalledOnce();
  });

  it('clear drops handlers + last event', () => {
    const bus = new EventBus();
    bus.onTransition(vi.fn());
    bus.handler({ instanceId: 'i', previous: 'a', current: 'b', event: 'click', at: 1 });
    bus.clear();
    expect(bus.size()).toBe(0);
    expect(bus.lastEvent()).toBeNull();
  });

  it('handler shortcut is stable across calls', () => {
    const bus = new EventBus();
    const h1 = bus.handler;
    const h2 = bus.handler;
    expect(h1).toBe(h2);
  });
});