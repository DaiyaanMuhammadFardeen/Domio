/**
 * timeline-service — tests.
 *
 * Per Wave 11 §S11.1 acceptance: the service falls back to a
 * deterministic seed on fetch failure, maps the wire payload correctly,
 * and computes a structured diff between two snapshots.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  diffEvents,
  diffSnapshots,
  getSession,
  listSeedSessions,
  listSessionEvents,
  type SessionSnapshot,
} from './timeline-service.js';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('timeline-service', () => {
  it('returns the parsed session on a 200 response', async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/v1/sessions/sess-1')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            id: 'sess-1',
            deck_id: 'deck-1',
            deck_title: 'My deck',
            presenter_name: 'Ada',
            started_at_ms: 1700000000000,
            ended_at_ms: 1700003600000,
            attendee_count: 12,
          }),
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ events: [] }),
      };
    }) as unknown as typeof fetch;

    const session = await getSession('sess-1', 'http://tl.test');
    expect(session?.deck_id).toBe('deck-1');
    expect(session?.presenter_name).toBe('Ada');
    expect(session?.attendee_count).toBe(12);
  });

  it('falls back to a deterministic seed session when the service is down', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error('ECONNREFUSED');
    }) as unknown as typeof fetch;

    const session = await getSession('session-deck-q3-board', 'http://tl.test');
    expect(session).not.toBeNull();
    expect(session?.deck_id).toBe('deck-q3-board');
  });

  it('returns the first seed session when the id is unknown', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error('ECONNREFUSED');
    }) as unknown as typeof fetch;

    const session = await getSession('session-that-does-not-exist', 'http://tl.test');
    const first = listSeedSessions()[0];
    expect(session?.id).toBe(first?.id);
  });

  it('maps wire events into typed SessionEvent shape', async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        events: [
          {
            id: 'e-1',
            timestamp_ms: 1700000000000,
            type: 'slide_advance',
            actor: { type: 'presenter', id: 'p-1', name: 'Ada' },
            summary: 'Advanced to slide 2',
            payload: { slide_index: 1 },
            snapshot: {
              slide_index: 1,
              scenarios_active: ['base'],
              annotations_count: 0,
              polls_count: 0,
              qa_count: 0,
              comments_count: 0,
            },
          },
        ],
      }),
    })) as unknown as typeof fetch;

    const events = await listSessionEvents('sess-1', 'http://tl.test');
    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe('slide_advance');
    expect(events[0]?.actor.name).toBe('Ada');
    expect(events[0]?.snapshot.slide_index).toBe(1);
  });

  it('falls back to seed events when the events endpoint errors', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error('ECONNREFUSED');
    }) as unknown as typeof fetch;

    const events = await listSessionEvents('session-deck-product-launch', 'http://tl.test');
    expect(events.length).toBeGreaterThanOrEqual(15);
    expect(events.length).toBeLessThanOrEqual(30);
    // sorted ascending by timestamp
    for (let i = 1; i < events.length; i++) {
      expect(events[i]!.timestamp_ms).toBeGreaterThanOrEqual(events[i - 1]!.timestamp_ms);
    }
    // session_start should be first
    expect(events[0]?.type).toBe('session_start');
    expect(events[events.length - 1]?.type).toBe('session_end');
  });

  it('computes a structured diff between two snapshots', () => {
    const before: SessionSnapshot = {
      slide_index: 1,
      scenarios_active: ['base', 'bear-case'],
      annotations_count: 1,
      polls_count: 0,
      qa_count: 0,
      comments_count: 0,
    };
    const after: SessionSnapshot = {
      slide_index: 2,
      scenarios_active: ['base'],
      annotations_count: 2,
      polls_count: 1,
      qa_count: 0,
      comments_count: 0,
    };
    const diff = diffSnapshots(before, after);
    const fields = diff.map((c) => c.field);
    expect(fields).toContain('slide_index');
    expect(fields).toContain('scenarios_removed');
    expect(fields).toContain('annotations_count');
    expect(fields).toContain('polls_count');
    const slideChange = diff.find((c) => c.field === 'slide_index');
    expect(slideChange?.before).toBe(1);
    expect(slideChange?.after).toBe(2);
  });

  it('returns an empty diff when snapshots are identical', () => {
    const snap: SessionSnapshot = {
      slide_index: 0,
      scenarios_active: ['base'],
      annotations_count: 0,
      polls_count: 0,
      qa_count: 0,
      comments_count: 0,
    };
    expect(diffSnapshots(snap, snap)).toEqual([]);
  });

  it('computes a diff via diffEvents on the seed data', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error('ECONNREFUSED');
    }) as unknown as typeof fetch;

    const events = await listSessionEvents('session-deck-investor-brief', 'http://tl.test');
    expect(events.length).toBeGreaterThan(2);
    const first = events[0]!;
    const last = events[events.length - 1]!;
    const result = await diffEvents('session-deck-investor-brief', first.id, last.id, 'http://tl.test');
    expect(Array.isArray(result.changes)).toBe(true);
  });

  it('returns an empty diff when one of the event ids is missing', async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ events: [] }),
    })) as unknown as typeof fetch;

    const result = await diffEvents('sess-1', 'missing', 'missing', 'http://tl.test');
    expect(result.changes).toEqual([]);
  });

  it('parses the wire diff response when present', async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/v1/sessions/sess-1/events')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            events: [
              {
                id: 'a',
                timestamp_ms: 1,
                type: 'slide_advance',
                actor: { type: 'presenter', id: 'p', name: 'Ada' },
                summary: 'slide 1',
                payload: {},
                snapshot: {
                  slide_index: 1,
                  scenarios_active: [],
                  annotations_count: 0,
                  polls_count: 0,
                  qa_count: 0,
                  comments_count: 0,
                },
              },
              {
                id: 'b',
                timestamp_ms: 2,
                type: 'slide_advance',
                actor: { type: 'presenter', id: 'p', name: 'Ada' },
                summary: 'slide 2',
                payload: {},
                snapshot: {
                  slide_index: 2,
                  scenarios_active: [],
                  annotations_count: 0,
                  polls_count: 0,
                  qa_count: 0,
                  comments_count: 0,
                },
              },
            ],
          }),
        };
      }
      if (url.includes('/v1/sessions/sess-1/diff')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ changes: [{ field: 'slide_index', before: 1, after: 2 }] }),
        };
      }
      return { ok: true, status: 200, json: async () => ({}) };
    }) as unknown as typeof fetch;

    const result = await diffEvents('sess-1', 'a', 'b', 'http://tl.test');
    expect(result.changes).toHaveLength(1);
    expect(result.changes[0]?.field).toBe('slide_index');
  });

  it('exposes seed sessions with presenter and deck metadata', () => {
    const seeds = listSeedSessions();
    expect(seeds.length).toBeGreaterThanOrEqual(3);
    for (const s of seeds) {
      expect(s.deck_id).toMatch(/^deck-/);
      expect(s.presenter_name).not.toBe('');
      expect(s.started_at_ms).toBeGreaterThan(0);
    }
  });
});
