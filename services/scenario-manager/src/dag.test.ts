/**
 * DAG tests — cycle detection with reachable path, depth cap,
 * ancestor/descendant order.
 */

import { describe, it, expect } from 'vitest';
import {
  validateParent,
  ancestors,
  descendants,
  ScenarioCycleError,
  ScenarioDepthExceededError,
  MAX_DEPTH,
} from './dag.js';
import type { ScenarioRecord } from './dal.js';

const TENANT = 't1';

function scenario(id: string, parentId: string | null = null, deckId = 'deck-1'): ScenarioRecord {
  return {
    id,
    tenantId: TENANT,
    deckId,
    parentId,
    name: id,
    description: '',
    createdAt: new Date(),
  };
}

// ---------------------------------------------------------------------------
// Cycle detection
// ---------------------------------------------------------------------------

describe('validateParent — cycle detection', () => {
  it('allows making a scenario a root (parentId = null)', () => {
    const s = scenario('A', 'B');
    expect(() => validateParent(s, null, [s, scenario('B', null)])).not.toThrow();
  });

  it('rejects self-loop (A → A)', () => {
    const s = scenario('A', null);
    expect(() => validateParent(s, 'A', [s])).toThrow(ScenarioCycleError);
    const err = (() => {
      try {
        validateParent(s, 'A', [s]);
      } catch (e) {
        return e;
      }
    })();
    expect(err).toBeInstanceOf(ScenarioCycleError);
    expect((err as ScenarioCycleError).cyclePath).toEqual(['A', 'A']);
  });

  it('rejects 2-cycle (A → B → A)', () => {
    const a = scenario('A', null);
    const b = scenario('B', 'A');
    expect(() => validateParent(a, 'B', [a, b])).toThrow(ScenarioCycleError);
    const err = (() => {
      try {
        validateParent(a, 'B', [a, b]);
      } catch (e) {
        return e;
      }
    })();
    expect((err as ScenarioCycleError).cyclePath).toEqual(['B', 'A', 'B']);
  });

  it('rejects 3-cycle (A → B → C → A)', () => {
    const a = scenario('A', null);
    const b = scenario('B', 'A');
    const c = scenario('C', 'B');
    expect(() => validateParent(a, 'C', [a, b, c])).toThrow(ScenarioCycleError);
    const err = (() => {
      try {
        validateParent(a, 'C', [a, b, c]);
      } catch (e) {
        return e;
      }
    })();
    expect((err as ScenarioCycleError).cyclePath).toEqual(['C', 'B', 'A', 'C']);
  });

  it('allows valid reparenting', () => {
    const root = scenario('root', null);
    const a = scenario('A', null);
    // A → root is fine (root is at depth 1, A would become depth 2)
    expect(() => validateParent(a, 'root', [root, a])).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Depth cap
// ---------------------------------------------------------------------------

describe('validateParent — depth cap', () => {
  it('allows depth up to MAX_DEPTH', () => {
    const chain: ScenarioRecord[] = [];
    for (let i = 0; i < MAX_DEPTH; i++) {
      chain.push(scenario(`s${i}`, i === 0 ? null : `s${i - 1}`));
    }
    // Adding a leaf at depth MAX_DEPTH+1 should fail
    const leaf = scenario('leaf', null);
    expect(() => validateParent(leaf, `s${MAX_DEPTH - 1}`, chain)).toThrow(
      ScenarioDepthExceededError,
    );
  });

  it('rejects when proposed depth exceeds MAX_DEPTH', () => {
    // Build a chain of MAX_DEPTH
    const chain: ScenarioRecord[] = [];
    for (let i = 0; i < MAX_DEPTH; i++) {
      chain.push(scenario(`d${i}`, i === 0 ? null : `d${i - 1}`));
    }
    const leaf = scenario('leaf', null);
    const err = (() => {
      try {
        validateParent(leaf, `d${MAX_DEPTH - 1}`, chain);
      } catch (e) {
        return e;
      }
    })();
    expect(err).toBeInstanceOf(ScenarioDepthExceededError);
    expect((err as ScenarioDepthExceededError).maxDepth).toBe(MAX_DEPTH);
  });

  it('allows depth below MAX_DEPTH', () => {
    const chain: ScenarioRecord[] = [];
    for (let i = 0; i < 3; i++) {
      chain.push(scenario(`s${i}`, i === 0 ? null : `s${i - 1}`));
    }
    const leaf = scenario('leaf', null);
    expect(() => validateParent(leaf, 's2', chain)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Ancestors
// ---------------------------------------------------------------------------

describe('ancestors', () => {
  it('returns single-element chain for root', () => {
    const s = scenario('root', null);
    expect(ancestors('root', [s])).toEqual(['root']);
  });

  it('returns correct chain order (id first, root last)', () => {
    const root = scenario('root', null);
    const a = scenario('A', 'root');
    const b = scenario('B', 'A');
    expect(ancestors('B', [root, a, b])).toEqual(['B', 'A', 'root']);
  });
});

// ---------------------------------------------------------------------------
// Descendants
// ---------------------------------------------------------------------------

describe('descendants', () => {
  it('returns empty for leaf', () => {
    const s = scenario('leaf', null);
    expect(descendants('leaf', [s])).toEqual([]);
  });

  it('returns BFS-order children before grandchildren', () => {
    const root = scenario('root', null);
    const a = scenario('A', 'root');
    const b = scenario('B', 'root');
    const c = scenario('C', 'A');
    const d = scenario('D', 'B');
    expect(descendants('root', [root, a, b, c, d])).toEqual(['A', 'B', 'C', 'D']);
  });
});
