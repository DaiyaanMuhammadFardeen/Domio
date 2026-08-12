import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import {
  useEditorShortcuts,
  eventToChord,
  type EditorShortcutBindings,
} from './useEditorShortcuts';
import { DEFAULT_EDITOR_SHORTCUTS } from '../editor-shortcuts';

/**
 * `useEditorShortcuts` mounts a window keydown listener and feeds
 * events through the registry + matcher. We feed real `KeyboardEvent`s
 * via `window.dispatchEvent`, which exercises the full event pipeline
 * including the editable-target check.
 */

function fireKey(props: Partial<KeyboardEventInit>): KeyboardEvent {
  const event = new KeyboardEvent('keydown', {
    bubbles: true,
    cancelable: true,
    key: '',
    code: '',
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    ...props,
  });
  // `preventDefault` is on the KeyboardEvent prototype already, but
  // jsdom's constructor-built events have a fresh instance and the
  // spy is harmless either way.
  return event;
}

describe('useEditorShortcuts · eventToChord', () => {
  it('maps a single letter to its uppercase form', () => {
    expect(eventToChord(fireKey({ key: 'k' }))).toBe('K');
  });

  it('joins modifiers in canonical Cmd-prefix form', () => {
    // The result is platform-dependent: macOS emits Cmd+Shift+Z, every
    // other platform emits Ctrl+Shift+Z. We assert that the chord is
    // a single token with the right modifiers and the right letter.
    const chord = eventToChord(fireKey({ key: 'z', metaKey: true, shiftKey: true }));
    expect(chord).toMatch(/^(Cmd|Ctrl)\+Shift\+Z$/);
  });

  it('returns the raw named key for Escape/0/Backspace', () => {
    expect(eventToChord(fireKey({ key: 'Escape' }))).toBe('Escape');
    expect(eventToChord(fireKey({ key: '0' }))).toBe('0');
    expect(eventToChord(fireKey({ key: 'Backspace' }))).toBe('Backspace');
  });

  it('returns null when the event has no key', () => {
    expect(eventToChord(fireKey({ key: '' }))).toBeNull();
  });
});

describe('useEditorShortcuts · dispatch', () => {
  let originalDoc: typeof document;

  beforeEach(() => {
    originalDoc = globalThis.document;
  });

  afterEach(() => {
    globalThis.document = originalDoc;
  });

  it('fires the matching handler and ignore non-matching keys', async () => {
    const undo = vi.fn();
    const openPalette = vi.fn();
    const bindings: EditorShortcutBindings = {
      undo,
      'open-palette': openPalette,
    };
    await act(async () => {
      renderHook(() =>
        useEditorShortcuts({
          bindings,
          descriptors: DEFAULT_EDITOR_SHORTCUTS,
          skipEditable: false,
        }),
      );
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    act(() => {
      window.dispatchEvent(fireKey({ key: 'z', metaKey: true }));
    });
    expect(undo).toHaveBeenCalledTimes(1);
    expect(openPalette).not.toHaveBeenCalled();
  });

  it('handles a chord sequence (G then G)', async () => {
    const fit = vi.fn();
    const bindings: EditorShortcutBindings = {
      'fit-to-slide': fit,
    };
    renderHook(() =>
      useEditorShortcuts({
        bindings,
        descriptors: [
          {
            id: 'fit-to-slide',
            label: 'Fit',
            chord: 'G then G',
            category: 'View',
          },
        ],
        skipEditable: false,
      }),
    );
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    act(() => {
      window.dispatchEvent(fireKey({ key: 'g' }));
    });
    expect(fit).not.toHaveBeenCalled();
    act(() => {
      window.dispatchEvent(fireKey({ key: 'g' }));
    });
    expect(fit).toHaveBeenCalledTimes(1);
  });

  it('skips keys when the focused element is editable', async () => {
    const undo = vi.fn();
    const bindings: EditorShortcutBindings = { undo };
    renderHook(() =>
      useEditorShortcuts({ bindings, skipEditable: true }),
    );
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    // Build a fresh <input>, focus it, dispatch the keydown from
    // there so `event.target` is the editable element.
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();
    act(() => {
      const event = fireKey({ key: 'z', metaKey: true });
      input.dispatchEvent(event);
    });
    expect(undo).not.toHaveBeenCalled();
    document.body.removeChild(input);
  });
});
