/**
 * Convergence guarantee: two Yjs replicas that apply the same set of
 * updates (in either order) must converge to identical state vectors
 * and encoded state.
 *
 * This test exercises:
 *   1. Concurrent text insertions at overlapping positions.
 *   2. Concurrent map-key writes.
 *   3. Bidirectional sync (A→B, B→A).
 */

import { describe, it, expect } from 'vitest';
import * as Y from 'yjs';

describe('CRDT convergence', () => {
  it('two replicas converge after bidirectional sync', () => {
    // --- Replica A ---
    const docA = new Y.Doc();
    const textA = docA.getText('content');
    const mapA = docA.getMap('meta');

    // --- Replica B ---
    const docB = new Y.Doc();
    const textB = docB.getText('content');
    const mapB = docB.getMap('meta');

    // === Concurrent edits ===

    // A inserts at position 0
    textA.insert(0, 'AAA');

    // B inserts at position 0 (concurrent with A)
    textB.insert(0, 'BBB');

    // A sets map key
    mapA.set('title', 'From A');
    mapA.set('author', 'alice');

    // B sets same key to different value + extra key
    mapB.set('title', 'From B');
    mapB.set('version', 2);

    // === Sync ===

    // A → B
    const updateA = Y.encodeStateAsUpdate(docA);
    Y.applyUpdate(docB, updateA);

    // B → A
    const updateB = Y.encodeStateAsUpdate(docB);
    Y.applyUpdate(docA, updateB);

    // === Assert convergence ===

    // State vectors must be equal
    const svA = Y.encodeStateVector(docA);
    const svB = Y.encodeStateVector(docB);
    expect(svA).toEqual(svB);

    // Encoded states must be equal (fully converged)
    const stateA = Y.encodeStateAsUpdate(docA);
    const stateB = Y.encodeStateAsUpdate(docB);
    expect(stateA).toEqual(stateB);

    // Text contains both inserts
    const mergedText = textA.toString();
    expect(mergedText).toContain('AAA');
    expect(mergedText).toContain('BBB');

    // Map has all keys, with last-writer wins on 'title'
    // (the value depends on doc ordering but both must agree)
    expect(mapA.get('title')).toBe(mapB.get('title'));
    expect(mapA.get('author')).toBe('alice');
    expect(mapB.get('author')).toBe('alice');
    expect(mapA.get('version')).toBe(2);
    expect(mapB.get('version')).toBe(2);

    docA.destroy();
    docB.destroy();
  });

  it('three-way convergence: A edits, B edits, C edits, then full sync', () => {
    const docA = new Y.Doc();
    const docB = new Y.Doc();
    const docC = new Y.Doc();

    const textA = docA.getText('doc');
    const textB = docB.getText('doc');
    const textC = docC.getText('doc');

    // Concurrent edits
    textA.insert(0, 'A');
    textB.insert(0, 'B');
    textC.insert(0, 'C');

    // Pairwise sync (arbitrary order)
    Y.applyUpdate(docB, Y.encodeStateAsUpdate(docA));
    Y.applyUpdate(docC, Y.encodeStateAsUpdate(docA));
    Y.applyUpdate(docA, Y.encodeStateAsUpdate(docB));
    Y.applyUpdate(docC, Y.encodeStateAsUpdate(docB));
    Y.applyUpdate(docA, Y.encodeStateAsUpdate(docC));
    Y.applyUpdate(docB, Y.encodeStateAsUpdate(docC));

    // All three must converge
    const svA = Y.encodeStateVector(docA);
    const svB = Y.encodeStateVector(docB);
    const svC = Y.encodeStateVector(docC);
    expect(svA).toEqual(svB);
    expect(svB).toEqual(svC);

    const stateA = Y.encodeStateAsUpdate(docA);
    const stateB = Y.encodeStateAsUpdate(docB);
    const stateC = Y.encodeStateAsUpdate(docC);
    expect(stateA).toEqual(stateB);
    expect(stateB).toEqual(stateC);

    // All three characters present
    const text = textA.toString();
    expect(text).toContain('A');
    expect(text).toContain('B');
    expect(text).toContain('C');

    docA.destroy();
    docB.destroy();
    docC.destroy();
  });

  it('map and text convergence across multiple rounds', () => {
    const docA = new Y.Doc();
    const docB = new Y.Doc();

    // Round 1
    docA.getText('t').insert(0, 'round1-A');
    docB.getText('t').insert(0, 'round1-B');
    Y.applyUpdate(docB, Y.encodeStateAsUpdate(docA));
    Y.applyUpdate(docA, Y.encodeStateAsUpdate(docB));

    expect(Y.encodeStateAsUpdate(docA)).toEqual(Y.encodeStateAsUpdate(docB));

    // Round 2
    docA.getMap('m').set('key', 'value-A');
    docB.getMap('m').set('key', 'value-B');
    docB.getMap('m').set('extra', 42);
    Y.applyUpdate(docA, Y.encodeStateAsUpdate(docB));
    Y.applyUpdate(docB, Y.encodeStateAsUpdate(docA));

    expect(Y.encodeStateAsUpdate(docA)).toEqual(Y.encodeStateAsUpdate(docB));
    expect(docA.getMap('m').get('extra')).toBe(42);

    docA.destroy();
    docB.destroy();
  });
});
