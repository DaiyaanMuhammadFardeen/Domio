import { describe, it, expect } from 'vitest';
import { ShortcutRegistry, isChord, isChordSequence, platformChord } from '../src/keyboard/registry.js';
import { ChordMatcher, createChordState } from '../src/keyboard/chord.js';

describe('ShortcutRegistry', () => {
  it('registers and looks up a shortcut by chord', () => {
    const registry = new ShortcutRegistry();
    registry.register({ id: 'undo', chord: 'Cmd+Z', label: 'Undo' });
    expect(registry.getByChord('Cmd+Z')?.id).toBe('undo');
  });

  it('refuses conflicts', () => {
    const registry = new ShortcutRegistry();
    registry.register({ id: 'a', chord: 'Cmd+Z', label: 'A' });
    const result = registry.register({ id: 'b', chord: 'Cmd+Z', label: 'B' });
    expect(result.ok).toBe(false);
    expect(result.conflicting?.id).toBe('a');
  });

  it('searches by label and chord', () => {
    const registry = new ShortcutRegistry();
    registry.register({ id: 'undo', chord: 'Cmd+Z', label: 'Undo' });
    registry.register({ id: 'redo', chord: 'Cmd+Shift+Z', label: 'Redo' });
    expect(registry.search('undo')).toHaveLength(1);
    expect(registry.search('Cmd+Shift')).toHaveLength(1);
  });

  it('remaps a shortcut', () => {
    const registry = new ShortcutRegistry();
    registry.register({ id: 'undo', chord: 'Cmd+Z', label: 'Undo' });
    const result = registry.remap('undo', 'Cmd+Y');
    expect(result.ok).toBe(true);
    expect(registry.getByChord('Cmd+Y')?.id).toBe('undo');
    expect(registry.getByChord('Cmd+Z')).toBeNull();
  });

  it('isChord detects chord format', () => {
    expect(isChord('Cmd+Z')).toBe(true);
    expect(isChord('Cmd+Shift+Z')).toBe(true);
    expect(isChord('Z')).toBe(false);
    expect(isChord('G then G')).toBe(false);
  });

  it('isChordSequence detects sequences', () => {
    expect(isChordSequence('G then G')).toBe(true);
    expect(isChordSequence('Cmd+Z')).toBe(false);
  });

  it('platformChord remaps Cmd to Ctrl', () => {
    expect(platformChord('Cmd+Z', 'win')).toBe('Ctrl+Z');
    expect(platformChord('Cmd+Z', 'mac')).toBe('Cmd+Z');
  });
});

describe('ChordMatcher', () => {
  it('matches a two-key sequence within the window', () => {
    const matcher = new ChordMatcher([{ sequence: ['G', 'G'], actionId: 'goto-slide' }], { now: () => 0, windowMs: 1000 });
    matcher.feed('G');
    const result = matcher.feed('G');
    expect(result.matched).toBe(true);
    expect(result.actionId).toBe('goto-slide');
  });

  it('resets the timer after the window expires', () => {
    let now = 0;
    const matcher = new ChordMatcher([{ sequence: ['G', 'G'], actionId: 'goto-slide' }], { now: () => now, windowMs: 1000 });
    matcher.feed('G');
    now = 2000;
    const result = matcher.feed('G');
    expect(result.matched).toBe(false);
  });

  it('createChordState initializes an empty state', () => {
    const state = createChordState();
    expect(state.lastKey).toBeNull();
  });
});