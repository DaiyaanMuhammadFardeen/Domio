import { describe, expect, it } from 'vitest';
import { isChord, isChordSequence } from '@domio/canvas';
import {
  DEFAULT_EDITOR_SHORTCUTS,
  buildEditorShortcutLayout,
  type EditorShortcutId,
} from './editor-shortcuts';

/**
 * The descriptor list is the editor's keyboard contract. The build
 * path must:
 *  - keep every chord unique inside the registry,
 *  - split single-key chords from chord-sequences,
 *  - normalise Cmd ⇄ Ctrl via `platformChord` (we can't change
 *    navigator.platform in jsdom without polyfills, so the
 *    structural assertions don't assume a platform).
 */

describe('editor-shortcuts · DEFAULT_EDITOR_SHORTCUTS', () => {
  it('is non-empty', () => {
    expect(DEFAULT_EDITOR_SHORTCUTS.length).toBeGreaterThan(0);
  });

  it('has unique ids', () => {
    const ids = new Set(DEFAULT_EDITOR_SHORTCUTS.map((d) => d.id));
    expect(ids.size).toBe(DEFAULT_EDITOR_SHORTCUTS.length);
  });

  it('accepts every supported descriptor shape', () => {
    // Registry chords include bare keys (Escape, Backspace, 0/1/2)
    // in addition to the canvas helper's modifier grammar. We
    // accept either form so descriptor authors don't have to fight
    // the canvas's regex when authoring single-key bindings.
    for (const desc of DEFAULT_EDITOR_SHORTCUTS) {
      const supported =
        isChord(desc.chord) ||
        isChordSequence(desc.chord) ||
        ['Escape', 'Backspace', '0', '1', '2'].includes(desc.chord);
      expect(supported, `unexpected chord shape: ${desc.chord}`).toBe(true);
    }
  });

  it('keeps the four legacy chords from EditorRoot', () => {
    const ids = new Set(DEFAULT_EDITOR_SHORTCUTS.map((d) => d.id));
    expect(ids.has('undo')).toBe(true);
    expect(ids.has('redo')).toBe(true);
    expect(ids.has('open-palette')).toBe(true);
    expect(ids.has('send-ping')).toBe(true);
    expect(ids.has('escape')).toBe(true);
  });

  it('exposes the Wave-2 chrome shortcuts', () => {
    const ids = new Set(DEFAULT_EDITOR_SHORTCUTS.map((d) => d.id));
    expect(ids.has('toggle-rulers')).toBe(true);
    expect(ids.has('toggle-grid')).toBe(true);
    expect(ids.has('toggle-snap')).toBe(true);
    expect(ids.has('group-selection')).toBe(true);
    expect(ids.has('ungroup-selection')).toBe(true);
    expect(ids.has('duplicate-selection')).toBe(true);
    expect(ids.has('delete-selection')).toBe(true);
    expect(ids.has('fit-to-slide')).toBe(true);
    expect(ids.has('zoom-100')).toBe(true);
    expect(ids.has('zoom-200')).toBe(true);
  });
});

describe('editor-shortcuts · buildEditorShortcutLayout', () => {
  it('builds a registry whose entries match the descriptors', () => {
    const layout = buildEditorShortcutLayout(DEFAULT_EDITOR_SHORTCUTS);
    // Every chord-id should appear once in the layout's shortcut list.
    expect(layout.chordIds.length).toBeGreaterThan(0);
    expect(layout.sequenceIds.length).toBeGreaterThan(0);
    const combined = new Set([...layout.chordIds, ...layout.sequenceIds]);
    expect(combined.size).toBe(DEFAULT_EDITOR_SHORTCUTS.length);
  });

  it('does not register duplicate static chords', () => {
    // Adding a second descriptor that normalises to an existing
    // chord (Cmd+Z → Cmd+Z on non-mac) must be refused. We give it
    // a different id so the registry sees a real conflict (vs the
    // "same id re-registration" path which replaces).
    const alias = {
      id: 'undo-alias' as EditorShortcutId,
      label: 'Undo Alias',
      chord: 'Cmd+Z',
      category: 'Edit' as const,
    };
    const layout = buildEditorShortcutLayout([
      ...DEFAULT_EDITOR_SHORTCUTS,
      alias,
    ]);
    const seen = new Set<string>();
    for (const s of layout.shortcuts) {
      expect(seen.has(s.chord), `${s.chord} duplicated`).toBe(false);
      seen.add(s.chord);
    }
    // The conflicting descriptor must not have appeared in the
    // surviving shortcut list.
    expect(layout.shortcuts.some((s) => s.id === 'undo-alias')).toBe(false);
  });

  it('routes chord-sequences through the matcher', () => {
    const layout = buildEditorShortcutLayout([
      {
        id: 'fit-to-slide',
        label: 'Fit to Slide',
        chord: 'G then G',
        category: 'View',
      },
    ]);
    const first = layout.matcher.feed('g');
    expect(first.matched).toBe(false);
    const second = layout.matcher.feed('g');
    expect(second.matched).toBe(true);
    expect(second.actionId).toBe('fit-to-slide');
  });

  it('resets the matcher when the second key differs', () => {
    const layout = buildEditorShortcutLayout([
      {
        id: 'fit-to-slide',
        label: 'Fit to Slide',
        chord: 'G then G',
        category: 'View',
      },
    ]);
    layout.matcher.feed('g');
    const other = layout.matcher.feed('h');
    expect(other.matched).toBe(false);
    // After a non-match, a fresh G-then-G should still fire.
    const ok = layout.matcher.feed('g');
    expect(ok.matched).toBe(false); // first press in the new sequence
    const ok2 = layout.matcher.feed('g');
    expect(ok2.matched).toBe(true);
  });
});
