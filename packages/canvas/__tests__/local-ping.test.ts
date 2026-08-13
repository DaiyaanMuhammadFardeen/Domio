import { describe, it, expect } from 'vitest';
import { LocalPingAdapter } from '../src/presence/ping.js';
import { LocalChatAdapter } from '../src/presence/local-chat.js';

describe('local ping', () => {
  it('emits a 1.2 s ping', () => {
    const ping = new LocalPingAdapter();
    const result = ping.emit({ x: 10, y: 10 }, 1000);
    expect(result).not.toBeNull();
    expect(result!.durationMs).toBe(1200);
  });

  it('rate-limits to 1 per 2 s', () => {
    const ping = new LocalPingAdapter();
    expect(ping.emit({ x: 0, y: 0 }, 1000)).not.toBeNull();
    expect(ping.emit({ x: 0, y: 0 }, 1500)).toBeNull();
    expect(ping.emit({ x: 0, y: 0 }, 3000)).not.toBeNull();
  });

  it('active returns only pings within their duration', () => {
    const ping = new LocalPingAdapter();
    ping.emit({ x: 0, y: 0 }, 1000);
    expect(ping.active(1100)).toHaveLength(1);
    expect(ping.active(3000)).toHaveLength(0);
  });
});

describe('local chat', () => {
  it('opens on T key (without Cmd/Ctrl)', () => {
    const chat = new LocalChatAdapter();
    const result = chat.feed({ key: 'T', timestamp: 0 });
    expect(result).toBe('open');
    expect(chat.isOpen()).toBe(true);
  });

  it('closes on Escape', () => {
    const chat = new LocalChatAdapter();
    chat.feed({ key: 'T', timestamp: 0 });
    expect(chat.feed({ key: 'Escape', timestamp: 100 })).toBe('close');
    expect(chat.isOpen()).toBe(false);
  });

  it('submits a message anchored to the cursor', () => {
    const chat = new LocalChatAdapter();
    chat.setCursor({ x: 100, y: 200 });
    chat.feed({ key: 'T', timestamp: 0 });
    const message = chat.submit('Hello');
    expect(message.text).toBe('Hello');
    expect(message.cursor).toEqual({ x: 100, y: 200 });
  });
});
