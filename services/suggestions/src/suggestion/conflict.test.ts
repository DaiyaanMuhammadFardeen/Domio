/**
 * Conflict detection — tests (Phase 18 #182).
 */

import { describe, it, expect } from 'vitest';
import { detectOpConflict, markConflictingObsolete } from './conflict.js';
import type { SuggestionOperation } from '../types.js';

function makeOp(overrides: Partial<SuggestionOperation> = {}): SuggestionOperation {
  return {
    type: 'move',
    params: { target_id: 'el-1' },
    before_state: { x: 0, y: 0 },
    after_state: { x: 100, y: 50 },
    ...overrides,
  };
}

describe('detectOpConflict', () => {
  it('detects move vs resize on same element', () => {
    const opA = makeOp({ type: 'move', after_state: { x: 10 } });
    const opB = makeOp({ type: 'resize', after_state: { x: 10 } });
    expect(detectOpConflict(opA, opB)).toBe(true);
  });

  it('detects resize vs move on same element', () => {
    const opA = makeOp({ type: 'resize', after_state: { x: 10 } });
    const opB = makeOp({ type: 'move', after_state: { x: 10 } });
    expect(detectOpConflict(opA, opB)).toBe(true);
  });

  it('detects same type + same key + different value', () => {
    const opA = makeOp({ type: 'move', after_state: { x: 10 } });
    const opB = makeOp({ type: 'move', after_state: { x: 20 } });
    expect(detectOpConflict(opA, opB)).toBe(true);
  });

  it('no conflict when same type + different keys', () => {
    const opA = makeOp({ type: 'move', after_state: { x: 10 } });
    const opB = makeOp({ type: 'move', after_state: { y: 20 } });
    expect(detectOpConflict(opA, opB)).toBe(false);
  });

  it('no conflict when same type + same key + same value', () => {
    const opA = makeOp({ type: 'move', after_state: { x: 10 } });
    const opB = makeOp({ type: 'move', after_state: { x: 10 } });
    expect(detectOpConflict(opA, opB)).toBe(false);
  });

  it('no conflict for different types (non-move/resize)', () => {
    const opA = makeOp({ type: 'restyle', after_state: { color: 'red' } });
    const opB = makeOp({ type: 'restyle', after_state: { color: 'blue' } });
    // Same type, same key (color), different value → conflict
    expect(detectOpConflict(opA, opB)).toBe(true);
  });

  it('no conflict for different types (non-move/resize) with different keys', () => {
    const opA = makeOp({ type: 'restyle', after_state: { color: 'red' } });
    const opB = makeOp({ type: 'content', after_state: { text: 'hello' } });
    expect(detectOpConflict(opA, opB)).toBe(false);
  });

  it('move vs resize with no common keys → no conflict', () => {
    const opA = makeOp({ type: 'move', after_state: { posX: 10 } });
    const opB = makeOp({ type: 'resize', after_state: { width: 200 } });
    expect(detectOpConflict(opA, opB)).toBe(false);
  });
});

describe('markConflictingObsolete', () => {
  it('returns IDs of conflicting suggestions', () => {
    const accepted = makeOp({ type: 'move', after_state: { x: 10 } });
    const others = [
      { id: 's1', operation: makeOp({ type: 'move', after_state: { x: 20 } }) },
      { id: 's2', operation: makeOp({ type: 'move', after_state: { y: 30 } }) },
      { id: 's3', operation: makeOp({ type: 'resize', after_state: { x: 5 } }) },
    ];
    const ids = markConflictingObsolete(accepted, others);
    expect(ids).toContain('s1');
    expect(ids).toContain('s3');
    expect(ids).not.toContain('s2');
  });

  it('returns empty array when no conflicts', () => {
    const accepted = makeOp({ type: 'move', after_state: { x: 10 } });
    const others = [
      { id: 's1', operation: makeOp({ type: 'move', after_state: { y: 30 } }) },
    ];
    const ids = markConflictingObsolete(accepted, others);
    expect(ids).toHaveLength(0);
  });
});
