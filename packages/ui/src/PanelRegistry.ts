/**
 * PanelRegistry — generic, type-safe registry for pluggable side panels.
 *
 * Per Wave 1 §S1.1 of docs/frontend-roadmap/01-wave-productionization.md.
 *
 * Concrete apps (editor, presenter) instantiate `createPanelRegistry`
 * with their own tab-id union and panel-group enum, then add entries.
 *
 * Pattern is open/closed: adding a new panel requires only:
 *   1. A new module under `panels/<id>/index.ts` exporting a Panel entry.
 *   2. A single line in the registry file: `registry.add(myPanel)`.
 *
 * No edits to the host shell (EditorRoot, PresenterView) are required.
 */

import { type ComponentType, type LazyExoticComponent } from 'react';

export interface PanelDefinition<TId extends string, PGroup extends string, PProps> {
  readonly id: TId;
  readonly label: string;
  readonly group: PGroup;
  readonly icon?: ComponentType;
  readonly Component: ComponentType<PProps> | LazyExoticComponent<ComponentType<PProps>>;
  /** Render hint for the chrome — e.g. "left", "right", "modal". */
  readonly surface?: 'left' | 'right' | 'modal' | 'bottom';
  /** Optional sort key within a group. Lower = earlier. */
  readonly order?: number;
}

export interface PanelRegistry<TId extends string, PGroup extends string, PProps> {
  add(panel: PanelDefinition<TId, PGroup, PProps>): void;
  addAll(panels: ReadonlyArray<PanelDefinition<TId, PGroup, PProps>>): void;
  get(id: TId): PanelDefinition<TId, PGroup, PProps> | undefined;
  list(): ReadonlyArray<PanelDefinition<TId, PGroup, PProps>>;
  listByGroup(group: PGroup): ReadonlyArray<PanelDefinition<TId, PGroup, PProps>>;
  groups(): ReadonlyArray<PGroup>;
  has(id: string): id is TId;
}

/**
 * Factory for an empty panel registry. The host shell calls `addAll`
 * once during module load; no further mutation is expected at runtime.
 */
export function createPanelRegistry<
  TId extends string,
  PGroup extends string,
  PProps,
>(): PanelRegistry<TId, PGroup, PProps> {
  const store = new Map<TId, PanelDefinition<TId, PGroup, PProps>>();

  return {
    add(panel) {
      if (store.has(panel.id)) {
        throw new Error(
          `[PanelRegistry] duplicate panel id: ${String(panel.id)}`,
        );
      }
      store.set(panel.id, panel);
    },
    addAll(panels) {
      for (const p of panels) {
        if (store.has(p.id)) {
          throw new Error(
            `[PanelRegistry] duplicate panel id: ${String(p.id)}`,
          );
        }
        store.set(p.id, p);
      }
    },
    get(id) {
      return store.get(id);
    },
    list() {
      return [...store.values()];
    },
    listByGroup(group) {
      return [...store.values()]
        .filter((p) => p.group === group)
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    },
    groups() {
      const seen = new Set<PGroup>();
      const out: PGroup[] = [];
      for (const p of store.values()) {
        if (!seen.has(p.group)) {
          seen.add(p.group);
          out.push(p.group);
        }
      }
      return out;
    },
    has(id): id is TId {
      return store.has(id as TId);
    },
  };
}