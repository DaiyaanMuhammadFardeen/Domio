'use client';

/**
 * EditorRoot — client-side shell that mounts the layers panel, history
 * panel, command palette, context menu, sync indicator, and presence
 * ping for the example deck. See docs/development_phases/phase-03 §F.
 *
 * The actual canvas renderer is a thin wrapper that renders an SVG
 * stand-in: the full WebGL2/WebGPU stack is loaded dynamically inside
 * the canvas package. This keeps the boot page deterministic so the
 * editor panels can be tested headlessly.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import type { DeckDocument, Element, Slide, ULID } from '@domio/schema/generated/scene-graph';
import {
  HistoryEngine,
  LocalPingAdapter,
  ShortcutRegistry,
  toggleFlag,
  reorderOp,
  addElementOp,
  removeElementOp,
  propEditOp,
  variantChangeOp,
  filterOp,
} from '@domio/canvas';
import type { HistoryEntry, CrossFilter } from '@domio/canvas';
import { getComponent, expandComponent, type DomioComponentDef } from '@domio/components';
import { LayersPanel } from '../panels/LayersPanel';
import { HistoryPanel } from '../panels/HistoryPanel';
import { InsertPanel } from '../panels/InsertPanel';
import { PropsPanel } from '../panels/PropsPanel';
import { CommandPalette } from '../panels/CommandPalette';
import { ContextMenu, contextMenuFor, type ContextMenuItem } from '../panels/ContextMenu';
import { SyncIndicator } from '../components/SyncIndicator';
import { LocalPing } from '../components/LocalPing';
import { ElementSvg } from '../components/ElementSvg';
import { createAutosaveFacade, type AutosaveFacade } from '../lib/autosave';
import { makeComponentLayer } from '../lib/componentLayer';
import { PromoteDialog } from '../panels/promote-dialog';
import { LibraryPanel } from '../panels/library-panel';
import { StickersPanel } from '../panels/stickers-panel';
import { IconPicker } from '../panels/icon-picker';
import { ThemeBrandPanel, type PaletteOverride, type ColorScheme } from '../panels/theme-brand-panel';
import { DataSourcePanel } from '../panels/data-source-panel';
import { FiltersPanel } from '../panels/filters-panel';
import { ScenarioSwitcher } from '../panels/scenario-switcher';
import { AnimationsPanel } from '../panels/animations-panel';
import type { LayerTimeline, SlideTransition, ReducedMotionPolicy } from '@domio/canvas';
import { timelineOp, transitionOp, magicMoveOp, reducedMotionOp } from '@domio/canvas';
import type { A11yAuditFinding } from '../lib/theme-audit';
import { addToLibrary } from '../lib/library';

export interface EditorRootProps {
  doc: DeckDocument;
}

interface CommandDescriptor {
  id: string;
  label: string;
  description?: string;
  category?: string;
  chord: string;
  run: () => void;
}

const PHASE_07_THEMES = [
  { id: 'theme-acme-light', name: 'Acme Light', scheme: 'light' as const },
  { id: 'theme-acme-dark', name: 'Acme Dark', scheme: 'dark' as const },
  { id: 'theme-neutral', name: 'Neutral Studio', scheme: 'light' as const },
] as const;

const PHASE_07_BRAND_KITS = [
  { id: 'brand-acme', name: 'Acme Coffee', primaryHex: '#33180c', accentHex: '#aa3a14' },
  { id: 'brand-domio', name: 'Domio', primaryHex: '#0a0e14', accentHex: '#58a6ff' },
] as const;

const SAMPLE_A11Y_FINDINGS: readonly A11yAuditFinding[] = [
  {
    severity: 'WARN',
    tokenId: 'color.content.muted',
    issue: 'AAA contrast is below 7:1 on surface.base',
    suggestion: 'color.content.primary',
  },
];

export function EditorRoot({ doc }: EditorRootProps): ReactElement {
  const [deck, setDeck] = useState<DeckDocument>(doc);
  const [selectedIds, setSelectedIds] = useState<Set<ULID>>(new Set());
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    items: ContextMenuItem[];
  } | null>(null);
  const [activeSlideId, setActiveSlideId] = useState<ULID>(
    doc.slides[0]?.id ?? ('' as ULID),
  );
  const [leftTab, setLeftTab] = useState<
    'layers' | 'insert' | 'library' | 'stickers' | 'icons' | 'theme-brand' | 'data-sources' | 'filters' | 'animations'
  >('layers');
  const [selectedDataSourceId, setSelectedDataSourceId] = useState<string | null>(null);
  const [promoteOpen, setPromoteOpen] = useState(false);
  const [activeThemeId, setActiveThemeId] = useState<string>('theme-acme-light');
  const [activeBrandKitId, setActiveBrandKitId] = useState<string>('brand-acme');
  const [colorScheme, setColorScheme] = useState<ColorScheme>('light');
  const [overrides, setOverrides] = useState<Record<string, PaletteOverride>>({});
  const [a11yFindings, setA11yFindings] = useState<readonly A11yAuditFinding[]>([]);
  const [isAuditing, setIsAuditing] = useState(false);
  const [crossFilters, setCrossFilters] = useState<CrossFilter[]>([]);

  // P09 animation state
  const [copiedAnimation, setCopiedAnimation] = useState<LayerTimeline | null>(null);
  const [deckReducedMotion, setDeckReducedMotion] = useState<ReducedMotionPolicy | null>(null);

  const pingRef = useRef<HTMLDivElement>(null);
  const pingAdapter = useMemo(() => new LocalPingAdapter(), []);

  // Constructed once from the initial doc: `apply()` mutates engine state
  // and returns the next doc, so a per-deck `useMemo` would wipe undo/redo
  // history on every edit.
  const [engine] = useState(() => new HistoryEngine(deck));
  const [historyEntries, setHistoryEntries] = useState<{
    past: ReadonlyArray<HistoryEntry>;
    future: ReadonlyArray<HistoryEntry>;
  }>({ past: [], future: [] });

  const [autosave] = useState<AutosaveFacade>(() => createAutosaveFacade());

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen(true);
      } else if (meta && e.shiftKey && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        pingAdapter.emit({ x: 400, y: 300 });
      } else if (meta && !e.shiftKey && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        const next = engine.undo();
        if (next) setDeck(next);
      } else if (meta && e.shiftKey && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        const next = engine.redo();
        if (next) setDeck(next);
      } else if (e.key === 'Escape') {
        setSelectedIds(new Set());
      }
    };
    globalThis.document.addEventListener('keydown', onKey);
    return () => globalThis.document.removeEventListener('keydown', onKey);
  }, [engine, pingAdapter]);

  useEffect(() => {
    const listener = () => {
      setHistoryEntries({
        past: engine.pastEntries(),
        future: engine.futureEntries(),
      });
    };
    engine.onEvent(listener);
    listener();
    return () => {
      // engine does not currently expose off(); noop cleanup.
    };
  }, [engine]);

  const commands = useMemo<CommandDescriptor[]>(() => {
    return [
      {
        id: 'undo',
        label: 'Undo',
        chord: 'Cmd+Z',
        category: 'Edit',
        run: () => {
          const next = engine.undo();
          if (next) setDeck(next);
        },
      },
      {
        id: 'redo',
        label: 'Redo',
        chord: 'Cmd+Shift+Z',
        category: 'Edit',
        run: () => {
          const next = engine.redo();
          if (next) setDeck(next);
        },
      },
      {
        id: 'open-palette',
        label: 'Open Command Palette',
        chord: 'Cmd+K',
        category: 'View',
        run: () => setPaletteOpen(true),
      },
      {
        id: 'send-ping',
        label: 'Send Ping',
        chord: 'Cmd+Shift+P',
        category: 'Presence',
        run: () => pingAdapter.emit({ x: 400, y: 300 }),
      },
    ];
  }, [engine, pingAdapter]);

  const shortcuts = useMemo(() => {
    const reg = new ShortcutRegistry();
    const out: {
      id: string;
      label: string;
      chord: string;
      category?: string;
      description?: string;
    }[] = [];
    for (const cmd of commands) {
      const regResult = reg.register({
        id: cmd.id,
        label: cmd.label,
        chord: cmd.chord,
        ...(cmd.category ? { category: cmd.category } : {}),
        ...(cmd.description ? { description: cmd.description } : {}),
      });
      if (regResult.ok) {
        out.push({
          id: cmd.id,
          label: cmd.label,
          chord: cmd.chord,
          ...(cmd.category ? { category: cmd.category } : {}),
          ...(cmd.description ? { description: cmd.description } : {}),
        });
      }
    }
    return out;
  }, [commands]);

  const activeSlide = deck.slides.find((s) => s.id === activeSlideId);

  const handleSelect = useCallback(
    (id: ULID, modifiers: { shift: boolean; alt: boolean }) => {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (modifiers.shift) {
          if (next.has(id)) next.delete(id);
          else next.add(id);
        } else if (modifiers.alt) {
          next.delete(id);
        } else {
          next.clear();
          next.add(id);
        }
        return next;
      });
    },
    [],
  );

  const handleToggleFlag = useCallback(
    (id: ULID, flag: 'locked' | 'hidden') => {
      const next = toggleFlag(deck, id, flag);
      setDeck(next);
      autosave.enqueue(`flag-${id}-${flag}`, { id, flag });
    },
    [deck, autosave],
  );

  const handleReorder = useCallback(
    (sourceId: ULID, targetId: ULID, place: 'before' | 'after') => {
      const slide = deck.slides.find((s) => s.id === activeSlideId);
      if (!slide) return;
      const targetEl = slide.elements.find((el) => el.id === targetId);
      const sourceEl = slide.elements.find((el) => el.id === sourceId);
      if (!targetEl || !sourceEl) return;
      const targetZ = (targetEl.z ?? 0) + (place === 'after' ? 1 : -1);
      const op = reorderOp(
        [{ id: sourceId, fromZ: sourceEl.z ?? 0, toZ: targetZ, fromParent: sourceEl.parentId, toParent: sourceEl.parentId }],
        Date.now(),
      );
      setDeck(engine.apply(op));
      autosave.enqueue(`reorder-${sourceId}`, op);
    },
    [deck, activeSlideId, engine, autosave],
  );

  // Gather selected elements for context menu / promote
  const selectedElements = useMemo(() => {
    if (selectedIds.size === 0) return [];
    const slide = deck.slides.find((s) => s.id === activeSlideId);
    if (!slide) return [];
    return slide.elements.filter((el) => selectedIds.has(el.id));
  }, [selectedIds, deck, activeSlideId]);

  const isComponentSelected = useMemo(() => {
    return selectedElements.length === 1 && selectedElements[0]?.type === 'component';
  }, [selectedElements]);

  const onContextMenu = useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault();
      const kind = selectedIds.size === 0 ? 'selection' : 'frame';
      setContextMenu({
        x: event.clientX,
        y: event.clientY,
        items: contextMenuFor(kind, {
          hasSelection: selectedIds.size > 0,
          isComponent: isComponentSelected,
        }),
      });
    },
    [selectedIds, isComponentSelected],
  );

  const selectedComponent = useMemo(() => {
    if (selectedIds.size !== 1) return undefined;
    const id = [...selectedIds][0];
    const slide = deck.slides.find((s) => s.id === activeSlideId);
    const el = slide?.elements.find((e) => e.id === id);
    return el?.type === 'component' ? el : undefined;
  }, [selectedIds, deck, activeSlideId]);

  const handleInsertComponent = useCallback(
    (catalogId: string) => {
      const slide = deck.slides.find((s) => s.id === activeSlideId);
      const def = getComponent(catalogId);
      if (!slide || !def) return;
      const layer = makeComponentLayer(def);
      const op = addElementOp([layer], slide.id, Date.now());
      setDeck(engine.apply(op));
      setSelectedIds(new Set([layer.id]));
      setLeftTab('layers');
      autosave.enqueue(`insert-${layer.id}`, op);
    },
    [deck, activeSlideId, engine, autosave],
  );

  const handleInsertIcon = useCallback(
    (iconId: string, color: string) => {
      const slide = deck.slides.find((s) => s.id === activeSlideId);
      const def = getComponent('domio.icon');
      if (!slide || !def) return;
      const layer = makeComponentLayer(def);
      layer.component.props = { iconId, color, size: 48, label: '' };
      const op = addElementOp([layer], slide.id, Date.now());
      setDeck(engine.apply(op));
      setSelectedIds(new Set([layer.id]));
      autosave.enqueue(`insert-icon-${layer.id}`, op);
    },
    [deck, activeSlideId, engine, autosave],
  );

  const handlePropEdit = useCallback(
    (key: string, from: unknown, to: unknown) => {
      if (!selectedComponent) return;
      const op = propEditOp([{ id: selectedComponent.id, key, from, to }], Date.now());
      setDeck(engine.apply(op));
      autosave.enqueue(`prop-${selectedComponent.id}-${key}`, op);
    },
    [selectedComponent, engine, autosave],
  );

  const handleVariantChange = useCallback(
    (from: string, to: string) => {
      if (!selectedComponent) return;
      const op = variantChangeOp([{ id: selectedComponent.id, from, to }], Date.now());
      setDeck(engine.apply(op));
      autosave.enqueue(`variant-${selectedComponent.id}`, op);
    },
    [selectedComponent, engine, autosave],
  );

  // Promote: save to library + optionally replace selection
  const handlePromote = useCallback(
    (def: DomioComponentDef, replaceSelection: boolean) => {
      // Save to localStorage library
      addToLibrary({
        catalogId: def.catalogId,
        name: def.name,
        version: def.version,
        pinMode: 'track',
        pinValue: '',
      });

      if (!replaceSelection) return;

      const slide = deck.slides.find((s) => s.id === activeSlideId);
      if (!slide) return;

      // Build the component layer
      const layer = makeComponentLayer(def);
      const removeOp = removeElementOp(selectedElements, slide.id, Date.now());
      let next = engine.apply(removeOp);
      const addOp = addElementOp([layer], slide.id, Date.now());
      next = engine.apply(addOp);
      setDeck(next);
      setSelectedIds(new Set([layer.id]));
      autosave.enqueue(`promote-${layer.id}`, addOp);
    },
    [deck, activeSlideId, selectedElements, engine, autosave],
  );

  // Context menu action handler
  const handleContextMenuAction = useCallback(
    (id: string) => {
      if (id === 'promote') {
        setPromoteOpen(true);
        return;
      }
      if (id === 'detach' && selectedComponent) {
        const slide = deck.slides.find((s) => s.id === activeSlideId);
        if (!slide) return;
        const expanded = expandComponent(selectedComponent);
        // Remove the component, add expanded children
        const removeOp = removeElementOp([selectedComponent], slide.id, Date.now());
        let next = engine.apply(removeOp);
        const addOp = addElementOp(expanded, slide.id, Date.now());
        next = engine.apply(addOp);
        setDeck(next);
        setSelectedIds(new Set());
        autosave.enqueue(`detach-${selectedComponent.id}`, addOp);
      }
    },
    [selectedComponent, deck, activeSlideId, engine, autosave],
  );

  const handleThemeChange = useCallback(
    (themeId: string) => {
      setActiveThemeId(themeId);
      const theme = PHASE_07_THEMES.find((t) => t.id === themeId);
      if (theme) setColorScheme(theme.scheme);
      autosave.enqueue(`theme-${themeId}`, {
        type: 'theme.applied',
        themeId,
        deckId: deck.id,
        createdAt: Date.now(),
      });
    },
    [autosave, deck.id],
  );

  const handleBrandKitChange = useCallback(
    (brandKitId: string) => {
      setActiveBrandKitId(brandKitId);
      autosave.enqueue(`brand-${brandKitId}`, {
        type: 'brand.context_changed',
        brandKitId,
        deckId: deck.id,
        createdAt: Date.now(),
      });
    },
    [autosave, deck.id],
  );

  const handleSchemeToggle = useCallback(
    (next: ColorScheme) => {
      setColorScheme(next);
      const matching = PHASE_07_THEMES.find((t) => t.scheme === next && t.id.includes('acme'));
      if (matching) setActiveThemeId(matching.id);
      autosave.enqueue(`scheme-${next}`, {
        type: 'theme.color_scheme_changed',
        scheme: next,
        deckId: deck.id,
        createdAt: Date.now(),
      });
    },
    [autosave, deck.id],
  );

  const handleOverrideChange = useCallback(
    (next: PaletteOverride | null) => {
      setOverrides((current) => {
        const updated = { ...current };
        if (next) updated[activeSlideId] = next;
        else delete updated[activeSlideId];
        return updated;
      });
      autosave.enqueue(`theme-override-${activeSlideId}`, {
        type: 'theme.override_set',
        slideId: activeSlideId,
        override: next,
        createdAt: Date.now(),
      });
    },
    [activeSlideId, autosave],
  );

  const handleA11yAudit = useCallback(() => {
    setIsAuditing(true);
    // Phase 13 transport will replace this local deterministic preview
    // with `token.audit_a11y` from the brand-aware MCP surface.
    queueMicrotask(() => {
      setA11yFindings(SAMPLE_A11Y_FINDINGS);
      setIsAuditing(false);
    });
  }, []);

  const handleFilterChange = useCallback(
    (newFilters: CrossFilter[]) => {
      const prev = crossFilters;
      setCrossFilters(newFilters);
      // Commit via FilterOp on all components that listen to filters
      const slide = deck.slides.find((s) => s.id === activeSlideId);
      if (!slide) return;
      for (const el of slide.elements) {
        if (el.type !== 'component') continue;
        const binding = (el.component.props ?? {})['x-domio:binding'] as { listenToFilters?: string[] } | undefined;
        if (!binding?.listenToFilters?.length) continue;
        const op = filterOp(el.id, newFilters, prev, Date.now());
        setDeck(engine.apply(op));
      }
    },
    [crossFilters, deck, activeSlideId, engine],
  );

  // P09: Timeline change handler
  const handleTimelineChange = useCallback(
    (timeline: LayerTimeline | null) => {
      if (!selectedComponent) return;
      const prevTimeline = (selectedComponent.component.props ?? {})['x-domio:timeline'] as LayerTimeline | null | undefined;
      const op = timelineOp(selectedComponent.id, timeline, prevTimeline ?? null, Date.now());
      setDeck(engine.apply(op));
      autosave.enqueue(`timeline-${selectedComponent.id}`, op);
    },
    [selectedComponent, engine, autosave],
  );

  // P09: Transition change handler
  const handleTransitionChange = useCallback(
    (transition: SlideTransition | null) => {
      const slide = deck.slides.find((s) => s.id === activeSlideId);
      if (!slide) return;
      const prevTransition = (slide as unknown as Record<string, unknown>)['x-domio:transition'] as SlideTransition | null | undefined;
      const op = transitionOp(activeSlideId, transition, prevTransition ?? null, Date.now());
      setDeck(engine.apply(op));
      autosave.enqueue(`transition-${activeSlideId}`, op);
    },
    [deck, activeSlideId, engine, autosave],
  );

  // P09: Magic move role change handler
  const handleMagicRoleChange = useCallback(
    (role: string | null) => {
      if (!selectedComponent) return;
      const prevRole = (selectedComponent as unknown as Record<string, unknown>)['element_role'] as string | null | undefined;
      const op = magicMoveOp(selectedComponent.id, role, prevRole ?? null, Date.now());
      setDeck(engine.apply(op));
      autosave.enqueue(`magic-${selectedComponent.id}`, op);
    },
    [selectedComponent, engine, autosave],
  );

  // P09: Reduced motion handler
  const handleReducedMotionChange = useCallback(
    (policy: ReducedMotionPolicy | null) => {
      const prevPolicy = (deck as unknown as Record<string, unknown>)['x-domio:reduced-motion'] as ReducedMotionPolicy | null | undefined;
      const op = reducedMotionOp(policy, prevPolicy ?? null, Date.now());
      setDeck(engine.apply(op));
      setDeckReducedMotion(policy);
      autosave.enqueue(`reduced-motion`, op);
    },
    [deck, engine, autosave],
  );

  // P09: Copy animation
  const handleCopyAnimation = useCallback(() => {
    if (!selectedComponent) return;
    const timeline = (selectedComponent.component.props ?? {})['x-domio:timeline'] as LayerTimeline | null;
    setCopiedAnimation(timeline ? { ...timeline } : null);
  }, [selectedComponent]);

  // P09: Paste animation
  const handlePasteAnimation = useCallback(() => {
    if (!selectedComponent || !copiedAnimation) return;
    const prevTimeline = (selectedComponent.component.props ?? {})['x-domio:timeline'] as LayerTimeline | null | undefined;
    const pasted = { ...copiedAnimation, id: `tl-${Date.now()}` };
    const op = timelineOp(selectedComponent.id, pasted, prevTimeline ?? null, Date.now());
    setDeck(engine.apply(op));
    autosave.enqueue(`paste-timeline-${selectedComponent.id}`, op);
  }, [selectedComponent, copiedAnimation, engine, autosave]);

  return (
    <div className="editor-root">
      <header className="editor-toolbar" onContextMenu={onContextMenu}>
        <div className="editor-toolbar__brand">Domio · {deck.title}</div>
        <nav className="editor-toolbar__slides">
          {deck.slides.map((slide) => (
            <button
              key={slide.id}
              type="button"
              className={`slide-tab${slide.id === activeSlideId ? ' is-active' : ''}`}
              onClick={() => setActiveSlideId(slide.id)}
            >
              {slide.title ?? `Slide ${slide.position + 1}`}
            </button>
          ))}
        </nav>
        <div className="editor-toolbar__right">
          {selectedIds.size > 0 && !isComponentSelected && (
            <button
              type="button"
              className="toolbar-btn"
              onClick={() => setPromoteOpen(true)}
            >
              Promote
            </button>
          )}
          <button
            type="button"
            className="toolbar-insert"
            onClick={() => setLeftTab(leftTab === 'insert' ? 'layers' : 'insert')}
          >
            + Insert
          </button>
          <ScenarioSwitcher />
          <SyncIndicator facade={autosave} />
        </div>
      </header>
      <main className="editor-body">
        <aside className="editor-side editor-side--left">
          <div className="side-tabs" role="tablist" aria-label="Left panel">
            <button
              type="button"
              role="tab"
              aria-selected={leftTab === 'layers'}
              className={`side-tab${leftTab === 'layers' ? ' is-active' : ''}`}
              onClick={() => setLeftTab('layers')}
            >
              Layers
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={leftTab === 'insert'}
              className={`side-tab${leftTab === 'insert' ? ' is-active' : ''}`}
              onClick={() => setLeftTab('insert')}
            >
              Insert
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={leftTab === 'library'}
              className={`side-tab${leftTab === 'library' ? ' is-active' : ''}`}
              onClick={() => setLeftTab('library')}
            >
              Library
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={leftTab === 'stickers'}
              className={`side-tab${leftTab === 'stickers' ? ' is-active' : ''}`}
              onClick={() => setLeftTab('stickers')}
            >
              Stickers
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={leftTab === 'icons'}
              className={`side-tab${leftTab === 'icons' ? ' is-active' : ''}`}
              onClick={() => setLeftTab('icons')}
            >
              Icons
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={leftTab === 'theme-brand'}
              className={`side-tab${leftTab === 'theme-brand' ? ' is-active' : ''}`}
              onClick={() => setLeftTab('theme-brand')}
            >
              Theme
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={leftTab === 'data-sources'}
              className={`side-tab${leftTab === 'data-sources' ? ' is-active' : ''}`}
              onClick={() => setLeftTab('data-sources')}
              data-testid="p08-data-tab"
            >
              Data
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={leftTab === 'filters'}
              className={`side-tab${leftTab === 'filters' ? ' is-active' : ''}`}
              onClick={() => setLeftTab('filters')}
              data-testid="p08-filters-tab"
            >
              Filters
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={leftTab === 'animations'}
              className={`side-tab${leftTab === 'animations' ? ' is-active' : ''}`}
              onClick={() => setLeftTab('animations')}
              data-testid="p09-animations-tab"
            >
              Animations
            </button>
          </div>
          {leftTab === 'layers'
            ? activeSlide
              ? (
                  <LayersPanel
                    slide={activeSlide}
                    selectedIds={selectedIds}
                    onSelect={handleSelect}
                    onReorder={handleReorder}
                    onToggleFlag={handleToggleFlag}
                  />
                )
              : null
            : leftTab === 'insert'
              ? <InsertPanel onInsert={handleInsertComponent} />
              : leftTab === 'library'
                ? <LibraryPanel onInsert={handleInsertComponent} />
                : leftTab === 'stickers'
                  ? <StickersPanel onInsert={handleInsertComponent} />
                  : leftTab === 'icons'
                    ? <IconPicker onInsert={handleInsertIcon} />
                    : leftTab === 'data-sources'
                      ? (
                          <DataSourcePanel
                            selectedSourceId={selectedDataSourceId}
                            onSelectSource={setSelectedDataSourceId}
                          />
                        )
                      : leftTab === 'filters'
                      ? (
                          <FiltersPanel
                            filters={crossFilters}
                            onChange={handleFilterChange}
                          />
                        )
                      : leftTab === 'animations'
                        ? (
                            <AnimationsPanel
                              timeline={
                                selectedComponent
                                  ? ((selectedComponent.component.props ?? {})['x-domio:timeline'] as LayerTimeline | null) ?? null
                                  : null
                              }
                              onTimelineChange={handleTimelineChange}
                              transition={
                                activeSlide
                                  ? ((activeSlide as unknown as Record<string, unknown>)['x-domio:transition'] as SlideTransition | null) ?? null
                                  : null
                              }
                              onTransitionChange={handleTransitionChange}
                              magicRole={
                                selectedComponent
                                  ? ((selectedComponent as unknown as Record<string, unknown>)['element_role'] as string | null) ?? null
                                  : null
                              }
                              onMagicRoleChange={handleMagicRoleChange}
                              hasMatchingRole={false}
                              reducedMotion={deckReducedMotion}
                              onReducedMotionChange={handleReducedMotionChange}
                              copiedAnimation={copiedAnimation}
                              onCopy={handleCopyAnimation}
                              onPaste={handlePasteAnimation}
                            />
                          )
                        : (
                        <ThemeBrandPanel
                          themes={PHASE_07_THEMES}
                          activeThemeId={activeThemeId}
                          onThemeChange={handleThemeChange}
                          brandKits={PHASE_07_BRAND_KITS}
                          activeBrandKitId={activeBrandKitId}
                          onBrandKitChange={handleBrandKitChange}
                          colorScheme={colorScheme}
                          onSchemeToggle={handleSchemeToggle}
                          override={overrides[activeSlideId] ?? null}
                          onOverrideChange={handleOverrideChange}
                          a11yFindings={a11yFindings}
                          onAudit={handleA11yAudit}
                          isAuditing={isAuditing}
                          slideId={activeSlideId}
                        />
                      )}
        </aside>
        <section className="editor-canvas" ref={pingRef as React.RefObject<HTMLDivElement>}>
          <LocalPing adapter={pingAdapter} container={pingRef as React.RefObject<HTMLElement>} />
          {activeSlide ? <SlidePreview slide={activeSlide} /> : null}
        </section>
        <aside className="editor-side editor-side--right">
          {selectedComponent ? (
            <PropsPanel
              element={selectedComponent}
              onPropEdit={handlePropEdit}
              onVariantChange={handleVariantChange}
            />
          ) : null}
          <HistoryPanel
            past={historyEntries.past}
            future={historyEntries.future}
            onUndo={() => {
              const next = engine.undo();
              if (next) setDeck(next);
            }}
            onRedo={() => {
              const next = engine.redo();
              if (next) setDeck(next);
            }}
            onScrub={(idx) => {
              const next = engine.previewAt(idx);
              if (next) setDeck(next);
            }}
          />
        </aside>
      </main>
      <CommandPalette
        open={paletteOpen}
        shortcuts={shortcuts}
        onInvoke={(s) => {
          const cmd = commands.find((c) => c.id === s.id);
          cmd?.run();
          setPaletteOpen(false);
        }}
        onClose={() => setPaletteOpen(false)}
      />
      {contextMenu ? (
        <ContextMenu
          open
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenu.items}
          onSelect={handleContextMenuAction}
          onClose={() => setContextMenu(null)}
        />
      ) : null}
      <PromoteDialog
        open={promoteOpen}
        elements={selectedElements}
        onClose={() => setPromoteOpen(false)}
        onPromote={handlePromote}
      />
    </div>
  );
}

interface SlidePreviewProps {
  slide: Slide;
}

function SlidePreview({ slide }: SlidePreviewProps): ReactElement {
  const sorted = [...slide.elements]
    .filter(
      (el): el is Element & { transform: NonNullable<Element['transform']> } =>
        Boolean(el.transform),
    )
    .sort((a, b) => (a.z ?? 0) - (b.z ?? 0));
  return (
    <svg
      className="slide-preview"
      viewBox="0 0 1600 900"
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label={slide.title ?? 'Slide'}
    >
      <rect width="1600" height="900" fill="var(--bg)" />
      {sorted.map((el) => (
        <ElementSvg key={el.id} element={el} />
      ))}
    </svg>
  );
}
