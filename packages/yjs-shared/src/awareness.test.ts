import { describe, it, expect } from 'vitest';
import * as Y from 'yjs';
import { encodeAwarenessUpdate, applyAwarenessUpdate } from 'y-protocols/awareness';
import {
  CURSOR_PALETTE,
  deterministicCursorColor,
  createCursorColorAllocator,
  cursorColorFor,
  createAwareness,
  updatePresence,
  getPeers,
} from './awareness.js';
import type { PresenceState } from './awareness.js';

describe('deterministicCursorColor', () => {
  it('returns same colour for the same userId', () => {
    const a = deterministicCursorColor('user-42');
    const b = deterministicCursorColor('user-42');
    expect(a).toBe(b);
  });

  it('returns different colours for different userIds (sample)', () => {
    const ids = Array.from({ length: 20 }, (_, i) => `user-${i}`);
    const colours = ids.map((id) => deterministicCursorColor(id));
    // At least some should differ (not all same)
    const unique = new Set(colours);
    expect(unique.size).toBeGreaterThan(1);
  });

  it('colour is always in the palette', () => {
    for (let i = 0; i < 100; i++) {
      const color = deterministicCursorColor(`test-user-${i}`);
      expect(CURSOR_PALETTE).toContain(color);
    }
  });

  it('respects the used set for uniqueness', () => {
    const used = new Set<string>();
    const colors: string[] = [];
    for (let i = 0; i < 64; i++) {
      const c = deterministicCursorColor(`user-${i}`, used);
      colors.push(c);
      used.add(c);
    }
    // All 64 colours should be unique
    expect(new Set(colors).size).toBe(64);
  });

  it('returns base colour when palette is exhausted', () => {
    const all = new Set(CURSOR_PALETTE);
    const c = deterministicCursorColor('overflow-user', all);
    expect(CURSOR_PALETTE).toContain(c);
  });
});

describe('createCursorColorAllocator', () => {
  it('assigns distinct colours to sequential users', () => {
    const allocate = createCursorColorAllocator();
    const colors = Array.from({ length: 10 }, (_, i) => allocate(`user-${i}`));
    expect(new Set(colors).size).toBe(10);
  });

  it('is stable — same user gets same colour', () => {
    const allocate = createCursorColorAllocator();
    const first = allocate('alice');
    const second = allocate('alice');
    expect(first).toBe(second);
  });
});

describe('cursorColorFor', () => {
  it('returns cached colour', () => {
    const a = cursorColorFor('bob');
    const b = cursorColorFor('bob');
    expect(a).toBe(b);
  });
});

describe('awareness helpers', () => {
  it('createAwareness creates an Awareness instance', () => {
    const doc = new Y.Doc();
    const awareness = createAwareness(doc);
    expect(awareness).toBeDefined();
    const state = awareness.getLocalState();
    expect(state).toBeDefined();
    expect(Object.keys(state as Record<string, unknown>)).toHaveLength(0);
    doc.destroy();
  });

  it('updatePresence merges state into local awareness', () => {
    const doc = new Y.Doc();
    const awareness = createAwareness(doc);

    const state: PresenceState = {
      name: 'Alice',
      color: '#E64B35',
      cursor: { x: 100, y: 200 },
      activeSlide: 'intro',
    };
    updatePresence(awareness, 'user-alice', state);

    const local = awareness.getLocalState() as Record<string, unknown>;
    expect(local['name']).toBe('Alice');
    expect(local['color']).toBe('#E64B35');
    expect(local['cursor']).toEqual({ x: 100, y: 200 });
    expect(local['activeSlide']).toBe('intro');
    expect(local['userId']).toBe('user-alice');
    expect(typeof local['lastSeen']).toBe('number');

    doc.destroy();
  });

  it('getPeers returns remote peers only', () => {
    const docA = new Y.Doc();
    const docB = new Y.Doc();
    const a1 = createAwareness(docA);
    const a2 = createAwareness(docB);

    updatePresence(a1, 'alice', { name: 'Alice' });
    updatePresence(a2, 'bob', { name: 'Bob' });

    // Sync A → B
    const update = encodeAwarenessUpdate(a1, [docA.clientID]);
    applyAwarenessUpdate(a2, update, 'sync');

    // Sync B → A
    const updateB = encodeAwarenessUpdate(a2, [docB.clientID]);
    applyAwarenessUpdate(a1, updateB, 'sync');

    // A should see Bob as a peer (not herself)
    const peersA = getPeers(a1);
    expect(peersA.length).toBe(1);
    expect(peersA[0]!.userState.name).toBe('Bob');

    // B should see Alice as a peer
    const peersB = getPeers(a2);
    expect(peersB.length).toBe(1);
    expect(peersB[0]!.userState.name).toBe('Alice');

    a1.destroy();
    a2.destroy();
    docA.destroy();
    docB.destroy();
  });

  it('peer removal is reflected after sync', () => {
    const docA = new Y.Doc();
    const docB = new Y.Doc();
    const a1 = createAwareness(docA);
    const a2 = createAwareness(docB);

    updatePresence(a1, 'alice', { name: 'Alice' });
    const sync1 = encodeAwarenessUpdate(a1, [docA.clientID]);
    applyAwarenessUpdate(a2, sync1, 'sync');

    expect(getPeers(a2).length).toBe(1);

    // Remove Alice's state
    a1.setLocalState(null);
    const sync2 = encodeAwarenessUpdate(a1, [docA.clientID]);
    applyAwarenessUpdate(a2, sync2, 'sync');

    // Bob should no longer see Alice
    expect(getPeers(a2).length).toBe(0);

    a1.destroy();
    a2.destroy();
    docA.destroy();
    docB.destroy();
  });
});
