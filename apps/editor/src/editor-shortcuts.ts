/**
 * Editor keyboard bindings — single source of truth for every chord
 * the editor responds to.
 *
 * Wave 2 §Phase A. Before this file, the keydown listener at
 * `EditorRoot.tsx:197` was a hand-written switch on five cases;
 * another `useMemo` registered a parallel `ShortcutRegistry`. Both
 * go away in favour of:
 *
 *  - this descriptor file (~14 entries: the four existing + Wave 2's
 *    ten new ones),
 *  - a `bindings` map from action-id → handler,
 *  - a single `useEditorShortcuts()` hook that mounts the listener
 *    and dispatches.
 *
 * Why a separate file: the descriptor list is editor policy and
 * shouldn't depend on React. `useEditorShortcuts` imports it and
 * supplies the handlers from `store/handlers.ts`.
 *
 * The `platformChord` helper covers Cmd vs Ctrl so the same
 * descriptor works on macOS / Windows / Linux. Chord sequences
 * (`G then G`) flow through `ChordMatcher` because the registry
 * alone can't tell "two presses of the same key within 1 s" apart
 * from a single press.
 */

import {
  ChordMatcher,
  ShortcutRegistry,
  type Shortcut,
  isChordSequence,
  platformChord,
} from '@domio/canvas';

/** Identifiers for every editor action reachable via the keyboard. */
export type EditorShortcutId =
  // View
  | 'open-palette'
  | 'send-ping'
  | 'toggle-rulers'
  | 'toggle-grid'
  | 'toggle-snap'
  // Edit
  | 'undo'
  | 'redo'
  | 'escape'
  | 'group-selection'
  | 'ungroup-selection'
  | 'duplicate-selection'
  | 'delete-selection'
  // Navigation / viewport
  | 'fit-to-slide'
  | 'zoom-100'
  | 'zoom-200'
  | 'reset-viewport';

/**
 * `EditorShortcutDescriptor` is the policy object — it says
 * "this action id exists; here's its chord and label". The
 * handler is supplied at runtime by the hook.
 */
export interface EditorShortcutDescriptor {
  id: EditorShortcutId;
  /** Display label, used in the command palette. */
  label: string;
  /** Chord or chord-sequence (e.g. `Cmd+Z`, `G then G`). */
  chord: string;
  category: 'Edit' | 'View' | 'Insert' | 'Selection' | 'Presence';
  description?: string;
}

export interface EditorShortcutLayout {
  /** Descriptors in registry order — used to populate the palette. */
  shortcuts: ReadonlyArray<Shortcut>;
  /** Reverse lookup: chord sequence → action id, via `ChordMatcher`. */
  matcher: ChordMatcher;
  /** Action ids the matcher handles (subset of descriptor ids). */
  sequenceIds: ReadonlyArray<EditorShortcutId>;
  /** Action ids the static registry handles. */
  chordIds: ReadonlyArray<EditorShortcutId>;
}

/** Tells descriptors which Cmd-key form to use at runtime. */
export function detectEditorPlatform(): 'mac' | 'win' | 'linux' | 'other' {
  if (typeof navigator === 'undefined') return 'other';
  const platform = navigator.platform ?? '';
  if (/mac|iphone|ipad|ipod/i.test(platform)) return 'mac';
  if (/win/i.test(platform)) return 'win';
  if (/linux|x11/i.test(platform)) return 'linux';
  // The user-agent hints at Linux when the platform string is empty.
  const ua = navigator.userAgent ?? '';
  if (/linux|x11/i.test(ua)) return 'linux';
  if (/windows/i.test(ua)) return 'win';
  if (/mac os|iphone|ipad/i.test(ua)) return 'mac';
  return 'other';
}

/** Cached at module load so the layout is stable across renders. */
const PLATFORM = detectEditorPlatform();

function plainChord(parts: string): string {
  return platformChord(parts, PLATFORM);
}

/**
 * Build the editor's keyboard layout from a static descriptor list.
 * The matcher is dedicated to chord-sequences because the
 * `ShortcutRegistry`'s `byChord` map is single-keyed.
 */
export function buildEditorShortcutLayout(
  descriptors: ReadonlyArray<EditorShortcutDescriptor>,
): EditorShortcutLayout {
  const reg = new ShortcutRegistry();
  const sequenceDefs: Array<{
    sequence: string[];
    actionId: EditorShortcutId;
    windowMs?: number;
  }> = [];
  const sequenceIds: EditorShortcutId[] = [];
  const chordIds: EditorShortcutId[] = [];
  const collected: Shortcut[] = [];

  for (const desc of descriptors) {
    if (isChordSequence(desc.chord)) {
      const parts = desc.chord.split(' then ').map((p) => p.trim().toUpperCase());
      sequenceDefs.push({ sequence: parts, actionId: desc.id });
      sequenceIds.push(desc.id);
      collected.push({
        id: desc.id,
        chord: desc.chord,
        label: desc.label,
        category: desc.category,
        ...(desc.description ? { description: desc.description } : {}),
      });
      continue;
    }
    const normalised = plainChord(desc.chord);
    const result = reg.register({
      id: desc.id,
      chord: normalised,
      label: desc.label,
      category: desc.category,
      ...(desc.description ? { description: desc.description } : {}),
    });
    if (result.ok) {
      chordIds.push(desc.id);
      collected.push({
        id: desc.id,
        chord: normalised,
        label: desc.label,
        category: desc.category,
        ...(desc.description ? { description: desc.description } : {}),
      });
    }
  }

  return {
    shortcuts: collected,
    matcher: new ChordMatcher(sequenceDefs),
    sequenceIds,
    chordIds,
  };
}

/**
 * Default descriptor list. Exported separately so tests can
 * introspect without depending on the layout build.
 *
 * **Existing chords (kept verbatim)**:
 *   Cmd+K → open palette, Cmd+Shift+P → send ping,
 *   Cmd+Z → undo, Cmd+Shift+Z → redo, Escape → clear selection.
 *
 * **Wave 2 additions**:
 *   Shift+R → toggle rulers
 *   Shift+G → toggle grid
 *   Cmd+J → toggle snap
 *   Cmd+G → group, Cmd+Shift+G → ungroup (Figma convention)
 *   Cmd+D → duplicate selection
 *   Backspace/Delete → delete selection
 *   0 → fit to slide, 1 → 100%, 2 → 200%
 *   G then G → fit to slide (sequence, alternative to 0)
 */
export const DEFAULT_EDITOR_SHORTCUTS: ReadonlyArray<EditorShortcutDescriptor> = [
  {
    id: 'open-palette',
    label: 'Open Command Palette',
    chord: 'Cmd+K',
    category: 'View',
    description: 'Search every action in the editor.',
  },
  {
    id: 'send-ping',
    label: 'Send Ping',
    chord: 'Cmd+Shift+P',
    category: 'Presence',
    description: 'Emit a presence ping for collaborators.',
  },
  {
    id: 'toggle-rulers',
    label: 'Toggle Rulers',
    chord: 'Shift+R',
    category: 'View',
    description: 'Show or hide canvas rulers.',
  },
  {
    id: 'toggle-grid',
    label: 'Toggle Grid',
    chord: 'Shift+G',
    category: 'View',
    description: 'Show or hide the layout grid.',
  },
  {
    id: 'toggle-snap',
    label: 'Toggle Snap',
    chord: 'Cmd+J',
    category: 'View',
    description: 'Toggle snapping to grid and guides.',
  },
  {
    id: 'undo',
    label: 'Undo',
    chord: 'Cmd+Z',
    category: 'Edit',
    description: 'Reverse the most recent edit.',
  },
  {
    id: 'redo',
    label: 'Redo',
    chord: 'Cmd+Shift+Z',
    category: 'Edit',
    description: 'Reapply the last undone edit.',
  },
  {
    id: 'escape',
    label: 'Clear Selection',
    chord: 'Escape',
    category: 'Selection',
    description: 'Deselect all elements and close any open surface.',
  },
  {
    id: 'group-selection',
    label: 'Group Selection',
    chord: 'Cmd+G',
    category: 'Selection',
    description: 'Wrap the selected elements in a parent group.',
  },
  {
    id: 'ungroup-selection',
    label: 'Ungroup Selection',
    chord: 'Cmd+Shift+G',
    category: 'Selection',
    description: 'Dissolve the parent group around the selection.',
  },
  {
    id: 'duplicate-selection',
    label: 'Duplicate Selection',
    chord: 'Cmd+D',
    category: 'Edit',
    description: 'Clone the selected elements, offset by 8 px.',
  },
  {
    id: 'delete-selection',
    label: 'Delete Selection',
    chord: 'Backspace',
    category: 'Edit',
    description: 'Remove the selected elements from the deck.',
  },
  {
    id: 'fit-to-slide',
    label: 'Fit to Slide',
    chord: '0',
    category: 'View',
    description: 'Zoom and pan so the slide fills the canvas.',
  },
  {
    id: 'zoom-100',
    label: 'Zoom 100%',
    chord: '1',
    category: 'View',
    description: 'Reset zoom to actual size.',
  },
  {
    id: 'zoom-200',
    label: 'Zoom 200%',
    chord: '2',
    category: 'View',
    description: 'Zoom to double actual size.',
  },
  {
    id: 'reset-viewport',
    label: 'Reset Viewport',
    chord: 'R then R',
    category: 'View',
    description: 'Reset zoom and pan to defaults (sequence).',
  },
];
