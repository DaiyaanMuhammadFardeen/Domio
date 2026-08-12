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
import { HistoryPanel } from '../panels/HistoryPanel';
import { PropsPanel } from '../panels/PropsPanel';
import { CommandPalette } from '../panels/CommandPalette';
import { ContextMenu, contextMenuFor, type ContextMenuItem } from '../panels/ContextMenu';
import { SyncIndicator } from '../components/SyncIndicator';
import { LocalPing } from '../components/LocalPing';
import { ElementSvg } from '../components/ElementSvg';
import { createAutosaveFacade, type AutosaveFacade } from '../lib/autosave';
import { makeComponentLayer } from '../lib/componentLayer';
import { PromoteDialog } from '../panels/promote-dialog';
import { ScenarioSwitcher } from '../panels/scenario-switcher';
import { ShareStateButton, type ShareStateButtonCurrentState } from '../components/prototyping/ShareStateButton';
import { CommentPins } from '../collab/comment-pins';
import { ApprovalBanner } from '../collab/approval-banner';
import { AssignmentPanel } from '../collab/assignment-panel';
import type { LayerTimeline, SlideTransition, ReducedMotionPolicy } from '@domio/canvas';
import { timelineOp, transitionOp, magicMoveOp, reducedMotionOp } from '@domio/canvas';
import { hotspotOp, overlayOp, branchingEdgeOp, variableOp } from '@domio/canvas';
import type { A11yAuditFinding } from '../lib/theme-audit';
import { addToLibrary } from '../lib/library';
import {
  loadGrantsForWorkspace,
} from '../lib/license-bootstrap';
import {
  BOOTSTRAP_THEMES,
  BOOTSTRAP_BRAND_KITS,
} from '../lib/theme-bootstrap';
import {
  type ConnectionsPanelEdge,
  type ConnectionsPanelHotspot,
  type ConnectionsPanelOverlay,
} from '../panels/connections-panel';
import {
  type StateInspectorMachine,
  type StateMachineEventKind,
} from '../panels/state-inspector-panel';
import type { DeepLinkRecord } from '../panels/deep-links-panel';
import type { QuizRecord } from '../panels/quiz-panel';
import {
  type LeaderboardEntry,
  type LeaderboardAggregate,
} from '../panels/leaderboard-panel';
import type {
  PresentationSequenceRecord,
} from '../panels/sequence-inspector-panel';
import type {
  VariablesPanelVariable,
  VariablesPanelRule,
} from '../panels/variables-panel';
import type {
  NlToolCallSummary,
} from '../panels/nl-patch-panel';
import type {
  DeckDiffEntry,
} from '../panels/deck-diff-panel';
import type { AuditEntryView } from '../components/prototyping/agent/AuditTrail';
import type { PaletteOverride, ColorScheme } from '../panels/theme-brand-panel';
import { editorPanels } from '../panels/registry';
import type { EditorPanelContext } from '../panels/context';

/** Actor ID placeholder — the control plane sets identity; this is a dev fallback. */
const ACTOR_ID: string =
  (typeof process !== 'undefined'
    ? (process.env.NEXT_PUBLIC_ACTOR_ID as string | undefined)
    : undefined) ?? 'actor-local';

export type EditorLeftTab =
  | 'layers'
  | 'insert'
  | 'library'
  | 'stickers'
  | 'icons'
  | 'theme-brand'
  | 'data-sources'
  | 'filters'
  | 'animations'
  | 'connections'
  | 'variables'
  | 'deep-links'
  | 'm6-quizzes'
  | 'm6-leaderboard'
  | 'm6-sequence'
  | 'm8-audit'
  | 'm8-nl-patch'
  | 'm8-deck-diff'
  | 'state-inspector'
  | 'm11-media'
  | 'm11-licenses'
  | 'm11-recording'
  | 'p12-copilot'
  | 'marketplace'
  | 'canvas-controls';

export interface EditorRootProps {
  doc: DeckDocument;
  /** Optional panel id from `?panel=…`. If valid, opens that panel on mount. */
  initialPanel?: EditorLeftTab;
}

interface CommandDescriptor {
  id: string;
  label: string;
  description?: string;
  category?: string;
  chord: string;
  run: () => void;
}

const PHASE_07_THEMES = BOOTSTRAP_THEMES;
const PHASE_07_BRAND_KITS = BOOTSTRAP_BRAND_KITS;

/**
 * Empty baseline for a11y audit findings. The real audit fetches
 * findings from the theme-svc via the brand-aware MCP surface; until
 * that client lands, the editor starts with an empty result set and
 * shows the "looks good" state.
 */
const EMPTY_A11Y_FINDINGS: readonly A11yAuditFinding[] = [];

export function EditorRoot(props: EditorRootProps): ReactElement {
  const { doc } = props;
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
  const [leftTab, setLeftTab] = useState<EditorLeftTab>(
    props.initialPanel ?? 'layers',
  );
  const [selectedDataSourceId, setSelectedDataSourceId] = useState<string | null>(null);
  // Keep the value referenced so lint does not flag the setter as
  // paired-with-unused state. The setter is forwarded to the panel
  // context; readers consume it through their own state.
  void selectedDataSourceId;
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

  const handleInsertMedia = useCallback(
    (kind: string, props: Record<string, unknown>) => {
      const slide = deck.slides.find((s) => s.id === activeSlideId);
      // Map media kinds to their component catalog id.
      const catalogMap: Record<string, string> = {
        model3d: 'domio.model3d',
        video: 'domio.video',
        audio: 'domio.audio',
        lottie: 'domio.lottie',
        embed: 'domio.embed',
        codeBlock: 'domio.codeBlock',
        latex: 'domio.latex',
        map: 'domio.map',
      };
      const catalogId = catalogMap[kind] ?? `domio.${kind}`;
      const def = getComponent(catalogId);
      if (!slide || !def) return;
      const layer = makeComponentLayer(def);
      layer.component.props = { ...props };
      const op = addElementOp([layer], slide.id, Date.now());
      setDeck(engine.apply(op));
      setSelectedIds(new Set([layer.id]));
      autosave.enqueue(`insert-media-${layer.id}`, op);
    },
    [deck, activeSlideId, engine, autosave],
  );

  // P11 — selected media kind + props for the MediaPanel prop-edit surface.
  const selectedMediaKind = useMemo(() => {
    if (!selectedComponent) return null;
    const props = selectedComponent.component.props ?? {};
    const kind = (props as { kind?: unknown }).kind;
    return typeof kind === 'string' ? kind : null;
  }, [selectedComponent]);

  const selectedMediaProps = useMemo(() => {
    if (!selectedComponent) return null;
    return (selectedComponent.component.props ?? {}) as Record<string, unknown>;
  }, [selectedComponent]);

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

  const handleA11yAudit = useCallback(async () => {
    setIsAuditing(true);
    try {
      // Phase 13 transport will replace this with `token.audit_a11y`
      // from the brand-aware MCP surface. Until then, the audit reports
      // "no findings" against the current brand-kit tokens.
      await Promise.resolve();
      setA11yFindings(EMPTY_A11Y_FINDINGS);
    } finally {
      setIsAuditing(false);
    }
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

  // P10: Prototyping state — hotspots, overlays, branching edges, variables, rules
  const [hotspots, setHotspots] = useState<ConnectionsPanelHotspot[]>([]);
  const [overlays, setOverlays] = useState<ConnectionsPanelOverlay[]>([]);
  // P10 M7: Deep-link records for the active deck.
  const [deepLinks, setDeepLinks] = useState<DeepLinkRecord[]>([]);
  const [branchingEdges, setBranchingEdges] = useState<ConnectionsPanelEdge[]>([]);
  const [variables, setVariables] = useState<VariablesPanelVariable[]>([]);
  const [rules, setRules] = useState<VariablesPanelRule[]>([]);
  const [stateMachines, setStateMachines] = useState<StateInspectorMachine[]>([]);
  // P10 M6: Quiz + leaderboard + presentation-sequence state for the active deck.
  const [activeQuiz, setActiveQuiz] = useState<QuizRecord>(() => ({
    id: 'demo-quiz',
    tenantId: 'demo',
    deckId: 'demo-deck',
    name: 'Untitled Quiz',
    questions: [],
    passThreshold: 0.7,
    version: 0,
  }));
  const [leaderboardItems, setLeaderboardItems] = useState<LeaderboardEntry[]>([]);
  const [leaderboardAggregates] = useState<LeaderboardAggregate[]>([]);
  const [activeSequence, setActiveSequence] = useState<PresentationSequenceRecord>(() => ({
    id: 'demo-sequence',
    tenantId: 'demo',
    deckId: 'demo-deck',
    name: 'Untitled Sequence',
    slides: ['s1', 's2', 's3'],
    intervalMs: 1000,
    pauseOnEvent: false,
    loop: false,
    count: 1,
    interruptionPolicy: 'queue',
    reducedMotionDefaultOff: true,
    pauseWarnAtMs: 1_800_000,
    version: 0,
  }));

  const handleQuizPatch = useCallback(
    (patch: { name?: string; questions?: QuizRecord['questions']; passThreshold?: number; version: number }) => {
      setActiveQuiz((current) => ({
        ...current,
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.questions !== undefined ? { questions: patch.questions } : {}),
        ...(patch.passThreshold !== undefined ? { passThreshold: patch.passThreshold } : {}),
        version: patch.version + 1,
      }));
    },
    [],
  );

  const handleQuizDelete = useCallback(() => {
    setActiveQuiz((current) => ({
      ...current,
      questions: [],
      version: current.version + 1,
    }));
  }, []);

  const handleLeaderboardUpdate = useCallback(
    (id: string, update: { status?: LeaderboardEntry['status']; reviewerId?: string | null; overrideScore?: number | null }) => {
      setLeaderboardItems((current) =>
        current.map((i) => (i.id === id ? { ...i, ...update } : i)),
      );
    },
    [],
  );

  const handleSequencePatch = useCallback(
    (patch: Partial<PresentationSequenceRecord> & { version: number }) => {
      setActiveSequence((current) => ({
        ...current,
        ...patch,
        version: patch.version + 1,
      }));
    },
    [],
  );

  const handleSequenceDelete = useCallback(() => {
    setActiveSequence((current) => ({
      ...current,
      slides: [],
      version: current.version + 1,
    }));
  }, []);

  const handleAddHotspot = useCallback(
    (slideId: string, hotspot: Omit<ConnectionsPanelHotspot, 'id'>) => {
      const id = `hs-${Date.now()}`;
      const next: ConnectionsPanelHotspot = { id, ...hotspot };
      setHotspots((current) => [...current, next]);
      const op = hotspotOp(slideId, next, null, Date.now());
      setDeck(engine.apply(op));
      autosave.enqueue(`hotspot-${id}`, op);
    },
    [engine, autosave],
  );

  const handleRemoveHotspot = useCallback(
    (id: string) => {
      setHotspots((current) => current.filter((h) => h.id !== id));
    },
    [],
  );

  const handleAddOverlay = useCallback(
    (slideId: string, overlay: Omit<ConnectionsPanelOverlay, 'id'>) => {
      const id = `ov-${Date.now()}`;
      const next: ConnectionsPanelOverlay = { id, ...overlay };
      setOverlays((current) => [...current, next]);
      const op = overlayOp(slideId, next, null, Date.now());
      setDeck(engine.apply(op));
      autosave.enqueue(`overlay-${id}`, op);
    },
    [engine, autosave],
  );

  const handleRemoveOverlay = useCallback((id: string) => {
    setOverlays((current) => current.filter((o) => o.id !== id));
  }, []);

  const handleAddEdge = useCallback(
    (edge: Omit<ConnectionsPanelEdge, 'id'>) => {
      const id = `edge-${Date.now()}`;
      const next: ConnectionsPanelEdge = { id, ...edge };
      setBranchingEdges((current) => [...current, next]);
      const op = branchingEdgeOp(edge.fromSlideId, next, null, Date.now());
      setDeck(engine.apply(op));
      autosave.enqueue(`edge-${id}`, op);
    },
    [engine, autosave],
  );

  const handleRemoveEdge = useCallback((id: string) => {
    setBranchingEdges((current) => current.filter((e) => e.id !== id));
  }, []);

  const handleAddVariable = useCallback(
    (variable: Omit<VariablesPanelVariable, 'id'>) => {
      const id = `var-${Date.now()}`;
      const next: VariablesPanelVariable = { id, ...variable };
      setVariables((current) => [...current, next]);
      const op = variableOp(activeSlideId, next, null, Date.now());
      setDeck(engine.apply(op));
      autosave.enqueue(`var-${id}`, op);
    },
    [engine, autosave, activeSlideId],
  );

  const handleRemoveVariable = useCallback((id: string) => {
    setVariables((current) => current.filter((v) => v.id !== id));
  }, []);

  const handleAddRule = useCallback(
    (rule: Omit<VariablesPanelRule, 'id'>) => {
      const id = `rule-${Date.now()}`;
      const next: VariablesPanelRule = { id, ...rule };
      setRules((current) => [...current, next]);
    },
    [],
  );

  const handleRemoveRule = useCallback((id: string) => {
    setRules((current) => current.filter((r) => r.id !== id));
  }, []);

  // M3 — state-machine handlers. Local-only: the editor ships a
  // prototype-runtime client in a follow-up, so the panel mounts with
  // an in-memory list wired through these callbacks. The contract
  // shape mirrors `StateInspectorPanel` exactly so swapping the
  // backend in is a one-line change.
  const handleAddStateMachine = useCallback(
    (
      instanceId: string,
      initialState: string,
      scope: StateInspectorMachine['scope'],
    ) => {
      const id = `sm-${Date.now()}`;
      const machine: StateInspectorMachine = {
        id,
        instanceId,
        stateMachine: {
          states: {
            [initialState]: { label: initialState },
            active: { label: 'active' },
            idle: { label: 'idle' },
          },
          initial: initialState,
          transitions: [
            { from: initialState, to: 'active', event: 'click' },
            { from: 'active', to: initialState, event: 'default' },
          ],
        },
        currentState: initialState,
        scope,
        persistInstanceState: false,
      };
      setStateMachines((current) => [...current, machine]);
    },
    [],
  );

  const handleRemoveStateMachine = useCallback((id: string) => {
    setStateMachines((current) => current.filter((m) => m.id !== id));
  }, []);

  const handleAdvanceStateMachine = useCallback(
    (id: string, event: StateMachineEventKind) => {
      setStateMachines((current) =>
        current.map((m) => {
          if (m.id !== id) return m;
          const match = m.stateMachine.transitions.find(
            (t) => t.from === m.currentState && t.event === event,
          );
          if (!match) return m;
          return { ...m, currentState: match.to };
        }),
      );
    },
    [],
  );

  const handleTogglePersistInstanceState = useCallback(
    (id: string, value: boolean) => {
      setStateMachines((current) =>
        current.map((m) => (m.id === id ? { ...m, persistInstanceState: value } : m)),
      );
    },
    [],
  );

  // M7 — deep-link handlers. These are local-only handlers so the
  // panel can mount without a backend round-trip; the real wiring
  // lands when the editor ships a deep-link-svc client.
  const handleCreateDeepLinkSample = useCallback(
    async (input: { deck_id: string; slide_id: string; scenario: string }) => {
      const id = `dl${Date.now().toString(36).toUpperCase().padStart(9, '0').slice(-9)}`;
      const token = `local.${id}`;
      const expires_at = Date.now() + 30 * 24 * 60 * 60 * 1000;
      setDeepLinks((current) => [
        ...current,
        {
          id,
          click_count: 0,
          expires_at,
          viewer_scope: 'public',
          single_use: false,
          created_at: Date.now(),
        },
      ]);
      void input; void token;
      return { id, token };
    },
    [],
  );
  const handleResolveDeepLink = useCallback(
    async (id: string) => {
      const r = deepLinks.find((d) => d.id === id);
      if (!r) return null;
      return {
        slide_id: activeSlideId,
        scenario: 'bear',
        exp: r.expires_at,
      };
    },
    [deepLinks, activeSlideId],
  );
  const handleDeleteDeepLink = useCallback(async (id: string) => {
    setDeepLinks((current) => current.filter((d) => d.id !== id));
    return true;
  }, []);
  const getShareState = useCallback(
    (): ShareStateButtonCurrentState => ({
      deck_id: deck.id,
      slide_id: activeSlideId,
      var_snapshot: [
        { name: 'TIER', value: 'bear', visibility: 'deck_public', scope: 'deck' },
      ],
      device_frame_state: { kind: 'iphone', orientation: 'portrait' },
      scenario: 'bear',
      form_drafts: {},
    }),
    [deck.id, activeSlideId],
  );

  // M8 — agent surface (audit, NL patch, deck diff)
  const [auditEntries, setAuditEntries] = useState<readonly AuditEntryView[]>([]);
  const handleAuditDiff = useCallback((_entry: AuditEntryView) => {
    /* no-op for now — render-only diff preview; reserved for future use */
  }, []);
  const handleNlParse = useCallback(
    async (prompt: string): Promise<readonly NlToolCallSummary[]> => {
      // Wired to the brand-aware MCP NL parser in Task #12. Until then
      // the editor returns an empty plan and the operator must wire
      // the prompt manually — no fake tool calls are emitted.
      void prompt;
      void deck.id;
      return [];
    },
    [deck.id],
  );
  const handleNlApply = useCallback(
    async (_calls: readonly NlToolCallSummary[]) => {
      setAuditEntries((current) => [
        {
          id: `apply-${Date.now()}`,
          agentId: 'agent-1',
          source: 'agent',
          toolName: 'nl_patch',
          timestamp: new Date().toISOString(),
          input: '<<nl-prompt>>',
          output: { ok: true },
        },
        ...current,
      ]);
    },
    [],
  );
  const handleNlRollback = useCallback(async (_calls: readonly NlToolCallSummary[]) => {
    setAuditEntries((current) => [
      {
        id: `rollback-${Date.now()}`,
        agentId: 'agent-1',
        source: 'agent',
        toolName: 'nl_rollback',
        timestamp: new Date().toISOString(),
        input: '<<nl-prompt>>',
        output: { rolledBack: true },
      },
      ...current,
    ]);
  }, []);
  const handleDeckDiffCompare = useCallback(
    async (_a: string, _b: string) => {
      // Wired to the deck-version-svc diff endpoint in Task #12. Until
      // then the editor returns an empty diff — no fake entries.
      return { added: [], removed: [], changed: [] } as {
        added: readonly DeckDiffEntry[];
        removed: readonly DeckDiffEntry[];
        changed: readonly DeckDiffEntry[];
      };
    },
    [],
  );

  // M11 — license grants + recording finalize. These are the wiring the
  // panels were previously hard-coded with; the editor still ships a
  // local deterministic preview until the media-license-svc client is
  // imported (see Task #9 / Task #12).
  const handleFetchGrants = useCallback(async () => {
    return loadGrantsForWorkspace('default-workspace');
  }, []);
  const handleRevokeGrant = useCallback((grantId: string) => {
    // Wired to the media-license-svc revoke endpoint in Task #12.
    // Until then, the editor only logs the action for diagnostics.
    // No fake state mutation: callers see the un-mutated grant list
    // until the real client refreshes it.
    void grantId;
  }, []);
  const handleFinalizeRecording = useCallback(
    (draft: { chunks: readonly unknown[] }) => {
      // Recording finalize is wired to the prototype-recorder-svc
      // upload pipeline in Task #12. Until then, the editor only logs
      // the chunk count for diagnostics.
      void draft.chunks.length;
    },
    [],
  );

  /**
   * Build the single shared panel context the registry feeds into every
   * left-rail panel. Solid interface-segregation: each panel reads only
   * the fields it needs from `state` and calls only the handlers it
   * requires; the shape is the same for every panel so the registry can
   * iterate uniformly.
   */
  const buildPanelContext = useCallback(
    (): EditorPanelContext => ({
      themes: PHASE_07_THEMES,
      brandKits: PHASE_07_BRAND_KITS,
      state: {
        deck,
        activeSlide,
        activeSlideId,
        selectedIds,
        selectedComponent,
        selectedElements,
        crossFilters,
        activeThemeId,
        activeBrandKitId,
        colorScheme,
        override: overrides[activeSlideId] ?? null,
        a11yFindings,
        isAuditing,
        timeline: selectedComponent
          ? ((selectedComponent.component.props ?? {})['x-domio:timeline'] as LayerTimeline | null) ?? null
          : null,
        transition: activeSlide
          ? ((activeSlide as unknown as Record<string, unknown>)['x-domio:transition'] as SlideTransition | null) ?? null
          : null,
        magicRole: selectedComponent
          ? ((selectedComponent as unknown as Record<string, unknown>)['element_role'] as string | null) ?? null
          : null,
        reducedMotion: deckReducedMotion,
        copiedAnimation,
        hotspots,
        overlays,
        branchingEdges,
        variables,
        rules,
        stateMachines,
        activeQuiz,
        leaderboardItems,
        leaderboardAggregates,
        activeSequence,
        deepLinks,
        auditEntries,
        selectedMediaKind,
        selectedMediaProps,
      },
      handlers: {
        onSelect: handleSelect,
        onReorder: handleReorder,
        onToggleFlag: handleToggleFlag,
        onInsert: handleInsertComponent,
        onInsertIcon: handleInsertIcon,
        onInsertMedia: handleInsertMedia,
        onPropEdit: handlePropEdit,
        onVariantChange: handleVariantChange,
        onFilterChange: handleFilterChange,
        onThemeChange: handleThemeChange,
        onBrandKitChange: handleBrandKitChange,
        onSchemeToggle: handleSchemeToggle,
        onOverrideChange: handleOverrideChange,
        onAudit: handleA11yAudit,
        onTimelineChange: handleTimelineChange,
        onTransitionChange: handleTransitionChange,
        onMagicRoleChange: handleMagicRoleChange,
        onReducedMotionChange: handleReducedMotionChange,
        onCopyAnimation: handleCopyAnimation,
        onPasteAnimation: handlePasteAnimation,
        onAddHotspot: handleAddHotspot,
        onRemoveHotspot: handleRemoveHotspot,
        onAddOverlay: handleAddOverlay,
        onRemoveOverlay: handleRemoveOverlay,
        onAddEdge: handleAddEdge,
        onRemoveEdge: handleRemoveEdge,
        onAddVariable: handleAddVariable,
        onRemoveVariable: handleRemoveVariable,
        onAddRule: handleAddRule,
        onRemoveRule: handleRemoveRule,
        onAddStateMachine: handleAddStateMachine,
        onRemoveStateMachine: handleRemoveStateMachine,
        onAdvanceStateMachine: handleAdvanceStateMachine,
        onTogglePersistInstanceState: handleTogglePersistInstanceState,
        onQuizPatch: handleQuizPatch,
        onQuizDelete: handleQuizDelete,
        onLeaderboardUpdate: handleLeaderboardUpdate,
        onSequencePatch: handleSequencePatch,
        onSequenceDelete: handleSequenceDelete,
        onCreateDeepLinkSample: handleCreateDeepLinkSample,
        onResolveDeepLink: handleResolveDeepLink,
        onDeleteDeepLink: handleDeleteDeepLink,
        onNlParse: handleNlParse,
        onNlApply: handleNlApply,
        onNlRollback: handleNlRollback,
        onDeckDiffCompare: handleDeckDiffCompare,
        onAuditDiff: handleAuditDiff,
        onSelectDataSource: setSelectedDataSourceId,
        onPromote: handlePromote,
        fetchGrants: handleFetchGrants,
        onRevoke: handleRevokeGrant,
        onFinalizeRecording: handleFinalizeRecording,
      },
    }),
    [
      deck, activeSlide, activeSlideId, selectedIds, selectedComponent, selectedElements,
      crossFilters, activeThemeId, activeBrandKitId, colorScheme, overrides, a11yFindings,
      isAuditing, deckReducedMotion, copiedAnimation, hotspots, overlays, branchingEdges,
      variables, rules, stateMachines, activeQuiz, leaderboardItems, leaderboardAggregates,
      activeSequence, deepLinks, auditEntries, selectedMediaKind, selectedMediaProps,
      handleSelect, handleReorder, handleToggleFlag, handleInsertComponent, handleInsertIcon,
      handleInsertMedia, handlePropEdit, handleVariantChange, handleFilterChange,
      handleThemeChange, handleBrandKitChange, handleSchemeToggle, handleOverrideChange,
      handleA11yAudit, handleTimelineChange, handleTransitionChange, handleMagicRoleChange,
      handleReducedMotionChange, handleCopyAnimation, handlePasteAnimation,
      handleAddHotspot, handleRemoveHotspot, handleAddOverlay, handleRemoveOverlay,
      handleAddEdge, handleRemoveEdge, handleAddVariable, handleRemoveVariable,
      handleAddRule, handleRemoveRule, handleAddStateMachine, handleRemoveStateMachine,
      handleAdvanceStateMachine, handleTogglePersistInstanceState,
      handleQuizPatch, handleQuizDelete, handleLeaderboardUpdate,
      handleSequencePatch, handleSequenceDelete,
      handleCreateDeepLinkSample, handleResolveDeepLink, handleDeleteDeepLink,
      handleNlParse, handleNlApply, handleNlRollback, handleDeckDiffCompare,
      handleAuditDiff, handlePromote,
      handleFetchGrants, handleRevokeGrant, handleFinalizeRecording,
    ],
  );

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
          <ShareStateButton getState={getShareState} audience="viewer" />
          <SyncIndicator facade={autosave} />
        </div>
      </header>
      <main className="editor-body">
        <aside className="editor-side editor-side--left">
          <div className="side-tabs" role="tablist" aria-label="Left panel">
            {editorPanels.list().map((panel: { id: EditorLeftTab; label: string; group: string }) => (
              <button
                key={panel.id}
                type="button"
                role="tab"
                aria-selected={leftTab === panel.id}
                className={`side-tab${leftTab === panel.id ? ' is-active' : ''}`}
                onClick={() => setLeftTab(panel.id)}
                data-testid={`tab-${panel.id}`}
              >
                {panel.label}
              </button>
            ))}
          </div>
          {(() => {
            const panel = editorPanels.get(leftTab);
            if (!panel) return null;
            const C = panel.Component;
            return <C {...buildPanelContext()} />;
          })()}
        </aside>
        <section className="editor-canvas" ref={pingRef as React.RefObject<HTMLDivElement>}>
          <ApprovalBanner deckId={deck.id} slideId={activeSlideId} currentActorId={ACTOR_ID} />
          <LocalPing adapter={pingAdapter} container={pingRef as React.RefObject<HTMLElement>} />
          {activeSlide ? <SlidePreview slide={activeSlide} /> : null}
          <CommentPins deckId={deck.id} slideId={activeSlideId} currentActorId={ACTOR_ID} />
        </section>
        <aside className="editor-side editor-side--right">
          <AssignmentPanel
            deckId={deck.id}
            slidePosition={activeSlide?.position ?? 0}
            currentActorId={ACTOR_ID}
          />
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
