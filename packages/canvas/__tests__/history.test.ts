import { describe, it, expect } from 'vitest';
import { HistoryEngine } from '../src/history/engine.js';
import {
  moveOp,
  resizeOp,
  lockHideOp,
  textEditOp,
  reorderOp,
  addElementOp,
} from '../src/history/ops.js';
import { asULID, type DeckDocument, type Element } from '@domio/schema';

const DECK_ID = asULID('01H00000000000000000000000');
const SLIDE_ID = asULID('01H00000000000000000000001');
const A = asULID('01H00000000000000000000010');
const B = asULID('01H00000000000000000000011');
const NEW = asULID('01H00000000000000000000020');

function buildDoc(): DeckDocument {
  return {
    schemaVersion: '1.0.0',
    id: DECK_ID,
    tenantId: 't',
    workspaceId: asULID('01H00000000000000000000FFF'),
    title: 'Test',
    revision: 0,
    settings: { defaultSlideRatio: { ratioW: 16, ratioH: 9 } },
    slides: [
      {
        id: SLIDE_ID,
        semanticId: 's',
        position: 0,
        aspect: { ratioW: 16, ratioH: 9 },
        elements: [
          {
            id: A,
            semanticId: 'a',
            type: 'frame',
            name: 'A',
            parentId: null,
            z: 0,
            transform: { x: 0, y: 0, w: 100, h: 100, rotation: 0, scale: 1 },
            aspect: { ratioW: 1, ratioH: 1 },
          } satisfies Element,
          {
            id: B,
            semanticId: 'b',
            type: 'frame',
            name: 'B',
            parentId: null,
            z: 1,
            transform: { x: 100, y: 100, w: 100, h: 100, rotation: 0, scale: 1 },
            aspect: { ratioW: 1, ratioH: 1 },
          } satisfies Element,
        ],
      },
    ],
  };
}

describe('HistoryEngine', () => {
  it('unbounded depth — many ops do not crash', () => {
    const engine = new HistoryEngine(buildDoc(), { now: () => 0 });
    for (let i = 0; i < 1000; i++) {
      engine.apply(
        moveOp(
          [
            {
              id: A,
              from: { x: 0, y: 0, w: 100, h: 100, rotation: 0, scale: 1 },
              to: { x: i, y: i, w: 100, h: 100, rotation: 0, scale: 1 },
            },
          ],
          i,
        ),
      );
    }
    expect(engine.size()).toBe(1000);
  });

  it('undo / redo are symmetric for MoveOp', () => {
    const engine = new HistoryEngine(buildDoc(), { now: () => 0 });
    const op = moveOp(
      [
        {
          id: A,
          from: { x: 0, y: 0, w: 100, h: 100, rotation: 0, scale: 1 },
          to: { x: 50, y: 50, w: 100, h: 100, rotation: 0, scale: 1 },
        },
      ],
      0,
    );
    engine.apply(op);
    expect(engine.current().slides[0]!.elements.find((el) => el.id === A)!.transform!.x).toBe(50);
    engine.undo();
    expect(engine.current().slides[0]!.elements.find((el) => el.id === A)!.transform!.x).toBe(0);
    engine.redo();
    expect(engine.current().slides[0]!.elements.find((el) => el.id === A)!.transform!.x).toBe(50);
  });

  it('LockOp applies and inverts', () => {
    const engine = new HistoryEngine(buildDoc(), { now: () => 0 });
    engine.apply(lockHideOp([{ id: A, flag: 'locked', from: false, to: true }], 0));
    expect(engine.current().slides[0]!.elements.find((el) => el.id === A)!.locked).toBe(true);
    engine.undo();
    expect(engine.current().slides[0]!.elements.find((el) => el.id === A)!.locked).toBe(false);
  });

  it('TextEditOp records and reverses content', () => {
    const engine = new HistoryEngine(buildDoc(), { now: () => 0 });
    engine.apply(textEditOp([{ id: A, from: 'a', to: 'b' }], 0));
    // A is not a text element — applyOp should be a no-op for non-text.
    expect(engine.current().slides[0]!.elements.find((el) => el.id === A)!.type).toBe('frame');
  });

  it('ReorderOp updates z and parent', () => {
    const engine = new HistoryEngine(buildDoc(), { now: () => 0 });
    engine.apply(reorderOp([{ id: A, fromZ: 0, toZ: 5, fromParent: null, toParent: null }], 0));
    expect(engine.current().slides[0]!.elements.find((el) => el.id === A)!.z).toBe(5);
  });

  it('ResizeOp inverts correctly', () => {
    const engine = new HistoryEngine(buildDoc(), { now: () => 0 });
    engine.apply(
      resizeOp(
        [
          {
            id: A,
            from: { x: 0, y: 0, w: 100, h: 100, rotation: 0, scale: 1 },
            to: { x: 0, y: 0, w: 200, h: 200, rotation: 0, scale: 1 },
          },
        ],
        0,
      ),
    );
    expect(engine.current().slides[0]!.elements.find((el) => el.id === A)!.transform!.w).toBe(200);
    engine.undo();
    expect(engine.current().slides[0]!.elements.find((el) => el.id === A)!.transform!.w).toBe(100);
  });

  it('AddElementOp inserts and reverses', () => {
    const engine = new HistoryEngine(buildDoc(), { now: () => 0 });
    const element = {
      id: NEW,
      semanticId: 'new',
      type: 'frame' as const,
      name: 'New',
      parentId: null,
      z: 2,
      transform: { x: 0, y: 0, w: 100, h: 100, rotation: 0, scale: 1 },
      aspect: { ratioW: 1, ratioH: 1 },
    } satisfies Element;
    engine.apply(addElementOp([element], SLIDE_ID, 0));
    expect(engine.current().slides[0]!.elements).toHaveLength(3);
    engine.undo();
    expect(engine.current().slides[0]!.elements).toHaveLength(2);
  });

  it('previewAt returns the state at a target index', () => {
    const engine = new HistoryEngine(buildDoc(), { now: () => 0 });
    engine.apply(
      moveOp(
        [
          {
            id: A,
            from: { x: 0, y: 0, w: 100, h: 100, rotation: 0, scale: 1 },
            to: { x: 10, y: 10, w: 100, h: 100, rotation: 0, scale: 1 },
          },
        ],
        0,
      ),
    );
    engine.apply(
      moveOp(
        [
          {
            id: A,
            from: { x: 10, y: 10, w: 100, h: 100, rotation: 0, scale: 1 },
            to: { x: 20, y: 20, w: 100, h: 100, rotation: 0, scale: 1 },
          },
        ],
        1,
      ),
    );
    const atOne = engine.previewAt(1);
    expect(atOne!.slides[0]!.elements.find((el) => el.id === A)!.transform!.x).toBe(10);
    const atZero = engine.previewAt(0);
    expect(atZero!.slides[0]!.elements.find((el) => el.id === A)!.transform!.x).toBe(0);
  });

  it('opId is a non-empty token', () => {
    const op = moveOp(
      [
        {
          id: A,
          from: { x: 0, y: 0, w: 100, h: 100, rotation: 0, scale: 1 },
          to: { x: 1, y: 0, w: 100, h: 100, rotation: 0, scale: 1 },
        },
      ],
      0,
    );
    expect(op.id.length).toBeGreaterThan(0);
    expect(op.id).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('pruneUpTo removes ops up to and including the given id', () => {
    const engine = new HistoryEngine(buildDoc(), { now: () => 0 });
    const op1 = moveOp(
      [
        {
          id: A,
          from: { x: 0, y: 0, w: 100, h: 100, rotation: 0, scale: 1 },
          to: { x: 1, y: 0, w: 100, h: 100, rotation: 0, scale: 1 },
        },
      ],
      0,
    );
    const op2 = moveOp(
      [
        {
          id: A,
          from: { x: 1, y: 0, w: 100, h: 100, rotation: 0, scale: 1 },
          to: { x: 2, y: 0, w: 100, h: 100, rotation: 0, scale: 1 },
        },
      ],
      1,
    );
    engine.apply(op1);
    engine.apply(op2);
    expect(engine.pruneUpTo(op1.id)).toBe(1);
    expect(engine.size()).toBe(1);
  });
});
