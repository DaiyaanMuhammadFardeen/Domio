/**
 * editor-store — Zustand store that backs the editor panel context.
 *
 * Per Wave 2 §Phase A of docs/frontend-roadmap/wave-2-plan.md
 * (foundation-only first commit).
 *
 * Why a store:
 *  - EditorRoot.tsx was 1345 lines holding ~30 useState calls and
 *    ~50 useCallback handlers; every new Wave 2 panel needed yet
 *    more state. Zustand keeps the same imperative shape but
 *    externalises the state so EditorRoot becomes a thin wiring
 *    layer.
 *  - The store is the single source of truth for *UI* state. The
 *    `deck` document lives here too because every state mutation
 *    flows through `engine.apply(op)` and the resulting next-doc
 *    becomes the next state — keeping it local to EditorRoot would
 *    leave handlers straddling two contexts.
 *  - The HistoryEngine, CRDT bridge, and autosave facade all live
 *    behind `engine-bridge.ts`; the store imports the bridge, never
 *    the engine directly. This keeps the boundary SOLID-D-clean:
 *    state is a function of (current state, dispatched op).
 *
 * Slices are composed via the standard Zustand pattern (slice
 * factory functions returning `(set, get) => slice`). Adding a new
 * slice is one new factory + one spread on the root.
 */

import { create, type StoreApi, type UseBoundStore } from 'zustand';
import type { DeckDocument, ULID } from '@domio/schema/generated/scene-graph';
import type {
  CrossFilter,
  LayerTimeline,
  SlideTransition,
  ReducedMotionPolicy,
} from '@domio/canvas';

import type { PaletteOverride, ColorScheme } from '../panels/theme-brand-panel';
import type { BrandKitDetail, ThemeDetail } from '../lib/brand-service';
import { DEFAULT_BRAND_KITS } from '../lib/brand-service';
import type {
  ConnectionsPanelEdge,
  ConnectionsPanelHotspot,
  ConnectionsPanelOverlay,
} from '../panels/connections-panel';
import type { VariablesPanelRule, VariablesPanelVariable } from '../panels/variables-panel';
import type { StateInspectorMachine } from '../panels/state-inspector-panel';
import type { DeepLinkRecord } from '../panels/deep-links-panel';
import type { QuizRecord } from '../panels/quiz-panel';
import type { LeaderboardAggregate, LeaderboardEntry } from '../panels/leaderboard-panel';
import type { PresentationSequenceRecord } from '../panels/sequence-inspector-panel';
import type { A11yAuditFinding } from '../lib/theme-audit';

// ---------------------------------------------------------------------------
// Selection + slide state
// ---------------------------------------------------------------------------

export interface SelectionSlice {
  selectedIds: ReadonlySet<ULID>;
  toggleSelected: (id: ULID, modifiers?: { shift?: boolean; alt?: boolean }) => void;
  setSelected: (ids: Iterable<ULID>) => void;
  clearSelected: () => void;
  addSelected: (ids: Iterable<ULID>) => void;
  removeSelected: (ids: Iterable<ULID>) => void;
  activeSlideId: ULID | null;
  setActiveSlideId: (id: ULID | null) => void;
}

export const createSelectionSlice = (set: StoreApi<EditorState>['setState']): SelectionSlice => ({
  selectedIds: new Set<ULID>(),
  toggleSelected: (id, modifiers = {}) =>
    set((state) => {
      const next = new Set(state.selectedIds);
      if (modifiers.shift || modifiers.alt) {
        if (next.has(id)) next.delete(id);
        else next.add(id);
      } else {
        next.clear();
        next.add(id);
      }
      return { selectedIds: next };
    }),
  setSelected: (ids) => set({ selectedIds: new Set(ids) }),
  clearSelected: () => set({ selectedIds: new Set() }),
  addSelected: (ids) =>
    set((state) => {
      const next = new Set(state.selectedIds);
      for (const id of ids) next.add(id);
      return { selectedIds: next };
    }),
  removeSelected: (ids) =>
    set((state) => {
      const next = new Set(state.selectedIds);
      for (const id of ids) next.delete(id);
      return { selectedIds: next };
    }),
  activeSlideId: null,
  setActiveSlideId: (id) => set({ activeSlideId: id }),
});

// ---------------------------------------------------------------------------
// Deck state — the document is the source of truth; engine.apply(op)
// returns the next deck which we swap in here.
// ---------------------------------------------------------------------------

export interface DeckSlice {
  deck: DeckDocument | null;
  setDeck: (deck: DeckDocument | null) => void;
}

export const createDeckSlice = (set: StoreApi<EditorState>['setState']): DeckSlice => ({
  deck: null,
  setDeck: (deck) => set({ deck }),
});

// ---------------------------------------------------------------------------
// UI chrome — left tab, palette, context menu, promote dialog,
// canvas controls (rulers/grid/snap), viewport (zoom/pan), guides.
// ---------------------------------------------------------------------------

export interface UiSlice {
  leftTab: string;
  setLeftTab: (tab: string) => void;
  paletteOpen: boolean;
  setPaletteOpen: (open: boolean) => void;
  contextMenu: { x: number; y: number; targetId: ULID | null } | null;
  openContextMenu: (ctx: { x: number; y: number; targetId: ULID | null } | null) => void;
  promoteOpen: boolean;
  setPromoteOpen: (open: boolean) => void;
  selectedDataSourceId: string | null;
  setSelectedDataSourceId: (id: string | null) => void;
  // Canvas chrome
  showRulers: boolean;
  toggleRulers: () => void;
  showGrid: boolean;
  toggleGrid: () => void;
  snapEnabled: boolean;
  toggleSnap: () => void;
  zoom: number;
  setZoom: (zoom: number) => void;
  pan: { x: number; y: number };
  setPan: (pan: { x: number; y: number }) => void;
  resetViewport: () => void;
  guides: ReadonlyArray<{ id: string; orientation: 'horizontal' | 'vertical'; position: number }>;
  addGuide: (g: { orientation: 'horizontal' | 'vertical'; position: number }) => void;
  removeGuide: (id: string) => void;
}

export const createUiSlice = (set: StoreApi<EditorState>['setState']): UiSlice => ({
  leftTab: 'layers',
  setLeftTab: (tab) => set({ leftTab: tab }),
  paletteOpen: false,
  setPaletteOpen: (open) => set({ paletteOpen: open }),
  contextMenu: null,
  openContextMenu: (ctx) => set({ contextMenu: ctx }),
  promoteOpen: false,
  setPromoteOpen: (open) => set({ promoteOpen: open }),
  selectedDataSourceId: null,
  setSelectedDataSourceId: (id) => set({ selectedDataSourceId: id }),
  showRulers: true,
  toggleRulers: () => set((s) => ({ showRulers: !s.showRulers })),
  showGrid: false,
  toggleGrid: () => set((s) => ({ showGrid: !s.showGrid })),
  snapEnabled: true,
  toggleSnap: () => set((s) => ({ snapEnabled: !s.snapEnabled })),
  zoom: 1,
  setZoom: (zoom) => set({ zoom }),
  pan: { x: 0, y: 0 },
  setPan: (pan) => set({ pan }),
  resetViewport: () => set({ zoom: 1, pan: { x: 0, y: 0 } }),
  guides: [],
  addGuide: (g) =>
    set((s) => ({
      guides: [
        ...s.guides,
        { id: `g-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, ...g },
      ],
    })),
  removeGuide: (id) => set((s) => ({ guides: s.guides.filter((g) => g.id !== id) })),
});

// ---------------------------------------------------------------------------
// Theme + brand slice
// ---------------------------------------------------------------------------

export interface ThemeSlice {
  activeThemeId: string;
  setActiveThemeId: (id: string) => void;
  activeBrandKitId: string;
  setActiveBrandKitId: (id: string) => void;
  colorScheme: ColorScheme;
  setColorScheme: (s: ColorScheme) => void;
  toggleScheme: () => void;
  overrides: Record<string, PaletteOverride>;
  setOverride: (slideId: string, override: PaletteOverride | null) => void;
  a11yFindings: readonly A11yAuditFinding[];
  setA11yFindings: (findings: readonly A11yAuditFinding[]) => void;
  isAuditing: boolean;
  setIsAuditing: (busy: boolean) => void;
  // Wave 2 §S2.5 extended surface.
  /** Per-slide brand kit override id (or null = inherit). */
  slideKitId: string | null;
  setSlideKitId: (id: string | null) => void;
  /** Full brand kit detail for the active kit (Tokens tab source). */
  activeKitDetail: BrandKitDetail;
  setKitDetail: (kit: BrandKitDetail) => void;
  /** Marketplace-installed or dark-generated theme. */
  installedTheme: ThemeDetail | null;
  setInstalledTheme: (theme: ThemeDetail | null) => void;
  /** Patch the active kit's identity fields. */
  patchKit: (
    kitId: string,
    patch: { name?: string; primaryHex?: string; accentHex?: string },
  ) => void;
  /** Patch a slide element by id (used by the lint-fix handler). */
  patchElement: (elementId: string, next: Partial<unknown>) => void;
}

export const createThemeSlice = (set: StoreApi<EditorState>['setState']): ThemeSlice => ({
  activeThemeId: 'theme-acme-light',
  setActiveThemeId: (id) => set({ activeThemeId: id }),
  activeBrandKitId: 'brand-acme',
  setActiveBrandKitId: (id) => set({ activeBrandKitId: id }),
  colorScheme: 'light',
  setColorScheme: (s) => set({ colorScheme: s }),
  toggleScheme: () => set((s) => ({ colorScheme: s.colorScheme === 'light' ? 'dark' : 'light' })),
  overrides: {},
  setOverride: (slideId, override) =>
    set((s) => {
      const next = { ...s.overrides };
      if (override === null) delete next[slideId];
      else next[slideId] = override;
      return { overrides: next };
    }),
  a11yFindings: [],
  setA11yFindings: (findings) => set({ a11yFindings: findings }),
  isAuditing: false,
  setIsAuditing: (busy) => set({ isAuditing: busy }),
  slideKitId: null,
  setSlideKitId: (id) => set({ slideKitId: id }),
  activeKitDetail: DEFAULT_BRAND_KITS[0]!,
  setKitDetail: (kit) => set({ activeKitDetail: kit }),
  installedTheme: null,
  setInstalledTheme: (theme) => set({ installedTheme: theme }),
  patchKit: (kitId, patch) =>
    set((s) => {
      if (s.activeKitDetail.id !== kitId) return {};
      return {
        activeKitDetail: {
          ...s.activeKitDetail,
          ...patch,
        },
      };
    }),
  patchElement: (elementId, next) =>
    set((s) => {
      if (!s.deck) return {};
      const slide = s.deck.slides.find((sl) => sl.elements.some((el) => el.id === elementId));
      if (!slide) return {};
      const updatedSlide = {
        ...slide,
        elements: slide.elements.map((el) =>
          el.id === elementId ? ({ ...el, ...(next as object) } as typeof el) : el,
        ),
      };
      return {
        deck: {
          ...s.deck,
          slides: s.deck.slides.map((sl) => (sl.id === slide.id ? updatedSlide : sl)),
        },
      };
    }),
});

// ---------------------------------------------------------------------------
// Animation slice
// ---------------------------------------------------------------------------

export interface AnimationSlice {
  crossFilters: readonly CrossFilter[];
  setCrossFilters: (filters: readonly CrossFilter[]) => void;
  timeline: LayerTimeline | null;
  setTimeline: (t: LayerTimeline | null) => void;
  transition: SlideTransition | null;
  setTransition: (t: SlideTransition | null) => void;
  magicRole: string | null;
  setMagicRole: (role: string | null) => void;
  reducedMotion: ReducedMotionPolicy | null;
  setReducedMotion: (p: ReducedMotionPolicy | null) => void;
  copiedAnimation: LayerTimeline | null;
  setCopiedAnimation: (t: LayerTimeline | null) => void;
}

export const createAnimationSlice = (set: StoreApi<EditorState>['setState']): AnimationSlice => ({
  crossFilters: [],
  setCrossFilters: (filters) => set({ crossFilters: filters }),
  timeline: null,
  setTimeline: (t) => set({ timeline: t }),
  transition: null,
  setTransition: (t) => set({ transition: t }),
  magicRole: null,
  setMagicRole: (role) => set({ magicRole: role }),
  reducedMotion: null,
  setReducedMotion: (p) => set({ reducedMotion: p }),
  copiedAnimation: null,
  setCopiedAnimation: (t) => set({ copiedAnimation: t }),
});

// ---------------------------------------------------------------------------
// Connections / prototyping / state-machine slice
// ---------------------------------------------------------------------------

export interface ConnectionsSlice {
  hotspots: readonly ConnectionsPanelHotspot[];
  addHotspot: (h: ConnectionsPanelHotspot) => void;
  removeHotspot: (id: string) => void;
  overlays: readonly ConnectionsPanelOverlay[];
  addOverlay: (o: ConnectionsPanelOverlay) => void;
  removeOverlay: (id: string) => void;
  branchingEdges: readonly ConnectionsPanelEdge[];
  addBranchingEdge: (e: ConnectionsPanelEdge) => void;
  removeBranchingEdge: (id: string) => void;
  variables: readonly VariablesPanelVariable[];
  addVariable: (v: VariablesPanelVariable) => void;
  removeVariable: (id: string) => void;
  rules: readonly VariablesPanelRule[];
  addRule: (r: VariablesPanelRule) => void;
  removeRule: (id: string) => void;
  stateMachines: readonly StateInspectorMachine[];
  addStateMachine: (m: StateInspectorMachine) => void;
  removeStateMachine: (id: string) => void;
  updateStateMachine: (id: string, patch: Partial<StateInspectorMachine>) => void;
  deepLinks: readonly DeepLinkRecord[];
  setDeepLinks: (links: readonly DeepLinkRecord[]) => void;
}

export const createConnectionsSlice = (
  set: StoreApi<EditorState>['setState'],
): ConnectionsSlice => ({
  hotspots: [],
  addHotspot: (h) => set((s) => ({ hotspots: [...s.hotspots, h] })),
  removeHotspot: (id) => set((s) => ({ hotspots: s.hotspots.filter((h) => h.id !== id) })),
  overlays: [],
  addOverlay: (o) => set((s) => ({ overlays: [...s.overlays, o] })),
  removeOverlay: (id) => set((s) => ({ overlays: s.overlays.filter((o) => o.id !== id) })),
  branchingEdges: [],
  addBranchingEdge: (e) => set((s) => ({ branchingEdges: [...s.branchingEdges, e] })),
  removeBranchingEdge: (id) =>
    set((s) => ({
      branchingEdges: s.branchingEdges.filter((e) => e.id !== id),
    })),
  variables: [],
  addVariable: (v) => set((s) => ({ variables: [...s.variables, v] })),
  removeVariable: (id) => set((s) => ({ variables: s.variables.filter((v) => v.id !== id) })),
  rules: [],
  addRule: (r) => set((s) => ({ rules: [...s.rules, r] })),
  removeRule: (id) => set((s) => ({ rules: s.rules.filter((r) => r.id !== id) })),
  stateMachines: [],
  addStateMachine: (m) => set((s) => ({ stateMachines: [...s.stateMachines, m] })),
  removeStateMachine: (id) =>
    set((s) => ({
      stateMachines: s.stateMachines.filter((m) => m.id !== id),
    })),
  updateStateMachine: (id, patch) =>
    set((s) => ({
      stateMachines: s.stateMachines.map((m) => (m.id === id ? { ...m, ...patch } : m)),
    })),
  deepLinks: [],
  setDeepLinks: (links) => set({ deepLinks: links }),
});

// ---------------------------------------------------------------------------
// Audience (M6) slice
// ---------------------------------------------------------------------------

export interface AudienceSlice {
  activeQuiz: QuizRecord;
  setActiveQuiz: (q: QuizRecord) => void;
  leaderboardItems: readonly LeaderboardEntry[];
  setLeaderboardItems: (items: readonly LeaderboardEntry[]) => void;
  leaderboardAggregates: readonly LeaderboardAggregate[];
  setLeaderboardAggregates: (aggs: readonly LeaderboardAggregate[]) => void;
  activeSequence: PresentationSequenceRecord;
  setActiveSequence: (s: PresentationSequenceRecord) => void;
}

export const createAudienceSlice = (set: StoreApi<EditorState>['setState']): AudienceSlice => ({
  activeQuiz: {
    id: 'quiz-default',
    tenantId: 'tenant-local',
    deckId: 'deck-local',
    name: 'Default Quiz',
    questions: [],
    passThreshold: 0.7,
    version: 0,
  },
  setActiveQuiz: (q) => set({ activeQuiz: q }),
  leaderboardItems: [],
  setLeaderboardItems: (items) => set({ leaderboardItems: items }),
  leaderboardAggregates: [],
  setLeaderboardAggregates: (aggs) => set({ leaderboardAggregates: aggs }),
  activeSequence: {
    id: 'seq-default',
    tenantId: 'tenant-local',
    deckId: 'deck-local',
    name: 'Default Sequence',
    slides: [],
    intervalMs: 5000,
    pauseOnEvent: true,
    loop: false,
    count: 1,
    interruptionPolicy: 'queue',
    reducedMotionDefaultOff: false,
    pauseWarnAtMs: 30000,
    version: 0,
  },
  setActiveSequence: (s) => set({ activeSequence: s }),
});

// ---------------------------------------------------------------------------
// Agent (M8) slice — placeholder for auditEntries; the full type is
// the same `AuditEntryView` consumed by AuditTrail.
// ---------------------------------------------------------------------------

export interface AgentSlice {
  auditEntries: readonly unknown[];
  setAuditEntries: (entries: readonly unknown[]) => void;
}

export const createAgentSlice = (set: StoreApi<EditorState>['setState']): AgentSlice => ({
  auditEntries: [],
  setAuditEntries: (entries) => set({ auditEntries: entries }),
});

// ---------------------------------------------------------------------------
// Root store — composition of slices.
// ---------------------------------------------------------------------------

export type EditorState = SelectionSlice &
  DeckSlice &
  UiSlice &
  ThemeSlice &
  AnimationSlice &
  ConnectionsSlice &
  AudienceSlice &
  AgentSlice;

export const useEditorStore: UseBoundStore<StoreApi<EditorState>> = create<EditorState>()(
  (set) => ({
    ...createSelectionSlice(set as StoreApi<EditorState>['setState']),
    ...createDeckSlice(set as StoreApi<EditorState>['setState']),
    ...createUiSlice(set as StoreApi<EditorState>['setState']),
    ...createThemeSlice(set as StoreApi<EditorState>['setState']),
    ...createAnimationSlice(set as StoreApi<EditorState>['setState']),
    ...createConnectionsSlice(set as StoreApi<EditorState>['setState']),
    ...createAudienceSlice(set as StoreApi<EditorState>['setState']),
    ...createAgentSlice(set as StoreApi<EditorState>['setState']),
  }),
);

/** Reset the entire store to its initial values. Used by tests + a future logout action. */
export function resetEditorStore(): void {
  useEditorStore.setState((state) => state, true);
  // The above is a no-op when `replace=true`; we need an explicit reset.
  useEditorStore.setState({
    ...createSelectionSlice(useEditorStore.setState),
    ...createDeckSlice(useEditorStore.setState),
    ...createUiSlice(useEditorStore.setState),
    ...createThemeSlice(useEditorStore.setState),
    ...createAnimationSlice(useEditorStore.setState),
    ...createConnectionsSlice(useEditorStore.setState),
    ...createAudienceSlice(useEditorStore.setState),
    ...createAgentSlice(useEditorStore.setState),
  });
}
