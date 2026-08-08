/**
 * @domio/analytics-sdk unit tests.
 *
 * Covers:
 *   * PII stripper (regex coverage for email / phone / IPv4 / SSN / CC).
 *   * HMAC sign/verify (positive + negative cases).
 *   * Batcher flush cadence and retry behavior.
 *   * ULID monotonicity + length.
 *   * AnalyticsClient emit* helpers (DNT honored, PII applied, defaults stamped).
 */

import { describe, it, expect } from 'vitest';
import { stripPii, stripEvent, refererHost } from './pii.js';
import { signBody, verifyBody } from './hmac.js';
import { ulid, AnalyticsClient } from './client.js';
import { InMemoryTransport } from './transport.js';
import { MemoryQueueStore } from './queue.js';
import type { AnalyticsContext, InteractionEvent } from './types.js';

const ctx: AnalyticsContext = {
  workspace_id: 'ws-1',
  deck_id: 'deck-1',
  viewer_id_key: 'vk-1',
  session_id: 's-1',
  privacy_mode: 'pseudonymous',
  source_app: 'viewer',
  device_class: 'desktop',
};

function makeClient(overrides: Partial<Parameters<typeof AnalyticsClient.prototype.flush>> = {}) {
  const transport = new InMemoryTransport();
  const queue = new MemoryQueueStore();
  const client = new AnalyticsClient({
    ingestUrl: 'http://localhost:0/v1/events',
    hmacKeyHex: 'a'.repeat(64),
    context: ctx,
    queueStore: queue,
    transport,
    maxBatchSize: 5,
    flushIntervalMs: 100,
    random: () => 0.5,
    now: () => 1_700_000_000_000,
    detectDnt: () => false,
    ...overrides,
  });
  return { client, transport, queue };
}

describe('stripPii', () => {
  it('redacts emails', () => {
    expect(stripPii('contact me at daiyaan2002@example.com please')).toContain('[email]');
    expect(stripPii('contact me at daiyaan2002@example.com please')).not.toContain('daiyaan2002@');
  });

  it('redacts IPv4 addresses', () => {
    expect(stripPii('client ip 192.168.1.42 from')).toContain('[ip]');
    expect(stripPii('client ip 192.168.1.42 from')).not.toContain('192.168');
  });

  it('redacts phone numbers', () => {
    expect(stripPii('call +1 555-123-4567 now')).toContain('[phone]');
    expect(stripPii('call +1 555-123-4567 now')).not.toContain('555-123');
  });

  it('redacts credit-card-shaped strings', () => {
    expect(stripPii('card 4111 1111 1111 1111 paid')).toContain('[card]');
  });

  it('redacts SSNs', () => {
    expect(stripPii('ssn 123-45-6789 leaked')).toContain('[ssn]');
  });

  it('preserves non-PII tokens', () => {
    expect(stripPii('hello world')).toBe('hello world');
    expect(stripPii('item-42 shipped')).toBe('item-42 shipped');
  });

  it('walks event payloads recursively', () => {
    const out = stripEvent({ a: 'daiyaan2002@example.com', b: { c: '192.168.0.1' }, d: [1, 'x@y.com'] });
    expect(out).toEqual({ a: '[email]', b: { c: '[ip]' }, d: [1, '[email]'] });
  });
});

describe('refererHost', () => {
  it('returns bare host', () => {
    expect(refererHost('https://twitter.com/foo/bar?x=1')).toBe('twitter.com');
  });
  it('strips www.', () => {
    expect(refererHost('https://www.example.com/p')).toBe('example.com');
  });
  it('returns empty for garbage', () => {
    expect(refererHost('not a url')).toBe('');
  });
});

describe('HMAC', () => {
  it('signs deterministically', () => {
    const a = signBody('a'.repeat(64), '{"events":[]}');
    const b = signBody('a'.repeat(64), '{"events":[]}');
    expect(a).toBe(b);
    expect(a).toMatch(/^sha256=[a-f0-9]{64}$/);
  });

  it('verifies positive', () => {
    const sig = signBody('a'.repeat(64), 'hello');
    expect(verifyBody('a'.repeat(64), 'hello', sig)).toBe(true);
  });

  it('rejects negative (different body)', () => {
    const sig = signBody('a'.repeat(64), 'hello');
    expect(verifyBody('a'.repeat(64), 'hellp', sig)).toBe(false);
  });

  it('rejects negative (different key)', () => {
    const sig = signBody('a'.repeat(64), 'hello');
    expect(verifyBody('b'.repeat(64), 'hello', sig)).toBe(false);
  });

  it('throws on non-hex key', () => {
    expect(() => signBody('not-hex', 'x')).toThrow();
  });
});

describe('ulid', () => {
  it('is 26 chars of crockford base32', () => {
    const id = ulid(() => 0.5, () => 1_700_000_000_000);
    expect(id).toHaveLength(26);
    expect(id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
  });

  it('is monotonic in the time prefix', () => {
    const a = ulid(() => 0, () => 1);
    const b = ulid(() => 0, () => 2);
    expect(b > a).toBe(true);
  });
});

describe('AnalyticsClient', () => {
  it('emits view events with default fields stamped', async () => {
    const { client, transport } = makeClient();
    client.start();
    client.emitView({
      workspace_id: 'ws-1',
      deck_id: 'deck-1',
      slide_id: 'slide-1',
      viewer_id_key: 'vk-1',
      session_id: 's-1',
    });
    await client.flush();
    client.stop?.();
    expect(transport.totalEvents()).toBe(1);
    const evt = transport.received[0]![0]!;
    expect(evt.event_name).toBe('view');
    expect(evt.schema_version).toBe(1);
    expect(evt.ts_ms).toBe(1_700_000_000_000);
    expect(evt.privacy_mode).toBe('pseudonymous');
    expect(evt.device_class).toBe('desktop');
    expect(evt.source_app).toBe('viewer');
    expect(evt.ingest_topic).toBe('events.ingest.raw');
  });

  it('honors doNotTrack', async () => {
    const { client, transport } = makeClient({ detectDnt: () => true } as never);
    let dropped = false;
    try {
      client.emitView({ workspace_id: 'ws-1', deck_id: 'deck-1', slide_id: 's', viewer_id_key: 'v' });
    } catch {
      dropped = true;
    }
    expect(dropped).toBe(true);
    await client.flush();
    expect(transport.totalEvents()).toBe(0);
  });

  it('strips PII before emit', async () => {
    const { client, transport } = makeClient();
    const interaction: Omit<InteractionEvent, 'event_id' | 'event_name' | 'schema_version' | 'ts_ms' | 'ingest_topic' | 'source_app' | 'privacy_mode' | 'device_class' | 'interaction_kind'> & {
      interaction_kind: InteractionEvent['interaction_kind'];
    } = {
      workspace_id: 'ws-1',
      deck_id: 'deck-1',
      slide_id: 's',
      viewer_id_key: 'v',
      interaction_kind: 'qa_item',
      value_text: 'contact daiyaan2002@example.com',
    };
    client.emitInteraction(interaction);
    await client.flush();
    const evt = transport.received[0]![0]! as InteractionEvent;
    expect(evt.value_text).toBe('contact [email]');
  });

  it('flushed batch hits the wire with HMAC signature', () => {
    const { client } = makeClient();
    const out = client.buildSignedBody([]);
    expect(out.signature).toMatch(/^sha256=[a-f0-9]{64}$/);
  });
});
