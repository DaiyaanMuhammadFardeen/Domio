import { describe, it, expect } from 'vitest';
import { StyleClipboardController } from '../src/styles/copy-paste.js';
import { FormatPainter } from '../src/styles/format-painter.js';
import { snapshotStyle, migrateSnapshot, STYLE_FORMAT_VERSION } from '../src/styles/style-snapshot.js';
import { asULID, type DeckDocument, type Element } from '@domio/schema';

const DECK_ID = asULID('01H00000000000000000000000');
const SLIDE_ID = asULID('01H00000000000000000000001');
const A = asULID('01H00000000000000000000010');
const B = asULID('01H00000000000000000000011');

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
            type: 'text',
            name: 'A',
            parentId: null,
            z: 0,
            transform: { x: 0, y: 0, w: 100, h: 50, rotation: 0, scale: 1 },
            text: { content: 'Hello' },
            style: {
              fill: { color: { colorSpace: 'srgb', value: '#ff0000' } },
              fontFamily: 'Inter',
              fontSize: 16,
              fontWeight: 700,
            },
          } satisfies Element,
          {
            id: B,
            semanticId: 'b',
            type: 'text',
            name: 'B',
            parentId: null,
            z: 1,
            transform: { x: 0, y: 100, w: 100, h: 50, rotation: 0, scale: 1 },
            text: { content: 'World' },
            style: {
              fontFamily: 'serif',
            },
          } satisfies Element,
        ],
      },
    ],
  };
}

describe('style copy/paste', () => {
  it('snapshots and pastes a style between elements', () => {
    const doc = buildDoc();
    const controller = new StyleClipboardController();
    controller.copy(doc, A);
    const next = controller.paste(doc, B, { accent: '#60a5fa' });
    const element = next.slides[0]!.elements.find((el) => el.id === B)!;
    const style = element.style as Record<string, unknown>;
    expect(style.fontFamily).toBe('Inter');
    expect(style.fontSize).toBe(16);
    expect(style.fontWeight).toBe(700);
  });

  it('snapshotStyle sets the current format version', () => {
    const doc = buildDoc();
    const element = doc.slides[0]!.elements.find((el) => el.id === A)!;
    const snapshot = snapshotStyle(element);
    expect(snapshot.formatVersion).toBe(STYLE_FORMAT_VERSION);
  });

  it('migrateSnapshot upgrades an older snapshot', () => {
    const next = migrateSnapshot({ formatVersion: 0 });
    expect(next.formatVersion).toBe(STYLE_FORMAT_VERSION);
  });

  it('persistent format painter keeps painting after a paste', () => {
    const doc = buildDoc();
    const painter = new FormatPainter();
    painter.arm(true);
    expect(painter.shouldContinueAfterPaste()).toBe(true);
    void doc; // explicit unused-variable trap
  });
});