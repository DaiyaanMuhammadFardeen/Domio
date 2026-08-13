/**
 * Shortcut registry — conflict-checked, platform-aware. See
 * docs/development_phases/phase-03 §F.1: every action reachable via a single
 * keystroke or via Cmd+K; conflict refused at registration; platform mapping
 * `Cmd` vs. `Ctrl`.
 */

import type { KeyboardKey } from '../input/keyboard.js';

export interface Shortcut {
  id: string;
  chord: string; // e.g. "Cmd+Z", "Cmd+Shift+Z", "G then G"
  label: string;
  description?: string;
  /** Optional category for the command palette. */
  category?: string;
  /** Optional feature flag. */
  featureFlag?: string;
}

export interface ShortcutRegistration {
  shortcut: Shortcut;
  ok: boolean;
  conflicting?: Shortcut;
}

export class ShortcutRegistry {
  private readonly byChord = new Map<string, Shortcut>();
  private readonly byId = new Map<string, Shortcut>();

  register(shortcut: Shortcut): ShortcutRegistration {
    const existing = this.byChord.get(shortcut.chord);
    if (existing && existing.id !== shortcut.id) {
      return { shortcut, ok: false, conflicting: existing };
    }
    this.byChord.set(shortcut.chord, shortcut);
    this.byId.set(shortcut.id, shortcut);
    return { shortcut, ok: true };
  }

  unregister(id: string): void {
    const shortcut = this.byId.get(id);
    if (!shortcut) return;
    this.byId.delete(id);
    this.byChord.delete(shortcut.chord);
  }

  getByChord(chord: string): Shortcut | null {
    return this.byChord.get(chord) ?? null;
  }

  getById(id: string): Shortcut | null {
    return this.byId.get(id) ?? null;
  }

  list(): Shortcut[] {
    return Array.from(this.byId.values());
  }

  /** Returns shortcuts whose chord or label matches the query. */
  search(query: string): Shortcut[] {
    const lower = query.toLowerCase().trim();
    if (lower === '') return this.list();
    return this.list().filter((shortcut) => {
      return (
        shortcut.label.toLowerCase().includes(lower) ||
        shortcut.chord.toLowerCase().includes(lower) ||
        (shortcut.description?.toLowerCase().includes(lower) ?? false) ||
        (shortcut.category?.toLowerCase().includes(lower) ?? false)
      );
    });
  }

  /** Rebuild when shortcuts are remapped. */
  remap(id: string, newChord: string): ShortcutRegistration {
    const existing = this.byId.get(id);
    if (!existing) {
      return { shortcut: { id, chord: newChord, label: '' }, ok: false };
    }
    this.byChord.delete(existing.chord);
    existing.chord = newChord;
    return this.register(existing);
  }
}

export function platformChord(parts: string, platform: 'mac' | 'win' | 'linux' | 'other'): string {
  if (platform !== 'mac') {
    return parts.replace(/Cmd/g, 'Ctrl');
  }
  return parts;
}

export function isChord(value: string): boolean {
  return /^(Cmd|Ctrl|Alt|Shift)(\+(Cmd|Ctrl|Alt|Shift))*\+[A-Z][A-Za-z0-9]*$/.test(value);
}

export function isChordSequence(value: string): boolean {
  return / then /.test(value);
}

export type ShortcutKey = KeyboardKey;
