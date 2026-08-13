/**
 * Menu registry — sub-menus nest up to 2 levels (deeper flattens). See
 * docs/development_phases/phase-03 §F.2.
 */

import type { Element } from '@domio/schema';

export interface MenuEntry {
  id: string;
  label: string;
  shortcut?: string;
  /** Optional submenu. */
  children?: MenuEntry[];
  /** When true, the entry is hidden (feature flag off). */
  hidden?: boolean;
  /** Optional category for analytics. */
  category?: string;
  /** Most-recently used (recomputed by usage). */
  frequency?: number;
}

export const MAX_MENU_DEPTH = 2;

export function flattenDeepMenu(entries: MenuEntry[]): MenuEntry[] {
  const out: MenuEntry[] = [];
  const walk = (items: MenuEntry[], depth: number) => {
    for (const item of items) {
      if (item.hidden) continue;
      if (depth >= MAX_MENU_DEPTH || !item.children) {
        out.push(item);
        continue;
      }
      out.push(item);
      walk(item.children, depth + 1);
    }
  };
  walk(entries, 0);
  return out;
}

export class MenuRegistry {
  private readonly byLayerType = new Map<Element['type'], MenuEntry[]>();

  register(layerType: Element['type'], entries: MenuEntry[]): void {
    this.byLayerType.set(layerType, entries);
  }

  get(layerType: Element['type']): MenuEntry[] {
    return this.byLayerType.get(layerType) ?? [];
  }

  list(): Record<Element['type'], MenuEntry[]> {
    return Object.fromEntries(this.byLayerType.entries()) as Record<Element['type'], MenuEntry[]>;
  }

  /**
   * Pin most-recently-used entries to the top. Pinned list is given by the
   * caller (the menu UI tracks usage locally per
   * docs/development_phases/phase-03 §F.2 DoD).
   */
  sortedFor(layerType: Element['type'], pinned: string[] = []): MenuEntry[] {
    const entries = this.get(layerType);
    return [...entries].sort((a, b) => {
      const aPin = pinned.indexOf(a.id);
      const bPin = pinned.indexOf(b.id);
      if (aPin >= 0 && bPin >= 0) return aPin - bPin;
      if (aPin >= 0) return -1;
      if (bPin >= 0) return 1;
      return (b.frequency ?? 0) - (a.frequency ?? 0);
    });
  }
}
