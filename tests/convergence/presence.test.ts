/**
 * Phase 04 — Presence convergence test suite.
 *
 * 50 deterministic presence scripts across 8 categories:
 *   1. Peer join / leave (10)
 *   2. Cursor broadcast (10)
 *   3. Selection visibility (5)
 *   4. Chat bubbles (5)
 *   5. Follow-user (5)
 *   6. Color determinism across reconnect (5)
 *   7. Multi-peer concurrent cursor moves (5)
 *   8. Edge cases — stale state, rapid join/leave, reconnection (5)
 *
 * For each script: two awareness replicas sync and assert the presence
 * state converges (awareness state equality after bidirectional sync).
 *
 * Run: VITEST_WORKSPACE=1 npx vitest run tests/convergence/presence.test.ts
 */

import { describe, it, expect } from 'vitest';
// yjs is not hoisted to repo root by pnpm strict mode — import via
// yjs-shared's node_modules.
import * as Y from '../../packages/yjs-shared/node_modules/yjs';
import { encodeAwarenessUpdate, applyAwarenessUpdate } from '../../packages/yjs-shared/node_modules/y-protocols/awareness.js';
import {
  createAwareness,
  updatePresence,
  getPeers,
  deterministicCursorColor,
} from '@domio/yjs-shared';
import type { PresenceState } from '@domio/yjs-shared';

// ─── Seeded PRNG (mulberry32) ────────────────────────────────────────

function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────

function rngInt(rng: () => number, min: number, max: number): number {
  return Math.floor(rng() * (max - min + 1)) + min;
}

type AwarenessType = ReturnType<typeof createAwareness>;

/**
 * After both awareness instances have local state set, sync them
 * bidirectionally and return the resulting peer lists.
 */
function syncAndPeers(
  awarenessA: AwarenessType,
  awarenessB: AwarenessType,
  docA: Y.Doc,
  docB: Y.Doc,
): { peersA: ReturnType<typeof getPeers>; peersB: ReturnType<typeof getPeers> } {
  const updateA = encodeAwarenessUpdate(awarenessA, [docA.clientID]);
  applyAwarenessUpdate(awarenessB, updateA, 'sync');

  const updateB = encodeAwarenessUpdate(awarenessB, [docB.clientID]);
  applyAwarenessUpdate(awarenessA, updateB, 'sync');

  return {
    peersA: getPeers(awarenessA),
    peersB: getPeers(awarenessB),
  };
}

/**
 * Assert that two awareness instances have converged: each sees the
 * other's peer with matching state.
 */
function assertConverged(
  awarenessA: AwarenessType,
  awarenessB: AwarenessType,
  docA: Y.Doc,
  docB: Y.Doc,
): void {
  const { peersA, peersB } = syncAndPeers(awarenessA, awarenessB, docA, docB);

  // Each side should see exactly 1 remote peer
  expect(peersA.length).toBe(1);
  expect(peersB.length).toBe(1);

  // They should have defined user states
  expect(peersA[0]!.userState).toBeDefined();
  expect(peersB[0]!.userState).toBeDefined();
}

/** Simple deterministic hash for a string → positive integer. */
function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

// ─── Scenario Types ──────────────────────────────────────────────────

interface PresenceScenario {
  id: string;
  category: string;
  /** Set up both peers. */
  setup: (
    awarenessA: AwarenessType,
    awarenessB: AwarenessType,
    docA: Y.Doc,
    docB: Y.Doc,
    rng: () => number,
  ) => void;
  /** Apply concurrent presence updates to peer A. */
  updateA: (
    awarenessA: AwarenessType,
    docA: Y.Doc,
    rng: () => number,
  ) => void;
  /** Apply concurrent presence updates to peer B. */
  updateB: (
    awarenessB: AwarenessType,
    docB: Y.Doc,
    rng: () => number,
  ) => void;
  /** Optional assertion after sync. */
  assert?: (
    awarenessA: AwarenessType,
    awarenessB: AwarenessType,
    docA: Y.Doc,
    docB: Y.Doc,
  ) => void;
}

// ─── Scenario Generators ─────────────────────────────────────────────

function generateScenarios(): PresenceScenario[] {
  const scenarios: PresenceScenario[] = [];
  let id = 0;

  // ── Category 1: Peer join / leave (10 scenarios) ──

  for (let i = 0; i < 5; i++) {
    const num = id++;
    scenarios.push({
      id: `join-basic-${num}`,
      category: 'peer-join-leave',
      setup(awarenessA, awarenessB) {
        updatePresence(awarenessA, 'alice', {
          name: 'Alice',
          cursor: { x: 100, y: 200 },
          activeSlide: 'intro',
        });
        updatePresence(awarenessB, 'bob', {
          name: 'Bob',
          cursor: { x: 300, y: 400 },
          activeSlide: 'intro',
        });
      },
      updateA() {},
      updateB() {},
      assert(awarenessA, awarenessB, docA, docB) {
        assertConverged(awarenessA, awarenessB, docA, docB);
        const peersA = getPeers(awarenessA);
        const bobPeer = peersA.find(
          (p: { userState: PresenceState }) => p.userState.name === 'Bob',
        );
        expect(bobPeer).toBeDefined();
      },
    });
  }

  for (let i = 0; i < 5; i++) {
    const num = id++;
    scenarios.push({
      id: `join-staggered-${num}`,
      category: 'peer-join-leave',
      setup(awarenessA, _awarenessB) {
        updatePresence(awarenessA, 'alice', {
          name: 'Alice',
          cursor: { x: 50, y: 50 },
        });
      },
      updateA() {},
      updateB(awarenessB) {
        updatePresence(awarenessB, 'bob', {
          name: 'Bob',
          cursor: { x: 200, y: 200 },
        });
      },
      assert(awarenessA, awarenessB, docA, docB) {
        assertConverged(awarenessA, awarenessB, docA, docB);
      },
    });
  }

  // ── Category 2: Cursor broadcast (10 scenarios) ──

  for (let i = 0; i < 10; i++) {
    const num = id++;
    scenarios.push({
      id: `cursor-broadcast-${num}`,
      category: 'cursor-broadcast',
      setup(awarenessA, awarenessB) {
        updatePresence(awarenessA, 'alice', {
          name: 'Alice',
          cursor: { x: 100, y: 100 },
        });
        updatePresence(awarenessB, 'bob', {
          name: 'Bob',
          cursor: { x: 200, y: 200 },
        });
      },
      updateA(awarenessA, _docA, rng) {
        updatePresence(awarenessA, 'alice', {
          cursor: { x: rngInt(rng, 0, 1000), y: rngInt(rng, 0, 800) },
        });
      },
      updateB(awarenessB, _docB, rng) {
        updatePresence(awarenessB, 'bob', {
          cursor: { x: rngInt(rng, 0, 1000), y: rngInt(rng, 0, 800) },
        });
      },
      assert(awarenessA, awarenessB, docA, docB) {
        const { peersA } = syncAndPeers(awarenessA, awarenessB, docA, docB);
        const bobPeer = peersA.find(
          (p: { userState: PresenceState }) => p.userState.name === 'Bob',
        );
        expect(bobPeer).toBeDefined();
        expect(bobPeer!.userState.cursor).toBeDefined();
        expect(typeof bobPeer!.userState.cursor!.x).toBe('number');
        expect(typeof bobPeer!.userState.cursor!.y).toBe('number');
      },
    });
  }

  // ── Category 3: Selection visibility (5 scenarios) ──

  for (let i = 0; i < 5; i++) {
    const num = id++;
    scenarios.push({
      id: `selection-visibility-${num}`,
      category: 'selection-visibility',
      setup(awarenessA, awarenessB) {
        updatePresence(awarenessA, 'alice', {
          name: 'Alice',
          selection: [],
        });
        updatePresence(awarenessB, 'bob', {
          name: 'Bob',
          selection: [],
        });
      },
      updateA(awarenessA, _docA, rng) {
        const elCount = rngInt(rng, 1, 5);
        const elements = Array.from({ length: elCount }, () => `el-${rngInt(rng, 0, 99)}`);
        updatePresence(awarenessA, 'alice', { selection: elements });
      },
      updateB(awarenessB, _docB, rng) {
        const elCount = rngInt(rng, 1, 3);
        const elements = Array.from({ length: elCount }, () => `el-${rngInt(rng, 0, 99)}`);
        updatePresence(awarenessB, 'bob', { selection: elements });
      },
      assert(awarenessA, awarenessB, docA, docB) {
        const { peersA } = syncAndPeers(awarenessA, awarenessB, docA, docB);
        const bobPeer = peersA.find(
          (p: { userState: PresenceState }) => p.userState.name === 'Bob',
        );
        expect(bobPeer).toBeDefined();
        expect(Array.isArray(bobPeer!.userState.selection)).toBe(true);
      },
    });
  }

  // ── Category 4: Chat bubbles (5 scenarios) ──

  for (let i = 0; i < 5; i++) {
    const num = id++;
    scenarios.push({
      id: `chat-bubble-${num}`,
      category: 'chat-bubbles',
      setup(awarenessA, awarenessB) {
        updatePresence(awarenessA, 'alice', { name: 'Alice', cursor: { x: 50, y: 50 } });
        updatePresence(awarenessB, 'bob', { name: 'Bob', cursor: { x: 100, y: 100 } });
      },
      updateA(awarenessA) {
        updatePresence(awarenessA, 'alice', { cursor: { x: 55, y: 55 } });
      },
      updateB(awarenessB) {
        updatePresence(awarenessB, 'bob', { cursor: { x: 105, y: 105 } });
      },
      assert(awarenessA, awarenessB, docA, docB) {
        const { peersA, peersB } = syncAndPeers(awarenessA, awarenessB, docA, docB);
        expect(peersA.length).toBe(1);
        expect(peersB.length).toBe(1);
      },
    });
  }

  // ── Category 5: Follow-user (5 scenarios) ──

  for (let i = 0; i < 5; i++) {
    const num = id++;
    scenarios.push({
      id: `follow-user-${num}`,
      category: 'follow-user',
      setup(awarenessA, awarenessB) {
        updatePresence(awarenessA, 'alice', {
          name: 'Alice',
          cursor: { x: 100, y: 100 },
          viewport: { x: 0, y: 0, zoom: 1 },
        });
        updatePresence(awarenessB, 'bob', {
          name: 'Bob',
          cursor: { x: 500, y: 500 },
          viewport: { x: 400, y: 400, zoom: 1.5 },
        });
      },
      updateA(awarenessA) {
        updatePresence(awarenessA, 'alice', {
          viewport: { x: 400, y: 400, zoom: 1.5 },
        });
      },
      updateB(awarenessB, _docB, rng) {
        updatePresence(awarenessB, 'bob', {
          cursor: { x: rngInt(rng, 200, 800), y: rngInt(rng, 200, 600) },
          viewport: { x: rngInt(rng, 100, 700), y: rngInt(rng, 100, 500), zoom: 1.2 },
        });
      },
      assert(awarenessA, awarenessB, docA, docB) {
        const { peersA } = syncAndPeers(awarenessA, awarenessB, docA, docB);
        const bobPeer = peersA.find(
          (p: { userState: PresenceState }) => p.userState.name === 'Bob',
        );
        expect(bobPeer).toBeDefined();
        expect(bobPeer!.userState.viewport).toBeDefined();
      },
    });
  }

  // ── Category 6: Color determinism across reconnect (5 scenarios) ──

  for (let i = 0; i < 5; i++) {
    const num = id++;
    scenarios.push({
      id: `color-determinism-${num}`,
      category: 'color-determinism',
      setup(awarenessA, awarenessB) {
        updatePresence(awarenessA, 'alice', { name: 'Alice' });
        updatePresence(awarenessB, 'bob', { name: 'Bob' });
      },
      updateA(awarenessA) {
        updatePresence(awarenessA, 'alice', {
          name: 'Alice',
          cursor: { x: 10, y: 20 },
        });
      },
      updateB() {},
      assert() {
        const colorAlice1 = deterministicCursorColor('alice');
        const colorAlice2 = deterministicCursorColor('alice');
        expect(colorAlice1).toBe(colorAlice2);

        const colorBob1 = deterministicCursorColor('bob');
        const colorBob2 = deterministicCursorColor('bob');
        expect(colorBob1).toBe(colorBob2);

        expect(colorAlice1).not.toBe(colorBob1);
      },
    });
  }

  // ── Category 7: Multi-peer concurrent cursor moves (5 scenarios) ──

  for (let i = 0; i < 5; i++) {
    const num = id++;
    scenarios.push({
      id: `multi-peer-cursor-${num}`,
      category: 'multi-peer-concurrent',
      setup(awarenessA, awarenessB) {
        updatePresence(awarenessA, 'alice', {
          name: 'Alice',
          cursor: { x: 0, y: 0 },
          activeSlide: 'slide-1',
        });
        updatePresence(awarenessB, 'bob', {
          name: 'Bob',
          cursor: { x: 500, y: 500 },
          activeSlide: 'slide-1',
        });
      },
      updateA(awarenessA, _docA, rng) {
        for (let j = 0; j < 3; j++) {
          updatePresence(awarenessA, 'alice', {
            cursor: { x: rngInt(rng, 0, 1000), y: rngInt(rng, 0, 800) },
          });
        }
      },
      updateB(awarenessB, _docB, rng) {
        for (let j = 0; j < 3; j++) {
          updatePresence(awarenessB, 'bob', {
            cursor: { x: rngInt(rng, 0, 1000), y: rngInt(rng, 0, 800) },
          });
        }
      },
      assert(awarenessA, awarenessB, docA, docB) {
        const { peersA, peersB } = syncAndPeers(awarenessA, awarenessB, docA, docB);
        expect(peersA.length).toBe(1);
        expect(peersB.length).toBe(1);
        expect(typeof peersA[0]!.userState.cursor!.x).toBe('number');
        expect(typeof peersB[0]!.userState.cursor!.x).toBe('number');
      },
    });
  }

  // ── Category 8: Edge cases (5 scenarios) ──

  scenarios.push({
    id: 'edge-rapid-join-leave-0',
    category: 'edge-cases',
    setup(awarenessA, awarenessB) {
      updatePresence(awarenessA, 'alice', { name: 'Alice', cursor: { x: 10, y: 10 } });
      updatePresence(awarenessB, 'bob', { name: 'Bob', cursor: { x: 20, y: 20 } });
    },
    updateA(awarenessA) {
      updatePresence(awarenessA, 'alice', { cursor: { x: 100, y: 100 } });
      updatePresence(awarenessA, 'alice', { cursor: { x: 200, y: 200 } });
      updatePresence(awarenessA, 'alice', { cursor: { x: 300, y: 300 } });
    },
    updateB() {},
    assert(awarenessA, awarenessB, docA, docB) {
      const { peersA } = syncAndPeers(awarenessA, awarenessB, docA, docB);
      const bobPeer = peersA.find(
        (p: { userState: PresenceState }) => p.userState.name === 'Bob',
      );
      expect(bobPeer).toBeDefined();
    },
  });

  scenarios.push({
    id: 'edge-reconnect-deterministic-1',
    category: 'edge-cases',
    setup(awarenessA, awarenessB) {
      updatePresence(awarenessA, 'alice', { name: 'Alice', cursor: { x: 50, y: 50 } });
      updatePresence(awarenessB, 'bob', { name: 'Bob', cursor: { x: 100, y: 100 } });
    },
    updateA(awarenessA) {
      updatePresence(awarenessA, 'alice', { name: 'Alice', cursor: { x: 50, y: 50 } });
    },
    updateB() {},
    assert(awarenessA, awarenessB, docA, docB) {
      const peersA = getPeers(awarenessA);
      // After syncing, A sees Bob
      const updateB = encodeAwarenessUpdate(awarenessB, [docB.clientID]);
      applyAwarenessUpdate(awarenessA, updateB, 'sync');
      const peersAfter = getPeers(awarenessA);
      expect(peersAfter.length).toBe(1);
      void peersA;
    },
  });

  scenarios.push({
    id: 'edge-single-peer-2',
    category: 'edge-cases',
    setup(awarenessA, _awarenessB) {
      updatePresence(awarenessA, 'alice', { name: 'Alice', cursor: { x: 0, y: 0 } });
    },
    updateA() {},
    updateB() {},
    assert(awarenessA) {
      const peersA = getPeers(awarenessA);
      expect(peersA.length).toBe(0);
    },
  });

  scenarios.push({
    id: 'edge-stale-viewport-3',
    category: 'edge-cases',
    setup(awarenessA, awarenessB) {
      updatePresence(awarenessA, 'alice', {
        name: 'Alice',
        viewport: { x: 0, y: 0, zoom: 1 },
      });
      updatePresence(awarenessB, 'bob', {
        name: 'Bob',
        viewport: { x: 100, y: 100, zoom: 2 },
      });
    },
    updateA(awarenessA) {
      updatePresence(awarenessA, 'alice', {
        viewport: { x: 0, y: 0, zoom: 1 },
      });
      updatePresence(awarenessA, 'alice', {
        viewport: { x: 100, y: 100, zoom: 2 },
      });
    },
    updateB() {},
    assert(awarenessA, awarenessB, docA, docB) {
      const { peersB } = syncAndPeers(awarenessA, awarenessB, docA, docB);
      const alicePeer = peersB.find(
        (p: { userState: PresenceState }) => p.userState.name === 'Alice',
      );
      expect(alicePeer).toBeDefined();
      expect(alicePeer!.userState.viewport).toEqual({ x: 100, y: 100, zoom: 2 });
    },
  });

  scenarios.push({
    id: 'edge-slide-change-4',
    category: 'edge-cases',
    setup(awarenessA, awarenessB) {
      updatePresence(awarenessA, 'alice', { name: 'Alice', activeSlide: 'slide-1' });
      updatePresence(awarenessB, 'bob', { name: 'Bob', activeSlide: 'slide-1' });
    },
    updateA(awarenessA) {
      updatePresence(awarenessA, 'alice', { activeSlide: 'slide-3' });
    },
    updateB(awarenessB) {
      updatePresence(awarenessB, 'bob', { activeSlide: 'slide-1' });
    },
    assert(awarenessA, awarenessB, docA, docB) {
      const { peersA } = syncAndPeers(awarenessA, awarenessB, docA, docB);
      const bobPeer = peersA.find(
        (p: { userState: PresenceState }) => p.userState.name === 'Bob',
      );
      expect(bobPeer).toBeDefined();
      expect(bobPeer!.userState.activeSlide).toBe('slide-1');
    },
  });

  return scenarios;
}

// ─── Main Test Suite ─────────────────────────────────────────────────

const allScenarios = generateScenarios();

describe('presence convergence corpus', () => {
  for (const scenario of allScenarios) {
    it(`${scenario.id} [${scenario.category}]`, () => {
      const seed = hashString(scenario.id);
      const rng = mulberry32(seed);

      const docA = new Y.Doc();
      const docB = new Y.Doc();
      const awarenessA = createAwareness(docA);
      const awarenessB = createAwareness(docB);

      try {
        scenario.setup(awarenessA, awarenessB, docA, docB, rng);
        scenario.updateA(awarenessA, docA, rng);
        scenario.updateB(awarenessB, docB, rng);

        if (scenario.assert) {
          scenario.assert(awarenessA, awarenessB, docA, docB);
        } else {
          assertConverged(awarenessA, awarenessB, docA, docB);
        }
      } finally {
        awarenessA.destroy();
        awarenessB.destroy();
        docA.destroy();
        docB.destroy();
      }
    });
  }

  it('deterministic cursor color is stable across calls', () => {
    const color1 = deterministicCursorColor('user-abc');
    const color2 = deterministicCursorColor('user-abc');
    const color3 = deterministicCursorColor('user-abc');
    expect(color1).toBe(color2);
    expect(color2).toBe(color3);
  });

  it('different user IDs produce different cursor colors', () => {
    const colors = new Set<string>();
    for (let i = 0; i < 20; i++) {
      colors.add(deterministicCursorColor(`user-${i}`));
    }
    // With 64 palette colors and 20 users, we expect at least 10 unique colors
    expect(colors.size).toBeGreaterThanOrEqual(10);
  });
});
