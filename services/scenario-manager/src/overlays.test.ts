/**
 * Overlay tests — merge order parent→child, child wins, diff correctness.
 */

import { describe, it, expect } from 'vitest';
import { applyOverlays, diff } from './overlays.js';
import type { OverlayRecord, ScenarioRecord } from './dal.js';
import type { OverlayState } from './overlays.js';

const TENANT = 't1';

function scenario(id: string, parentId: string | null = null): ScenarioRecord {
  return {
    id,
    tenantId: TENANT,
    deckId: 'deck-1',
    parentId,
    name: id,
    description: '',
    createdAt: new Date(),
  };
}

function overlay(
  scenarioId: string,
  opts: Partial<Omit<OverlayRecord, 'id' | 'scenarioId' | 'tenantId'>> = {},
): OverlayRecord {
  return {
    id: `ov_${scenarioId}`,
    scenarioId,
    tenantId: TENANT,
    datasetSnapshotRefs: opts.datasetSnapshotRefs ?? [],
    formulaConstantOverrides: opts.formulaConstantOverrides ?? new Map(),
    sliderValueOverrides: opts.sliderValueOverrides ?? new Map(),
    annotationOverrides: opts.annotationOverrides ?? new Map(),
  };
}

// ---------------------------------------------------------------------------
// Merge order
// ---------------------------------------------------------------------------

describe('applyOverlays — merge order', () => {
  it('applies parent first, child wins', () => {
    const root = scenario('root', null);
    const child = scenario('child', 'root');
    const allScenarios = [root, child];

    const overlayMap = new Map<string, OverlayRecord>();
    overlayMap.set(
      'root',
      overlay('root', {
        formulaConstantOverrides: new Map([['interest_rate', 5]]),
        sliderValueOverrides: new Map([['growth', 3]]),
      }),
    );
    overlayMap.set(
      'child',
      overlay('child', {
        formulaConstantOverrides: new Map([['interest_rate', 7]]),
        annotationOverrides: new Map([['note', 'child override']]),
      }),
    );

    const result = applyOverlays(child, overlayMap, allScenarios);
    // Child's interest_rate (7) should win over parent's (5)
    expect(result.formulaConstantOverrides.get('interest_rate')).toBe(7);
    // Parent's growth is inherited
    expect(result.sliderValueOverrides.get('growth')).toBe(3);
    // Child's annotation is present
    expect(result.annotationOverrides.get('note')).toBe('child override');
  });

  it('three-level chain: grandchild wins on conflict', () => {
    const root = scenario('root', null);
    const mid = scenario('mid', 'root');
    const leaf = scenario('leaf', 'mid');
    const allScenarios = [root, mid, leaf];

    const overlayMap = new Map<string, OverlayRecord>();
    overlayMap.set(
      'root',
      overlay('root', {
        formulaConstantOverrides: new Map([
          ['x', 1],
          ['y', 10],
        ]),
      }),
    );
    overlayMap.set(
      'mid',
      overlay('mid', {
        formulaConstantOverrides: new Map([['x', 2]]),
      }),
    );
    overlayMap.set(
      'leaf',
      overlay('leaf', {
        formulaConstantOverrides: new Map([['x', 3]]),
      }),
    );

    const result = applyOverlays(leaf, overlayMap, allScenarios);
    expect(result.formulaConstantOverrides.get('x')).toBe(3);
    expect(result.formulaConstantOverrides.get('y')).toBe(10);
  });

  it('empty overlays produce empty state', () => {
    const root = scenario('root', null);
    const result = applyOverlays(root, new Map(), [root]);
    expect(result.datasetSnapshotRefs).toEqual([]);
    expect(result.formulaConstantOverrides.size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Diff
// ---------------------------------------------------------------------------

describe('diff', () => {
  it('detects added keys', () => {
    const base: OverlayState = {
      datasetSnapshotRefs: [],
      formulaConstantOverrides: new Map(),
      sliderValueOverrides: new Map(),
      annotationOverrides: new Map(),
    };
    const target: OverlayState = {
      datasetSnapshotRefs: ['snap-1'],
      formulaConstantOverrides: new Map([['rate', 5]]),
      sliderValueOverrides: new Map(),
      annotationOverrides: new Map(),
    };
    const d = diff(base, target);
    expect(d.datasetSnapshotRefs.added).toEqual(['snap-1']);
    expect(d.formulaConstantOverrides.added.get('rate')).toBe(5);
  });

  it('detects removed keys', () => {
    const base: OverlayState = {
      datasetSnapshotRefs: ['snap-1'],
      formulaConstantOverrides: new Map([['rate', 5]]),
      sliderValueOverrides: new Map(),
      annotationOverrides: new Map(),
    };
    const target: OverlayState = {
      datasetSnapshotRefs: [],
      formulaConstantOverrides: new Map(),
      sliderValueOverrides: new Map(),
      annotationOverrides: new Map(),
    };
    const d = diff(base, target);
    expect(d.datasetSnapshotRefs.removed).toEqual(['snap-1']);
    expect(d.formulaConstantOverrides.removed.get('rate')).toBe(5);
  });

  it('detects changed values', () => {
    const base: OverlayState = {
      datasetSnapshotRefs: [],
      formulaConstantOverrides: new Map([['rate', 5]]),
      sliderValueOverrides: new Map(),
      annotationOverrides: new Map(),
    };
    const target: OverlayState = {
      datasetSnapshotRefs: [],
      formulaConstantOverrides: new Map([['rate', 10]]),
      sliderValueOverrides: new Map(),
      annotationOverrides: new Map(),
    };
    const d = diff(base, target);
    expect(d.formulaConstantOverrides.changed.get('rate')).toEqual({ old: 5, new: 10 });
  });

  it('returns empty diff for identical states', () => {
    const state: OverlayState = {
      datasetSnapshotRefs: ['snap-1'],
      formulaConstantOverrides: new Map([['rate', 5]]),
      sliderValueOverrides: new Map([['growth', 3]]),
      annotationOverrides: new Map([['note', 'hello']]),
    };
    const d = diff(state, state);
    expect(d.datasetSnapshotRefs.added).toEqual([]);
    expect(d.datasetSnapshotRefs.removed).toEqual([]);
    expect(d.formulaConstantOverrides.added.size).toBe(0);
    expect(d.formulaConstantOverrides.removed.size).toBe(0);
    expect(d.formulaConstantOverrides.changed.size).toBe(0);
  });
});
