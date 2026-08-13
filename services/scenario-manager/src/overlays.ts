/**
 * Overlay model — dataset_snapshot_refs, formula_constant_overrides,
 * slider_value_overrides, annotation_overrides.
 *
 * Overlays are merged in ancestor order (parent first, child wins) so
 * that a child scenario can selectively override parent values.
 */

import type { OverlayRecord } from './dal.js';
import type { ScenarioRecord } from './dal.js';
import { ancestors } from './dag.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OverlayState {
  readonly datasetSnapshotRefs: readonly string[];
  readonly formulaConstantOverrides: ReadonlyMap<string, number>;
  readonly sliderValueOverrides: ReadonlyMap<string, number>;
  readonly annotationOverrides: ReadonlyMap<string, string>;
}

export interface OverlayDiff {
  readonly datasetSnapshotRefs: {
    readonly added: readonly string[];
    readonly removed: readonly string[];
  };
  readonly formulaConstantOverrides: {
    readonly added: ReadonlyMap<string, number>;
    readonly removed: ReadonlyMap<string, number>;
    readonly changed: ReadonlyMap<string, { old: number; new: number }>;
  };
  readonly sliderValueOverrides: {
    readonly added: ReadonlyMap<string, number>;
    readonly removed: ReadonlyMap<string, number>;
    readonly changed: ReadonlyMap<string, { old: number; new: number }>;
  };
  readonly annotationOverrides: {
    readonly added: ReadonlyMap<string, string>;
    readonly removed: ReadonlyMap<string, string>;
    readonly changed: ReadonlyMap<string, { old: string; new: string }>;
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function overlayToState(record: OverlayRecord): OverlayState {
  return {
    datasetSnapshotRefs: [...record.datasetSnapshotRefs],
    formulaConstantOverrides: new Map(record.formulaConstantOverrides),
    sliderValueOverrides: new Map(record.sliderValueOverrides),
    annotationOverrides: new Map(record.annotationOverrides),
  };
}

function emptyState(): OverlayState {
  return {
    datasetSnapshotRefs: [],
    formulaConstantOverrides: new Map(),
    sliderValueOverrides: new Map(),
    annotationOverrides: new Map(),
  };
}

function mergeMap<K extends string | number, V>(
  base: ReadonlyMap<K, V>,
  override: ReadonlyMap<K, V>,
): Map<K, V> {
  const result = new Map(base);
  for (const [k, v] of override) {
    result.set(k, v);
  }
  return result;
}

function mergeArray(base: readonly string[], override: readonly string[]): string[] {
  // Override replaces the entire array (not a union).
  if (override.length > 0) return [...override];
  return [...base];
}

function diffMap<K extends string | number>(
  base: ReadonlyMap<K, number | string>,
  target: ReadonlyMap<K, number | string>,
): {
  added: Map<K, number | string>;
  removed: Map<K, number | string>;
  changed: Map<K, { old: number | string; new: number | string }>;
} {
  const added = new Map<K, number | string>();
  const removed = new Map<K, number | string>();
  const changed = new Map<K, { old: number | string; new: number | string }>();

  for (const [k, v] of target) {
    const baseVal = base.get(k);
    if (baseVal === undefined) {
      added.set(k, v);
    } else if (baseVal !== v) {
      changed.set(k, { old: baseVal, new: v });
    }
  }
  for (const [k, v] of base) {
    if (!target.has(k)) {
      removed.set(k, v);
    }
  }
  return { added, removed, changed };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Merge overlays in ancestor order (parent first, child wins).
 *
 * @param scenario  The scenario whose overlays we want to resolve.
 * @param overlayMap  A map from scenarioId → OverlayRecord for all
 *   scenarios in the deck.
 * @param allScenarios  All scenarios in the deck (for ancestor traversal).
 * @returns The merged overlay state.
 */
export function applyOverlays(
  scenario: ScenarioRecord,
  overlayMap: ReadonlyMap<string, OverlayRecord>,
  allScenarios: readonly ScenarioRecord[],
): OverlayState {
  const chain = ancestors(scenario.id, allScenarios);
  // chain[0] = scenario, chain[last] = root. We want parent-first,
  // so reverse the chain.
  const reversed = [...chain].reverse();
  let state = emptyState();
  for (const id of reversed) {
    const overlay = overlayMap.get(id);
    if (overlay) {
      const os = overlayToState(overlay);
      state = {
        datasetSnapshotRefs: mergeArray(state.datasetSnapshotRefs, os.datasetSnapshotRefs),
        formulaConstantOverrides: mergeMap(
          state.formulaConstantOverrides,
          os.formulaConstantOverrides,
        ),
        sliderValueOverrides: mergeMap(state.sliderValueOverrides, os.sliderValueOverrides),
        annotationOverrides: mergeMap(state.annotationOverrides, os.annotationOverrides),
      };
    }
  }
  return state;
}

/**
 * Compute the diff between two overlay states.
 */
export function diff(base: OverlayState, target: OverlayState): OverlayDiff {
  const baseRefSet = new Set(base.datasetSnapshotRefs);
  const targetRefSet = new Set(target.datasetSnapshotRefs);
  const refsDiff = {
    added: target.datasetSnapshotRefs.filter((r) => !baseRefSet.has(r)),
    removed: base.datasetSnapshotRefs.filter((r) => !targetRefSet.has(r)),
  };

  const formulaDiff = diffMap(base.formulaConstantOverrides, target.formulaConstantOverrides);
  const sliderDiff = diffMap(base.sliderValueOverrides, target.sliderValueOverrides);
  const annotationDiff = diffMap(base.annotationOverrides, target.annotationOverrides);

  return {
    datasetSnapshotRefs: refsDiff,
    formulaConstantOverrides: {
      added: new Map(formulaDiff.added as ReadonlyMap<string, number>),
      removed: new Map(formulaDiff.removed as ReadonlyMap<string, number>),
      changed: new Map(formulaDiff.changed as ReadonlyMap<string, { old: number; new: number }>),
    },
    sliderValueOverrides: {
      added: new Map(sliderDiff.added as ReadonlyMap<string, number>),
      removed: new Map(sliderDiff.removed as ReadonlyMap<string, number>),
      changed: new Map(sliderDiff.changed as ReadonlyMap<string, { old: number; new: number }>),
    },
    annotationOverrides: {
      added: new Map(annotationDiff.added as ReadonlyMap<string, string>),
      removed: new Map(annotationDiff.removed as ReadonlyMap<string, string>),
      changed: new Map(annotationDiff.changed as ReadonlyMap<string, { old: string; new: string }>),
    },
  };
}
