'use client';

/**
 * EditorRoot — client-side shell that mounts the layers panel, history
 * panel, command palette, context menu, sync indicator, presence ping,
 * and the canvas chrome (rulers, guides, grid, zoom HUD, group
 * transform handle) for the example deck.
 *
 * Wave 2.1 refactor:
 *  - All UI state lives in `apps/editor/src/store/editor-store.ts`
 *    (Zustand). Read via `useEditorStore`; mutate via
 *    `store/handlers.ts`.
 *  - Every editor action flows through `engine-bridge.applyOp(op)` —
 *    HistoryEngine, CRDT sync, and autosave are the only collaborators
 *    that know the deck layout.
 *  - Keyboard shortcuts come from `editor-shortcuts.ts` and are
 *    dispatched through `useEditorShortcuts`. The bare keydown
 *    `useEffect` is gone.
 *  - The canvas chrome (Rulers / Guides / GridOverlay / ZoomHUD /
 *    GroupTransformHandle) is mounted inside the canvas section so
 *    Phase S2.1 lands in this commit.
 *
 * EditorRoot is intentionally a thin wiring layer. Adding a new panel
 * does NOT require touching this file.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import type { DeckDocument, Element, Slide, ULID } from '@domio/schema/generated/scene-graph';
import { HistoryEngine, LocalPingAdapter } from '@domio/canvas';

import { HistoryPanel } from '../panels/HistoryPanel';
import { PropsPanel } from '../panels/PropsPanel';
import { CommandPalette } from '../panels/CommandPalette';
import { ContextMenu, contextMenuFor, type ContextMenuItem } from '../panels/ContextMenu';
import { SyncIndicator } from './SyncIndicator';
import { LocalPing } from './LocalPing';
import { ElementSvg } from './ElementSvg';
import { createAutosaveFacade, type AutosaveFacade } from '../lib/autosave';
import { PromoteDialog } from '../panels/promote-dialog';
import { ScenarioSwitcher } from '../panels/scenario-switcher';
import {
  ShareStateButton,
  type ShareStateButtonCurrentState,
} from './prototyping/ShareStateButton';
import { CommentPins } from '../collab/comment-pins';
import { ApprovalBanner } from '../collab/approval-banner';
import { AssignmentPanel } from '../collab/assignment-panel';

import {
  Rulers,
  Guides,
  GridOverlay,
  ZoomHUD,
  GroupTransformHandle,
  PanelRail,
  PanelFooter,
} from './canvas';
import { setEngineRef, snapshotHistory, onEngineEvent } from '../store/engine-bridge';
import { useEditorStore } from '../store/editor-store';
import {
  editorBootstrapBrandKits,
  editorBootstrapThemes,
  handleSetActiveSlide,
  handleSetLeftTab,
  handleSetPaletteOpen,
  handleSetPromoteOpen,
  handleClearSelection,
  handleOpenContextMenu,
  handleContextMenuSelected,
  handlePropEdit,
  handleVariantChange,
  handleUndo,
  handleRedo,
  handleScrubHistory,
  handleZoomFit,
  handleZoom100,
  handleZoom200,
  handleResetViewport,
  buildPanelHandlers,
  type PanelHandlersMap,
} from '../store/handlers';
import { useEditorShortcuts } from '../hooks/useEditorShortcuts';
import { useSelection } from '../hooks/useSelection';
import { useViewport } from '../hooks/useViewport';
import { useActiveSlide } from '../hooks/useActiveSlide';
import type { EditorShortcutBindings } from '../hooks/useEditorShortcuts';
import { editorPanels } from '../panels/registry';
import type { EditorPanelGroup } from '../panels/registry';
import type { EditorPanelContext } from '../panels/context';
import type { AuditEntryView } from './prototyping/agent/AuditTrail';

/** Actor ID placeholder — the control plane sets identity; this is a dev fallback. */
const ACTOR_ID: string =
  (typeof process !== 'undefined'
    ? (process.env.NEXT_PUBLIC_ACTOR_ID as string | undefined)
    : undefined) ?? 'actor-local';

const SLIDE_WIDTH = 1600;
const SLIDE_HEIGHT = 900;

export type EditorLeftTab = string;

/**
 * Editor panel groups — used by the two-tier rail introduced in
 * Wave 13 Phase C. Order matches the rendering order in the rail.
 */
const GROUPS: ReadonlyArray<{ id: EditorPanelGroup; label: string }> = [
  { id: 'core', label: 'Core' },
  { id: 'data', label: 'Data' },
  { id: 'interaction', label: 'Interaction' },
  { id: 'audience', label: 'Audience' },
  { id: 'agentic', label: 'Agentic' },
  { id: 'ai', label: 'AI' },
];

export interface EditorRootProps {
  doc: DeckDocument;
  /** Optional panel id from `?panel=…`. If valid, opens that panel on mount. */
  initialPanel?: string;
}

export function EditorRoot(props: EditorRootProps): ReactElement {
  const { doc } = props;

  // ---------------------------------------------------------------------
  // Store initialisation — seed the store synchronously on first
  // render so SSR + first client paint both see the deck. The Zustand
  // store is module-level; calling the setters during render is safe
  // and keeps `useState(doc)`-style initial seeding semantics without
  // a one-tick delay. The `useRef` gates re-seeding across re-renders.
  // ---------------------------------------------------------------------
  const seededRef = useRef(false);
  if (!seededRef.current) {
    useEditorStore.getState().setDeck(doc);
    useEditorStore.getState().setActiveSlideId(doc.slides[0]?.id ?? null);
    if (props.initialPanel) useEditorStore.getState().setLeftTab(props.initialPanel);
    seededRef.current = true;
  }

  const setDeck = useEditorStore((s) => s.setDeck);
  const setActiveSlideId = useEditorStore((s) => s.setActiveSlideId);
  const setLeftTab = useEditorStore((s) => s.setLeftTab);

  useEffect(() => {
    setDeck(doc);
    setActiveSlideId(doc.slides[0]?.id ?? null);
    if (props.initialPanel) setLeftTab(props.initialPanel);
  }, [doc, props.initialPanel, setDeck, setActiveSlideId, setLeftTab]);

  // ---------------------------------------------------------------------
  // Reactive store reads — these subscribe so the toolbar / panel
  // chrome updates when the underlying state changes. The `?? doc`
  // fallback is the SSR safety net: a Zustand selector returns the
  // value snapshotted when the hook first ran, which on the first
  // render is before the seed above executes. We fall back to the
  // prop so the SSR HTML reflects the deck.
  // ---------------------------------------------------------------------
  const deck = useEditorStore((s) => s.deck) ?? doc;
  const activeSlideId = useEditorStore((s) => s.activeSlideId) ?? doc.slides[0]?.id ?? null;
  const paletteOpen = useEditorStore((s) => s.paletteOpen);
  const contextMenu = useEditorStore((s) => s.contextMenu);
  const storeLeftTab = useEditorStore((s) => s.leftTab);
  // SSR fallback — when the store hasn't been seeded yet (the
  // selector still returns the default 'layers'), fall back to the
  // initialPanel prop so deep-links like `?panel=theme-brand`
  // render the right panel on first paint.
  const leftTab =
    storeLeftTab && storeLeftTab !== 'layers'
      ? storeLeftTab
      : (props.initialPanel ?? storeLeftTab ?? 'layers');
  const promoteOpen = useEditorStore((s) => s.promoteOpen);
  const auditEntries = useEditorStore((s) => s.auditEntries) as readonly AuditEntryView[];

  // ---------------------------------------------------------------------
  // HistoryEngine + autosave — instantiated once per editor session.
  // The engine bridge owns their references; handlers call
  // `applyOp` / `undo` / `redo` rather than touching either directly.
  // ---------------------------------------------------------------------
  const [engine] = useState(() => new HistoryEngine(doc));
  const [autosave] = useState<AutosaveFacade>(() => createAutosaveFacade());
  useEffect(() => {
    setEngineRef(engine);
  }, [engine]);

  // History panel entries — refresh on every engine event.
  const [historyEntries, setHistoryEntries] = useState(() => snapshotHistory());
  useEffect(() => {
    setHistoryEntries(snapshotHistory());
    return onEngineEvent(() => {
      setHistoryEntries(snapshotHistory());
    });
  }, [engine]);

  // ---------------------------------------------------------------------
  // Derived state — selection + active slide go through their hooks.
  // Pass the prop deck as a fallback so SSR / first render still
  // resolves the active slide before the store-seed useRef gate runs.
  // ---------------------------------------------------------------------
  const { slide: activeSlide } = useActiveSlide({
    fallbackDeck: doc,
    fallbackActiveId: doc.slides[0]?.id ?? null,
  });
  const {
    ids: selectedIds,
    elements: selectedElements,
    single: selectedComponent,
    isComponent: isComponentSelected,
  } = useSelection({ fallbackDeck: doc });

  // ---------------------------------------------------------------------
  // Shortcut bindings — every editor action goes through one of these.
  // `useEditorShortcuts` mounts the listener and dispatches.
  // ---------------------------------------------------------------------
  const pingAdapter = useMemo(() => new LocalPingAdapter(), []);
  const [pingContainer, setPingContainer] = useState<HTMLDivElement | null>(null);

  const bindings = useMemo<EditorShortcutBindings>(
    () => ({
      'open-palette': () => handleSetPaletteOpen(true),
      'send-ping': () => pingAdapter.emit({ x: 400, y: 300 }),
      'toggle-rulers': () => useEditorStore.getState().toggleRulers(),
      'toggle-grid': () => useEditorStore.getState().toggleGrid(),
      'toggle-snap': () => useEditorStore.getState().toggleSnap(),
      undo: () => handleUndo(),
      redo: () => handleRedo(),
      escape: () => handleClearSelection(),
      'fit-to-slide': () => handleZoomFit(SLIDE_WIDTH, SLIDE_HEIGHT),
      'zoom-100': () => handleZoom100(),
      'zoom-200': () => handleZoom200(),
      'reset-viewport': () => handleResetViewport(),
    }),
    [pingAdapter],
  );

  const { shortcuts: editorShortcuts } = useEditorShortcuts({ bindings });

  // ---------------------------------------------------------------------
  // Panel context — single shared shape every left-rail panel reads.
  // Built from store selectors + a single aggregated handler map so
  // adding a new panel does not require touching this file.
  // ---------------------------------------------------------------------
  const panelHandlers = useMemo(() => buildPanelHandlers(), []);
  const panelContext = useEditorPanelContext({
    selectedIds,
    selectedElements,
    selectedComponent,
    activeSlide,
    activeSlideId,
    auditEntries,
    fallbackDeck: doc,
    handlers: panelHandlers,
  });

  // ---------------------------------------------------------------------
  // Context menu — synthesised on the fly; no state lives here.
  // ---------------------------------------------------------------------
  const [contextMenuItems, setContextMenuItems] = useState<ContextMenuItem[]>([]);
  const onContextMenu = (event: React.MouseEvent) => {
    event.preventDefault();
    const kind = selectedIds.size === 0 ? 'selection' : 'frame';
    const items = contextMenuFor(kind, {
      hasSelection: selectedIds.size > 0,
      isComponent: isComponentSelected,
    });
    handleOpenContextMenu({ x: event.clientX, y: event.clientY, targetId: null });
    setContextMenuItems(items);
  };

  const handleInvokeShortcut = (s: { id: string }) => {
    const id = s.id as keyof EditorShortcutBindings;
    bindings[id]?.();
    handleSetPaletteOpen(false);
  };

  return (
    <div className="editor-root">
      <header className="editor-toolbar" onContextMenu={onContextMenu}>
        <div className="editor-toolbar__brand">Domio · {deck?.title ?? 'Untitled'}</div>
        <nav className="editor-toolbar__slides">
          {deck?.slides.map((slide) => (
            <button
              key={slide.id}
              type="button"
              className={`slide-tab${slide.id === activeSlideId ? ' is-active' : ''}`}
              onClick={() => handleSetActiveSlide(slide.id)}
            >
              {slide.title ?? `Slide ${slide.position + 1}`}
            </button>
          ))}
        </nav>
        <div className="editor-toolbar__right">
          {selectedIds.size > 0 && !isComponentSelected ? (
            <button
              type="button"
              className="toolbar-btn"
              onClick={() => handleSetPromoteOpen(true)}
            >
              Promote
            </button>
          ) : null}
          <button
            type="button"
            className="toolbar-insert"
            onClick={() => handleSetLeftTab(leftTab === 'insert' ? 'layers' : 'insert')}
          >
            + Insert
          </button>
          <ScenarioSwitcher />
          <ShareStateButton
            getState={buildShareState(deck?.id ?? '', activeSlideId)}
            audience="viewer"
          />
          <SyncIndicator facade={autosave} />
        </div>
      </header>
      <main className="editor-body">
        <aside className="editor-side editor-side--left">
          <PanelRail
            panels={editorPanels.list()}
            groups={GROUPS}
            activeId={leftTab}
            onSelect={(id) => handleSetLeftTab(id)}
          />
          {(() => {
            const panel = editorPanels.get(leftTab);
            if (!panel) return null;
            const C = panel.Component;
            return (
              <>
                <C {...panelContext} />
                <PanelFooter panelId={leftTab} />
              </>
            );
          })()}
        </aside>
        <section className="editor-canvas">
          <ApprovalBanner
            deckId={deck?.id ?? ''}
            slideId={activeSlideId ?? ('' as ULID)}
            currentActorId={ACTOR_ID}
          />
          <div className="editor-canvas__ping" ref={(el) => setPingContainer(el)} />
          <LocalPing
            adapter={pingAdapter}
            container={{ current: pingContainer } as React.RefObject<HTMLElement>}
          />
          {activeSlide ? <SlidePreview slide={activeSlide} /> : null}
          <CommentPins
            deckId={deck?.id ?? ''}
            slideId={activeSlideId ?? ('' as ULID)}
            currentActorId={ACTOR_ID}
          />
          {/* Canvas chrome — S2.1 surface. Mounted only when there is
              an active slide so overlays don't fight the empty state. */}
          {activeSlide ? <CanvasChromeOverlay /> : null}
          {/* Multi-selection bounding box — S2.3. */}
          {selectedElements.length > 0 && activeSlide ? (
            <GroupTransformHandle
              elements={selectedElements}
              slideWidth={SLIDE_WIDTH}
              slideHeight={SLIDE_HEIGHT}
            />
          ) : null}
          {/* Zoom HUD — bottom-left pill, persistent. */}
          {activeSlide ? (
            <ZoomHUD
              slideWidth={SLIDE_WIDTH}
              slideHeight={SLIDE_HEIGHT}
              viewportWidth={typeof window !== 'undefined' ? window.innerWidth : 1280}
              viewportHeight={typeof window !== 'undefined' ? window.innerHeight : 720}
            />
          ) : null}
        </section>
        <aside className="editor-side editor-side--right">
          <AssignmentPanel
            deckId={deck?.id ?? ''}
            slidePosition={activeSlide?.position ?? 0}
            currentActorId={ACTOR_ID}
          />
          {selectedComponent && selectedComponent.type === 'component' ? (
            <PropsPanel
              element={selectedComponent}
              onPropEdit={(key, from, to) => handlePropEdit(key, from, to)}
              onVariantChange={(from, to) => handleVariantChange(from, to)}
            />
          ) : null}
          <HistoryPanel
            past={historyEntries.past}
            future={historyEntries.future}
            onUndo={() => handleUndo()}
            onRedo={() => handleRedo()}
            onScrub={(idx) => handleScrubHistory(idx)}
          />
        </aside>
      </main>
      <CommandPalette
        open={paletteOpen}
        shortcuts={editorShortcuts as unknown as readonly never[]}
        onInvoke={(s) => handleInvokeShortcut(s as { id: string })}
        onClose={() => handleSetPaletteOpen(false)}
      />
      {contextMenu ? (
        <ContextMenu
          open
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenuItems}
          onSelect={(id) => handleContextMenuSelected(id)}
          onClose={() => handleOpenContextMenu(null)}
        />
      ) : null}
      <PromoteDialog
        open={promoteOpen}
        elements={[...selectedElements]}
        onClose={() => handleSetPromoteOpen(false)}
        onPromote={(def, replace) => panelHandlers.onPromote(def, replace)}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers — kept here so the main component stays readable.
// ---------------------------------------------------------------------------

function CanvasChromeOverlay(): ReactElement {
  const showRulers = useEditorStore((s) => s.showRulers);
  const showGrid = useEditorStore((s) => s.showGrid);
  const viewportW = typeof window !== 'undefined' ? window.innerWidth : 1280;
  const viewportH = typeof window !== 'undefined' ? window.innerHeight : 720;
  return (
    <>
      {showRulers ? (
        <Rulers
          slideWidth={SLIDE_WIDTH}
          slideHeight={SLIDE_HEIGHT}
          viewportWidth={viewportW}
          viewportHeight={viewportH}
        />
      ) : null}
      {showGrid ? <GridOverlay slideWidth={SLIDE_WIDTH} slideHeight={SLIDE_HEIGHT} /> : null}
      <Guides slideWidth={SLIDE_WIDTH} slideHeight={SLIDE_HEIGHT} />
    </>
  );
}

interface PanelContextInputs {
  selectedIds: ReadonlySet<ULID>;
  selectedElements: readonly Element[];
  selectedComponent: Element | undefined;
  activeSlide: Slide | undefined;
  activeSlideId: ULID | null;
  auditEntries: readonly AuditEntryView[];
  fallbackDeck: DeckDocument;
  handlers: PanelHandlersMap;
}

/**
 * Build the single shared panel context the registry feeds into every
 * left-rail panel. Pulled into a hook so the EditorRoot render path
 * stays flat.
 *
 * `fallbackDeck` covers the SSR case where `useEditorStore.getState()`
 * runs synchronously inside `useMemo` before the parent has had a
 * chance to seed the store; in that case the prop deck is used
 * instead of an empty object.
 */
function useEditorPanelContext(inputs: PanelContextInputs): EditorPanelContext {
  const {
    selectedIds,
    selectedElements,
    selectedComponent,
    activeSlide,
    activeSlideId,
    auditEntries,
    fallbackDeck,
    handlers,
  } = inputs;

  return useMemo<EditorPanelContext>(() => {
    const store = useEditorStore.getState();
    const overrides = store.overrides as Record<string, unknown>;
    const deck = (store.deck ?? fallbackDeck) as DeckDocument;
    return {
      themes: editorBootstrapThemes,
      brandKits: editorBootstrapBrandKits,
      state: {
        deck,
        activeSlide,
        activeSlideId: (activeSlide?.id ?? activeSlideId ?? '') as ULID,
        selectedIds,
        selectedComponent,
        selectedElements,
        crossFilters: store.crossFilters,
        activeThemeId: store.activeThemeId,
        activeBrandKitId: store.activeBrandKitId,
        activeKitDetail: store.activeKitDetail,
        slideKitId: store.slideKitId,
        colorScheme: store.colorScheme,
        override: (overrides[(activeSlide?.id ?? '') as string] ?? null) as never,
        a11yFindings: store.a11yFindings,
        isAuditing: store.isAuditing,
        lintElements: (activeSlide?.elements ?? [])
          .filter((el): el is Element & { type: 'component' } => el.type === 'component')
          .map((el) => ({
            id: el.id,
            name: el.name,
            fill: typeof el.component.props.fill === 'string' ? el.component.props.fill : undefined,
            fontFamily:
              typeof el.component.props.fontFamily === 'string'
                ? el.component.props.fontFamily
                : undefined,
          })),
        timeline: null,
        transition: null,
        magicRole: null,
        reducedMotion: store.reducedMotion,
        copiedAnimation: store.copiedAnimation,
        hotspots: store.hotspots,
        overlays: store.overlays,
        branchingEdges: store.branchingEdges,
        variables: store.variables,
        rules: store.rules,
        stateMachines: store.stateMachines,
        activeQuiz: store.activeQuiz,
        leaderboardItems: store.leaderboardItems,
        leaderboardAggregates: store.leaderboardAggregates,
        activeSequence: store.activeSequence,
        deepLinks: store.deepLinks,
        auditEntries,
        selectedMediaKind: null,
        selectedMediaProps: null,
      },
      handlers,
    };
  }, [
    selectedIds,
    selectedElements,
    selectedComponent,
    activeSlide,
    activeSlideId,
    auditEntries,
    fallbackDeck,
    handlers,
  ]);
}

interface SlidePreviewProps {
  slide: Slide;
}

function SlidePreview({ slide }: SlidePreviewProps): ReactElement {
  const sorted = [...slide.elements]
    .filter((el): el is Element & { transform: NonNullable<Element['transform']> } =>
      Boolean(el.transform),
    )
    .sort((a, b) => (a.z ?? 0) - (b.z ?? 0));
  return (
    <svg
      className="slide-preview"
      viewBox={`0 0 ${SLIDE_WIDTH} ${SLIDE_HEIGHT}`}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label={slide.title ?? 'Slide'}
    >
      <rect width={SLIDE_WIDTH} height={SLIDE_HEIGHT} fill="var(--bg)" />
      {sorted.map((el) => (
        <ElementSvg key={el.id} element={el} />
      ))}
    </svg>
  );
}

function buildShareState(deckId: string, slideId: ULID | null): () => ShareStateButtonCurrentState {
  return () => ({
    deck_id: deckId,
    slide_id: slideId ?? ('' as ULID),
    var_snapshot: [{ name: 'TIER', value: 'bear', visibility: 'deck_public', scope: 'deck' }],
    device_frame_state: { kind: 'iphone', orientation: 'portrait' },
    scenario: 'bear',
    form_drafts: {},
  });
}

// Avoid unused-import errors on viewport — kept for canvas chrome consumers.
void useViewport;
