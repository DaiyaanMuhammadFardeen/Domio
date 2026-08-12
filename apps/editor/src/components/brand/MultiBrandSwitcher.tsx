'use client';

/**
 * MultiBrandSwitcher — manage multiple brand kits, switch the active
 * one per-deck or per-slide.
 *
 * Per Wave 2 §S2.5 of docs/frontend-roadmap/02-wave-editor-surface.md.
 *
 * Supports:
 *   - list all kits (from `fetchBrandKits`)
 *   - select a kit as deck-wide default
 *   - select a kit as the active slide's override
 *   - rename / recolor a kit (hoists into onUpdateKit)
 *
 * The component is unopinionated about persistence: every change
 * emits a typed callback. Hosts decide whether the change hits the
 * engine bridge (deck-level) or stays scoped to the current slide.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactElement } from 'react';
import type { BrandKitDetail } from '../../lib/brand-service';
import { fetchBrandKits } from '../../lib/brand-service';
import { contrastFor } from '../../lib/design-tokens';

export interface MultiBrandSwitcherProps {
  /** All kits the user can pick from. */
  kits: readonly BrandKitDetail[];
  /** The deck-wide default kit id. */
  deckKitId: string;
  /** The active slide's override kit id (or null = inherit). */
  activeSlideKitId: string | null;
  /** Called when the deck-wide default changes. */
  onDeckKitChange: (kitId: string) => void;
  /** Called when the slide override changes (null = inherit). */
  onSlideKitChange: (kitId: string | null) => void;
  /** Called when a kit is renamed / recolored. */
  onUpdateKit: (kitId: string, patch: { name?: string; primaryHex?: string; accentHex?: string }) => void;
  /** Optional test id. */
  id?: string | undefined;
  /** Read-only mode. */
  readOnly?: boolean | undefined;
}

export function MultiBrandSwitcher(props: MultiBrandSwitcherProps): ReactElement {
  const {
    kits,
    deckKitId,
    activeSlideKitId,
    onDeckKitChange,
    onSlideKitChange,
    onUpdateKit,
    id,
    readOnly,
  } = props;

  const [selectedKitId, setSelectedKitId] = useState<string>(activeSlideKitId ?? deckKitId);
  const [editingDraft, setEditingDraft] = useState<{ name: string; primary: string; accent: string } | null>(null);

  useEffect(() => {
    setSelectedKitId(activeSlideKitId ?? deckKitId);
  }, [deckKitId, activeSlideKitId]);

  const selectedKit = useMemo(
    () => kits.find((k) => k.id === selectedKitId) ?? kits[0],
    [kits, selectedKitId],
  );

  const handleEdit = useCallback(() => {
    if (!selectedKit) return;
    setEditingDraft({
      name: selectedKit.name,
      primary: selectedKit.primaryHex,
      accent: selectedKit.accentHex,
    });
  }, [selectedKit]);

  const handleSaveEdit = useCallback(() => {
    if (!editingDraft || !selectedKit) return;
    onUpdateKit(selectedKit.id, editingDraft);
    setEditingDraft(null);
  }, [editingDraft, selectedKit, onUpdateKit]);

  return (
    <section className="multi-brand-switcher" data-testid={id ?? 'multi-brand-switcher'}>
      <header className="multi-brand-switcher__head">
        <h3 className="multi-brand-switcher__title">Multi-brand</h3>
        <p className="multi-brand-switcher__sub">
          Pick a deck-wide brand kit, or override per slide.
        </p>
      </header>

      <div className="multi-brand-switcher__scope">
        <fieldset className="multi-brand-switcher__field" data-testid="multi-brand-deck-field">
          <legend>Deck default</legend>
          <select
            value={deckKitId}
            onChange={(e) => onDeckKitChange(e.target.value)}
            disabled={readOnly}
            data-testid="multi-brand-deck-select"
          >
            {kits.map((k) => (
              <option key={k.id} value={k.id}>{k.name}</option>
            ))}
          </select>
        </fieldset>
        <fieldset className="multi-brand-switcher__field" data-testid="multi-brand-slide-field">
          <legend>This slide</legend>
          <select
            value={activeSlideKitId ?? ''}
            onChange={(e) => onSlideKitChange(e.target.value === '' ? null : e.target.value)}
            disabled={readOnly}
            data-testid="multi-brand-slide-select"
          >
            <option value="">Inherit from deck</option>
            {kits.map((k) => (
              <option key={k.id} value={k.id}>{k.name}</option>
            ))}
          </select>
        </fieldset>
      </div>

      <div className="multi-brand-switcher__list">
        {kits.map((kit) => (
          <button
            key={kit.id}
            type="button"
            className={`multi-brand-switcher__row${kit.id === selectedKitId ? ' is-active' : ''}`}
            onClick={() => setSelectedKitId(kit.id)}
            data-testid={`multi-brand-row-${kit.id}`}
          >
            <span className="multi-brand-switcher__swatches">
              <span
                className="multi-brand-switcher__swatch"
                style={{ background: kit.primaryHex, color: contrastFor(kit.primaryHex) }}
              >
                P
              </span>
              <span
                className="multi-brand-switcher__swatch"
                style={{ background: kit.accentHex, color: contrastFor(kit.accentHex) }}
              >
                A
              </span>
            </span>
            <span className="multi-brand-switcher__name">
              {kit.name}
              {kit.id === deckKitId && <span className="multi-brand-switcher__badge">deck</span>}
              {kit.id === activeSlideKitId && <span className="multi-brand-switcher__badge multi-brand-switcher__badge--slide">slide</span>}
            </span>
          </button>
        ))}
      </div>

      <footer className="multi-brand-switcher__footer">
        <button
          type="button"
          className="multi-brand-switcher__apply"
          onClick={() => onSlideKitChange(selectedKitId)}
          disabled={readOnly || !selectedKit}
          data-testid="multi-brand-apply"
        >
          Apply to slide
        </button>
        <button
          type="button"
          className="multi-brand-switcher__edit"
          onClick={handleEdit}
          disabled={readOnly || !selectedKit}
          data-testid="multi-brand-edit"
        >
          Edit kit…
        </button>
      </footer>

      {editingDraft && selectedKit && (
        <div className="multi-brand-switcher__dialog" role="dialog" aria-modal="true">
          <div className="multi-brand-switcher__dialog-backdrop" onClick={() => setEditingDraft(null)} />
          <div className="multi-brand-switcher__dialog-panel">
            <h4>Edit {selectedKit.name}</h4>
            <label>
              <span>Name</span>
              <input
                type="text"
                value={editingDraft.name}
                onChange={(e) => setEditingDraft({ ...editingDraft, name: e.target.value })}
                data-testid="multi-brand-edit-name"
              />
            </label>
            <label>
              <span>Primary</span>
              <input
                type="color"
                value={editingDraft.primary}
                onChange={(e) => setEditingDraft({ ...editingDraft, primary: e.target.value })}
                data-testid="multi-brand-edit-primary"
              />
            </label>
            <label>
              <span>Accent</span>
              <input
                type="color"
                value={editingDraft.accent}
                onChange={(e) => setEditingDraft({ ...editingDraft, accent: e.target.value })}
                data-testid="multi-brand-edit-accent"
              />
            </label>
            <div className="multi-brand-switcher__dialog-actions">
              <button type="button" onClick={() => setEditingDraft(null)}>Cancel</button>
              <button type="button" onClick={handleSaveEdit} data-testid="multi-brand-edit-save">
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

/**
 * Convenience: pull a live list from the service.
 */
export function useBrandKitsList(): { kits: readonly BrandKitDetail[]; reload: () => void } {
  const [kits, setKits] = useState<readonly BrandKitDetail[]>([]);
  const reload = useCallback(() => {
    fetchBrandKits().then(setKits).catch(() => setKits([]));
  }, []);
  useEffect(() => {
    reload();
  }, [reload]);
  return { kits, reload };
}
