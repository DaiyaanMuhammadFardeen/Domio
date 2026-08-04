/**
 * History operations — named, reversible, ULID-stamped. See
 * docs/development_phases/phase-03 §E.1: every operation has forward +
 * inverse; per-op apply/inverse symmetry; opId is a ULID.
 */

import { newToken } from '@domio/common';
import type {
  DeckDocument,
  Element,
  Slide,
  Transform2D,
  ULID,
} from '@domio/schema';

export type HistoryOpName =
  | 'MoveOp'
  | 'ResizeOp'
  | 'RotateOp'
  | 'ReorderOp'
  | 'GroupOp'
  | 'UngroupOp'
  | 'LockOp'
  | 'HideOp'
  | 'AddElementOp'
  | 'RemoveElementOp'
  | 'StyleOp'
  | 'TextEditOp'
  | 'PropEditOp'
  | 'VariantChangeOp'
  | 'CheckpointOp'
  | 'DataBindingOp'
  | 'ThresholdOp'
  | 'FilterOp'
  | 'TimelineOp'
  | 'TransitionOp'
  | 'MagicMoveOp'
  | 'ReducedMotionOp'
  | 'ExportOp';

// ---- P08 live-data types ----

/** Serializable binding descriptor stored in `component.props['x-domio:binding']`. */
export interface LiveDataBinding {
  queryId: string | null;
  fieldMap: Record<string, string>;
  listenToFilters: string[];
}

/** A single threshold rule stored in `component.props['x-domio:thresholds']`. */
export interface ThresholdRule {
  id: string;
  measure: string;
  comparator: 'lt' | 'lte' | 'gt' | 'gte' | 'eq' | 'between' | 'outside';
  values: number[];
  severity: 'info' | 'warn' | 'critical';
  styleOverride: Record<string, unknown>;
}

export interface HistoryOp<T = unknown> {
  readonly id: string;
  readonly name: HistoryOpName;
  readonly timestamp: number;
  readonly forward: T;
  readonly inverse: T;
  readonly authorId?: string | undefined;
  /** Optional thumbnail data URL for the timeline panel. */
  thumbnail?: string | undefined;
  /** Optional cross-deck context — single named entry for batched operations. */
  crossDeck?: boolean | undefined;
}

export function newOpId(): string {
  // 16 bytes → 22-char URL-safe token; ULID-shaped.
  return newToken(16);
}

export interface MoveOpForward {
  moves: Array<{ id: ULID; from: Transform2D; to: Transform2D }>;
}

export function moveOp(moves: MoveOpForward['moves'], timestamp: number, authorId?: string): HistoryOp<MoveOpForward> {
  return {
    id: newOpId(),
    name: 'MoveOp',
    timestamp,
    forward: { moves },
    inverse: {
      moves: moves.map((m) => ({ id: m.id, from: m.to, to: m.from })),
    },
    authorId,
  };
}

export function resizeOp(moves: MoveOpForward['moves'], timestamp: number, authorId?: string): HistoryOp<MoveOpForward> {
  return {
    id: newOpId(),
    name: 'ResizeOp',
    timestamp,
    forward: { moves },
    inverse: { moves: moves.map((m) => ({ id: m.id, from: m.to, to: m.from })) },
    authorId,
  };
}

export function rotateOp(moves: MoveOpForward['moves'], timestamp: number, authorId?: string): HistoryOp<MoveOpForward> {
  return {
    id: newOpId(),
    name: 'RotateOp',
    timestamp,
    forward: { moves },
    inverse: { moves: moves.map((m) => ({ id: m.id, from: m.to, to: m.from })) },
    authorId,
  };
}

export interface ReorderOpForward {
  changes: Array<{ id: ULID; fromZ: number; toZ: number; fromParent: ULID | null; toParent: ULID | null }>;
}

export function reorderOp(
  changes: ReorderOpForward['changes'],
  timestamp: number,
): HistoryOp<ReorderOpForward> {
  return {
    id: newOpId(),
    name: 'ReorderOp',
    timestamp,
    forward: { changes },
    inverse: {
      changes: changes.map((c) => ({
        id: c.id,
        fromZ: c.toZ,
        toZ: c.fromZ,
        fromParent: c.toParent,
        toParent: c.fromParent,
      })),
    },
  };
}

export interface LockHideForward {
  changes: Array<{ id: ULID; flag: 'locked' | 'hidden'; from: boolean; to: boolean }>;
}

export function lockHideOp(
  changes: LockHideForward['changes'],
  timestamp: number,
): HistoryOp<LockHideForward> {
  return {
    id: newOpId(),
    name: changes[0]?.flag === 'locked' ? 'LockOp' : 'HideOp',
    timestamp,
    forward: { changes },
    inverse: {
      changes: changes.map((c) => ({ id: c.id, flag: c.flag, from: c.to, to: c.from })),
    },
  };
}

export interface TextEditForward {
  changes: Array<{ id: ULID; from: string; to: string }>;
}

export function textEditOp(
  changes: TextEditForward['changes'],
  timestamp: number,
): HistoryOp<TextEditForward> {
  return {
    id: newOpId(),
    name: 'TextEditOp',
    timestamp,
    forward: { changes },
    inverse: { changes: changes.map((c) => ({ id: c.id, from: c.to, to: c.from })) },
  };
}

export interface StyleOpForward {
  changes: Array<{ id: ULID; from: unknown; to: unknown }>;
}

export function styleOp(
  changes: StyleOpForward['changes'],
  timestamp: number,
): HistoryOp<StyleOpForward> {
  return {
    id: newOpId(),
    name: 'StyleOp',
    timestamp,
    forward: { changes },
    inverse: { changes: changes.map((c) => ({ id: c.id, from: c.to, to: c.from })) },
  };
}

/**
 * Smart-component prop edit — mutates `element.component.props[key]`.
 * One op per keystroke/commit; inverse restores the previous value.
 */
export interface PropEditForward {
  changes: Array<{ id: ULID; key: string; from: unknown; to: unknown }>;
}

export function propEditOp(
  changes: PropEditForward['changes'],
  timestamp: number,
  authorId?: string,
): HistoryOp<PropEditForward> {
  return {
    id: newOpId(),
    name: 'PropEditOp',
    timestamp,
    forward: { changes },
    inverse: {
      changes: changes.map((c) => ({ id: c.id, key: c.key, from: c.to, to: c.from })),
    },
    authorId,
  };
}

/**
 * Variant switch — emits a single CRDT op (`component.variant_changed`)
 * that sets `element.component.variant`; no new CRDT type (per P06 §4.2.2).
 */
export interface VariantChangeForward {
  changes: Array<{ id: ULID; from: string; to: string }>;
}

export function variantChangeOp(
  changes: VariantChangeForward['changes'],
  timestamp: number,
  authorId?: string,
): HistoryOp<VariantChangeForward> {
  return {
    id: newOpId(),
    name: 'VariantChangeOp',
    timestamp,
    forward: { changes },
    inverse: { changes: changes.map((c) => ({ id: c.id, from: c.to, to: c.from })) },
    authorId,
  };
}

/**
 * DataBindingOp — binds/rebinds/clears a live-data binding on a ComponentLayer.
 * Stores the previous binding for precise revert.
 */
export interface DataBindingForward {
  layerId: string;
  /** The new binding to apply. `null` unbinds (deletes the prop key). */
  binding: LiveDataBinding | null;
  /** Snapshot of the previous value for revert (deep-cloned at op creation). */
  previousBinding: unknown;
}

/**
 * ThresholdOp — sets threshold rules on a ComponentLayer.
 */
export interface ThresholdForward {
  layerId: string;
  /** The new rules to apply. */
  rules: ThresholdRule[];
  /** Snapshot of the previous value for revert (deep-cloned at op creation). */
  previousRules: unknown;
}

/**
 * FilterOp — stores cross-chart global filters on a ComponentLayer.
 * Each filter = { id, dimension, value } where dimension is a column name.
 */
export interface CrossFilter {
  id: string;
  dimension: string;
  value: string;
}

export interface FilterForward {
  layerId: string;
  /** The new filters to apply. */
  filters: CrossFilter[];
  /** Snapshot of the previous value for revert (deep-cloned at op creation). */
  previousFilters: unknown;
}

/**
 * Deep-clone a JSON-serialisable value (or return `null`/`undefined` as-is).
 */
function deepClone<T>(value: T): T {
  if (value === null || value === undefined) return value;
  return JSON.parse(JSON.stringify(value)) as T;
}

export function dataBindingOp(
  layerId: string,
  binding: LiveDataBinding | null,
  previousBinding: unknown,
  timestamp: number,
  authorId?: string,
): HistoryOp<DataBindingForward> {
  return {
    id: newOpId(),
    name: 'DataBindingOp',
    timestamp,
    forward: { layerId, binding: deepClone(binding), previousBinding: deepClone(previousBinding) },
    inverse: { layerId, binding: previousBinding as LiveDataBinding | null, previousBinding: binding },
    authorId,
  };
}

export function thresholdOp(
  layerId: string,
  rules: ThresholdRule[],
  previousRules: unknown,
  timestamp: number,
  authorId?: string,
): HistoryOp<ThresholdForward> {
  return {
    id: newOpId(),
    name: 'ThresholdOp',
    timestamp,
    forward: { layerId, rules: deepClone(rules), previousRules: deepClone(previousRules) },
    inverse: { layerId, rules: previousRules as ThresholdRule[], previousRules: rules },
    authorId,
  };
}

export function filterOp(
  layerId: string,
  filters: CrossFilter[],
  previousFilters: unknown,
  timestamp: number,
  authorId?: string,
): HistoryOp<FilterForward> {
  return {
    id: newOpId(),
    name: 'FilterOp',
    timestamp,
    forward: { layerId, filters: deepClone(filters), previousFilters: deepClone(previousFilters) },
    inverse: { layerId, filters: previousFilters as CrossFilter[], previousFilters: filters },
    authorId,
  };
}

// ---- P09 animation & transition types ----

export interface Keyframe {
  timeMs: number;
  value: unknown;
  easing?: string;
}

export interface TimelineTrack {
  property: string;
  keyframes: Keyframe[];
}

export interface TriggerConfig {
  kind: 'on_click' | 'on_enter' | 'on_hover' | 'on_data_change' | 'on_timer';
  sourceId?: string;
  fieldPath?: string;
  seconds?: number;
  debounceMs?: number;
}

export interface LayerTimeline {
  id: string;
  durationMs: number;
  loop: boolean;
  playCount: number | null;
  startOffsetMs: number;
  trigger?: TriggerConfig;
  tracks: TimelineTrack[];
}

export interface SlideTransition {
  kind: 'fade' | 'slide' | 'wipe' | 'zoom' | 'flip' | 'bubble' | 'cube' | 'shutter';
  durationMs: number;
  easing?: string;
  direction?: string;
}

export type ReducedMotionPolicy = 'follow_os' | 'always_reduced' | 'always_full';

export interface TimelineForward {
  layerId: string;
  timeline: LayerTimeline | null;
  previousTimeline: unknown;
}

export interface TransitionForward {
  slideId: string;
  transition: SlideTransition | null;
  previousTransition: unknown;
}

export interface MagicMoveForward {
  layerId: string;
  role: string | null;
  previousRole: unknown;
}

export interface ReducedMotionForward {
  policy: ReducedMotionPolicy | null;
  previousPolicy: unknown;
}

export function timelineOp(
  layerId: string,
  timeline: LayerTimeline | null,
  previousTimeline: unknown,
  timestamp: number,
  authorId?: string,
): HistoryOp<TimelineForward> {
  return {
    id: newOpId(),
    name: 'TimelineOp',
    timestamp,
    forward: { layerId, timeline: deepClone(timeline), previousTimeline: deepClone(previousTimeline) },
    inverse: { layerId, timeline: previousTimeline as LayerTimeline | null, previousTimeline: timeline },
    authorId,
  };
}

export function transitionOp(
  slideId: string,
  transition: SlideTransition | null,
  previousTransition: unknown,
  timestamp: number,
  authorId?: string,
): HistoryOp<TransitionForward> {
  return {
    id: newOpId(),
    name: 'TransitionOp',
    timestamp,
    forward: { slideId, transition: deepClone(transition), previousTransition: deepClone(previousTransition) },
    inverse: { slideId, transition: previousTransition as SlideTransition | null, previousTransition: transition },
    authorId,
  };
}

export function magicMoveOp(
  layerId: string,
  role: string | null,
  previousRole: unknown,
  timestamp: number,
  authorId?: string,
): HistoryOp<MagicMoveForward> {
  return {
    id: newOpId(),
    name: 'MagicMoveOp',
    timestamp,
    forward: { layerId, role, previousRole: deepClone(previousRole) },
    inverse: { layerId, role: previousRole as string | null, previousRole: role },
    authorId,
  };
}

export function reducedMotionOp(
  policy: ReducedMotionPolicy | null,
  previousPolicy: unknown,
  timestamp: number,
  authorId?: string,
): HistoryOp<ReducedMotionForward> {
  return {
    id: newOpId(),
    name: 'ReducedMotionOp',
    timestamp,
    forward: { policy, previousPolicy: deepClone(previousPolicy) },
    inverse: { policy: previousPolicy as ReducedMotionPolicy | null, previousPolicy: policy },
    authorId,
  };
}

export interface AddRemoveForward {
  added: Element[];
  removed: Element[];
  slideId: ULID;
}

export function addElementOp(added: Element[], slideId: ULID, timestamp: number): HistoryOp<AddRemoveForward> {
  return {
    id: newOpId(),
    name: 'AddElementOp',
    timestamp,
    forward: { added, removed: [], slideId },
    inverse: { added: [], removed: added, slideId },
  };
}

export function removeElementOp(removed: Element[], slideId: ULID, timestamp: number): HistoryOp<AddRemoveForward> {
  return {
    id: newOpId(),
    name: 'RemoveElementOp',
    timestamp,
    forward: { added: [], removed, slideId },
    inverse: { added: removed, removed: [], slideId },
  };
}

/**
 * Apply an op to a deck document. Pure function; no mutation of the input.
 */
export function applyOp(doc: DeckDocument, op: HistoryOp): DeckDocument {
  switch (op.name) {
    case 'MoveOp':
    case 'ResizeOp':
    case 'RotateOp':
      return applyTransforms(doc, op.forward as MoveOpForward);
    case 'ReorderOp':
      return applyReorder(doc, op.forward as ReorderOpForward);
    case 'LockOp':
    case 'HideOp':
      return applyLockHide(doc, op.forward as LockHideForward);
    case 'TextEditOp':
      return applyTextEdit(doc, op.forward as TextEditForward);
    case 'StyleOp':
      return applyStyle(doc, op.forward as StyleOpForward);
    case 'PropEditOp':
      return applyPropEdit(doc, op.forward as PropEditForward);
    case 'VariantChangeOp':
      return applyVariantChange(doc, op.forward as VariantChangeForward);
    case 'DataBindingOp':
      return applyDataBinding(doc, op.forward as DataBindingForward);
    case 'ThresholdOp':
      return applyThreshold(doc, op.forward as ThresholdForward);
    case 'FilterOp':
      return applyFilter(doc, op.forward as FilterForward);
    case 'TimelineOp':
      return applyTimeline(doc, op.forward as TimelineForward);
    case 'TransitionOp':
      return applyTransition(doc, op.forward as TransitionForward);
    case 'MagicMoveOp':
      return applyMagicMove(doc, op.forward as MagicMoveForward);
    case 'ReducedMotionOp':
      return applyReducedMotion(doc, op.forward as ReducedMotionForward);
    case 'AddElementOp':
    case 'RemoveElementOp':
      return applyAddRemove(doc, op.forward as AddRemoveForward);
    case 'GroupOp':
    case 'UngroupOp':
    case 'CheckpointOp':
      return doc;
    default:
      return doc;
  }
}

function applyTransforms(doc: DeckDocument, payload: MoveOpForward): DeckDocument {
  return mapElements(doc, (element) => {
    const move = payload.moves.find((m) => m.id === element.id);
    if (!move) return element;
    if (!element.transform) return element;
    return { ...element, transform: move.to };
  });
}

function applyReorder(doc: DeckDocument, payload: ReorderOpForward): DeckDocument {
  return mapElements(doc, (element) => {
    const change = payload.changes.find((c) => c.id === element.id);
    if (!change) return element;
    return { ...element, z: change.toZ, parentId: change.toParent };
  });
}

function applyLockHide(doc: DeckDocument, payload: LockHideForward): DeckDocument {
  return mapElements(doc, (element) => {
    const change = payload.changes.find((c) => c.id === element.id);
    if (!change) return element;
    return { ...element, [change.flag]: change.to };
  });
}

function applyTextEdit(doc: DeckDocument, payload: TextEditForward): DeckDocument {
  return mapElements(doc, (element) => {
    if (element.type !== 'text') return element;
    const change = payload.changes.find((c) => c.id === element.id);
    if (!change) return element;
    return { ...element, text: { ...element.text, content: change.to } };
  });
}

function applyStyle(doc: DeckDocument, payload: StyleOpForward): DeckDocument {
  return mapElements(doc, (element) => {
    const change = payload.changes.find((c) => c.id === element.id);
    if (!change) return element;
    return { ...element, style: { ...(element.style ?? {}), ...(change.to as Record<string, unknown>) } };
  });
}

function applyPropEdit(doc: DeckDocument, payload: PropEditForward): DeckDocument {
  return mapElements(doc, (element) => {
    if (element.type !== 'component') return element;
    const change = payload.changes.find((c) => c.id === element.id);
    if (!change) return element;
    const props = { ...(element.component.props ?? {}) };
    props[change.key] = change.to;
    return { ...element, component: { ...element.component, props } };
  });
}

function applyVariantChange(doc: DeckDocument, payload: VariantChangeForward): DeckDocument {
  return mapElements(doc, (element) => {
    if (element.type !== 'component') return element;
    const change = payload.changes.find((c) => c.id === element.id);
    if (!change) return element;
    return { ...element, component: { ...element.component, variant: change.to } };
  });
}

function applyDataBinding(doc: DeckDocument, payload: DataBindingForward): DeckDocument {
  return mapElements(doc, (element) => {
    if (element.type !== 'component') return element;
    if (element.id !== payload.layerId) return element;
    const props = { ...(element.component.props ?? {}) };
    if (payload.binding === null) {
      delete props['x-domio:binding'];
    } else {
      props['x-domio:binding'] = deepClone(payload.binding);
    }
    return { ...element, component: { ...element.component, props } };
  });
}

function applyThreshold(doc: DeckDocument, payload: ThresholdForward): DeckDocument {
  return mapElements(doc, (element) => {
    if (element.type !== 'component') return element;
    if (element.id !== payload.layerId) return element;
    const props = { ...(element.component.props ?? {}) };
    props['x-domio:thresholds'] = deepClone(payload.rules);
    return { ...element, component: { ...element.component, props } };
  });
}

function applyFilter(doc: DeckDocument, payload: FilterForward): DeckDocument {
  return mapElements(doc, (element) => {
    if (element.type !== 'component') return element;
    if (element.id !== payload.layerId) return element;
    const props = { ...(element.component.props ?? {}) };
    props['x-domio:filters'] = deepClone(payload.filters);
    return { ...element, component: { ...element.component, props } };
  });
}

function applyTimeline(doc: DeckDocument, payload: TimelineForward): DeckDocument {
  return mapElements(doc, (element) => {
    if (element.type !== 'component') return element;
    if (element.id !== payload.layerId) return element;
    const props = { ...(element.component.props ?? {}) };
    if (payload.timeline === null) {
      delete props['x-domio:timeline'];
    } else {
      props['x-domio:timeline'] = deepClone(payload.timeline);
    }
    return { ...element, component: { ...element.component, props } };
  });
}

function applyTransition(doc: DeckDocument, payload: TransitionForward): DeckDocument {
  return {
    ...doc,
    slides: doc.slides.map((slide) => {
      if (slide.id !== payload.slideId) return slide;
      if (payload.transition === null) {
        const prev = deepClone(slide) as unknown as Record<string, unknown>;
        delete prev['x-domio:transition'];
        return prev as unknown as Slide;
      }
      return { ...slide, 'x-domio:transition': deepClone(payload.transition) } as Slide;
    }),
  };
}

function applyMagicMove(doc: DeckDocument, payload: MagicMoveForward): DeckDocument {
  return mapElements(doc, (element) => {
    if (element.id !== payload.layerId) return element;
    if (payload.role === null) {
      const prev = deepClone(element) as unknown as Record<string, unknown>;
      delete prev['element_role'];
      return prev as unknown as Element;
    }
    return { ...element, element_role: payload.role } as Element;
  });
}

function applyReducedMotion(doc: DeckDocument, payload: ReducedMotionForward): DeckDocument {
  if (payload.policy === null) {
    const prev = deepClone(doc) as unknown as Record<string, unknown>;
    delete prev['x-domio:reduced-motion'];
    return prev as unknown as DeckDocument;
  }
  return { ...doc, 'x-domio:reduced-motion': payload.policy } as unknown as DeckDocument;
}

function applyAddRemove(doc: DeckDocument, payload: AddRemoveForward): DeckDocument {
  return {
    ...doc,
    slides: doc.slides.map((slide) => {
      if (slide.id !== payload.slideId) return slide;
      const elements = slide.elements.filter((e) => !payload.removed.some((r) => r.id === e.id));
      return {
        ...slide,
        elements: [...elements, ...payload.added],
      };
    }),
  };
}

function mapElements(doc: DeckDocument, mapper: (element: Element) => Element): DeckDocument {
  return {
    ...doc,
    slides: doc.slides.map((slide) => ({
      ...slide,
      elements: slide.elements.map(mapper),
    })),
  };
}