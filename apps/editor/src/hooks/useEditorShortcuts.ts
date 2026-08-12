/**
 * useEditorShortcuts — mounts a window `keydown` listener that
 * dispatches editor actions through `ShortcutRegistry` +
 * `ChordMatcher`.
 *
 * Wave 2 §Phase A. Replaces the hand-written `useEffect` at
 * `EditorRoot.tsx:197` and the parallel `commands`/`shortcuts`
 * `useMemo`s further down. Both blocks fed the same keyset — now
 * one descriptor list drives both the keyboard handler and the
 * command palette.
 *
 * Two flavours of chord are supported:
 *  - Single keys / `Cmd`-chords look up in the registry by a
 *    canonical key set (modifier letters, sorted, joined with `+`).
 *  - Two-key sequences (`G then G`) go through `ChordMatcher` so a
 *    second press within 1 s of the first fires the action.
 *
 * The hook receives the binding map from the caller (typically
 * `store/handlers.ts`) so the listener can stay platform-agnostic
 * and unit-testable in isolation.
 */

import { useEffect, useMemo } from 'react';
import {
  type ChordMatcher,
  isChord,
  platformChord,
  type Shortcut,
} from '@domio/canvas';
import {
  DEFAULT_EDITOR_SHORTCUTS,
  detectEditorPlatform,
  buildEditorShortcutLayout,
  type EditorShortcutDescriptor,
  type EditorShortcutLayout,
  type EditorShortcutId,
} from '../editor-shortcuts';

export type EditorShortcutHandler = (id: EditorShortcutId) => void;
export type EditorShortcutBindings = Partial<Record<EditorShortcutId, () => void>>;

interface UseEditorShortcutsOptions {
  /**
   * Override the descriptor list. Defaults to
   * `DEFAULT_EDITOR_SHORTCUTS`. The setter exists for tests and
   * for the future user-remap flow.
   */
  descriptors?: ReadonlyArray<EditorShortcutDescriptor>;
  /**
   * Action-id → handler map. Missing ids simply don't fire.
   * Callers usually source this from `store/handlers.ts`.
   */
  bindings: EditorShortcutBindings;
  /**
   * Optional callback fired for any registered shortcut invocation,
   * regardless of whether a handler exists. Useful for analytics.
   */
  onInvoke?: (id: EditorShortcutId) => void;
  /**
   * Override the target — defaults to `window`. Tests inject jsdom
   * targets; the production call site leaves this alone.
   */
  target?: typeof window;
  /**
   * When true, ignore keystrokes whose target is an editable
   * element (input / textarea / contenteditable). Defaults to true
   * so the palette, search, and inspector inputs swallow keys
   * without leaking through to global handlers.
   */
  skipEditable?: boolean;
}

/**
 * Canonical key signature for a `KeyboardEvent` — normalised so
 * `Cmd+Z` on macOS and `Ctrl+Z` on Linux both land on the same
 * registry entry. Letters are uppercase; modifier order is fixed.
 *
 * Bare keys (`Escape`, `0`, `Backspace`) are returned as-is so
 * `ShortcutRegistry` can match them directly.
 *
 * The platform-aware `Cmd` ⇄ `Ctrl` swap mirrors `platformChord` so
 * the chord string we produce matches the chord string the registry
 * stored during `buildEditorShortcutLayout`.
 */
export function eventToChord(event: {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}): string | null {
  const key = event.key;
  if (!key) return null;
  // Single-character keys: leave them alone (uppercase).
  if (key.length === 1) {
    const upper = key.toUpperCase();
    const parts: string[] = [];
    // On macOS the user presses Cmd (event.metaKey); on Win/Linux
    // they press Ctrl (event.ctrlKey). Map both to a canonical chord
    // form the registry uses.
    if (event.ctrlKey) parts.push('Ctrl');
    if (event.metaKey) parts.push('Cmd');
    if (event.altKey) parts.push('Alt');
    if (event.shiftKey) parts.push('Shift');
    // For `Shift+R`, `Shift+G` the uppercase letter already encodes
    // the shift, but descriptor `Cmd+K` (a plain letter) is shifted
    // when shift is held — so emit both forms when shift is true.
    if (parts.length === 0) return upper;
    parts.push(upper);
    // Translate Cmd ⇄ Ctrl to match the descriptor's stored chord.
    return platformChord(parts.join('+'), detectEditorPlatform());
  }
  // Named keys — used directly. Multi-token names like `Escape`,
  // `Backspace`, `ArrowUp` already match the registry.
  return key;
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (target.isContentEditable) return true;
  return false;
}

function lookupShortcut(layout: EditorShortcutLayout, chord: string): Shortcut | null {
  if (isChord(chord)) {
    return layout.shortcuts.find((s) => s.chord === chord) ?? null;
  }
  return layout.shortcuts.find((s) => s.chord === chord) ?? null;
}

export interface UseEditorShortcutsResult {
  /** Shortcuts registered for the current bindings. */
  shortcuts: ReadonlyArray<Shortcut>;
  /** ChordMatcher instance, exposed for tests that want to feed keys manually. */
  matcher: ChordMatcher;
}

/**
 * Mount the editor's keyboard listener. Returns the registered
 * shortcuts + matcher for callers that want to render the palette
 * or otherwise expose them.
 *
 * The handler is stable; the listener re-binds whenever the
 * bindings map (reference) changes. Descriptors are also reactive
 * — pass a new array and the registry rebuilds.
 */
export function useEditorShortcuts(options: UseEditorShortcutsOptions): UseEditorShortcutsResult {
  const {
    descriptors = DEFAULT_EDITOR_SHORTCUTS,
    bindings,
    onInvoke,
    target,
    skipEditable = true,
  } = options;

  const layout = useMemo<EditorShortcutLayout>(
    () => buildEditorShortcutLayout(descriptors),
    [descriptors],
  );

  useEffect(() => {
    const win = target ?? (typeof window !== 'undefined' ? window : null);
    if (!win) return undefined;
    const matcher = buildEditorShortcutLayout(descriptors).matcher;

    const listener = (event: Event) => {
      if (!(event instanceof KeyboardEvent)) return;
      if (skipEditable && isEditableTarget(event.target)) return;

      const chord = eventToChord(event);
      if (!chord) return;

      // Single-key / Cmd-chord path — static registry lookup.
      const shortcut = lookupShortcut(layout, chord);
      if (shortcut) {
        const id = shortcut.id as EditorShortcutId;
        event.preventDefault();
        bindings[id]?.();
        onInvoke?.(id);
        return;
      }

      // Sequence path (`G then G`, etc.) — only single-character
      // keys are valid sequence legs.
      if (event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) {
        const match = matcher.feed(event.key);
        if (match.matched && match.actionId) {
          const id = match.actionId as EditorShortcutId;
          event.preventDefault();
          bindings[id]?.();
          onInvoke?.(id);
        }
      }
    };

    win.addEventListener('keydown', listener as EventListener);
    return () => {
      win.removeEventListener('keydown', listener as EventListener);
      matcher.reset();
    };
  }, [bindings, descriptors, layout, onInvoke, skipEditable, target]);

  return { shortcuts: layout.shortcuts, matcher: layout.matcher };
}
