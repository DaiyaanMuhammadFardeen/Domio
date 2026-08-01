/**
 * History operations — named, reversible, ULID-stamped. See
 * docs/development_phases/phase-03 §E.1: every operation has forward +
 * inverse; per-op apply/inverse symmetry; opId is a ULID.
 */

import { newToken } from '@domio/common';
import type {
  DeckDocument,
  Element,
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
  | 'CheckpointOp';

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
    case 'AddElementOp':
    case 'RemoveElementOp':
      return applyAddRemove(doc, op.forward as AddRemoveForward);
    case 'GroupOp':
    case 'UngroupOp':
    case 'CheckpointOp':
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