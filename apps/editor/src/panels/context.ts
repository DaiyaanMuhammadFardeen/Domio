/**
 * EditorPanelContext — single shared context object passed to every
 * left-rail panel via the panel registry.
 *
 * Per Wave 1 §S1.1 of docs/frontend-roadmap/01-wave-productionization.md.
 *
 * Why one context and not per-panel prop wiring:
 *  - The registry pattern (PanelDefinition) requires every panel to share
 *    a single prop shape so the shell can render `registry.get(id)?.Component`.
 *  - Open/closed (SOLID O): adding a 25th panel needs zero edits here.
 *    New selectors go on the context object, but existing panels keep
 *    the same shape.
 *  - Interface segregation (SOLID I): panels read only the fields they
 *    need from this object. There is no per-panel interface; the panel
 *    picks what it uses.
 *
 * Fields are grouped by feature area to keep the type legible. All
 * optional fields default to a sensible empty value.
 */

import type { DeckDocument, Element, Slide, ULID } from '@domio/schema/generated/scene-graph';
import type {
  CrossFilter,
  LayerTimeline,
  SlideTransition,
  ReducedMotionPolicy,
} from '@domio/canvas';
import type { ComponentType, ReactElement } from 'react';
import type { PaletteOverride, ColorScheme } from './theme-brand-panel';
import type {
  ConnectionsPanelEdge,
  ConnectionsPanelHotspot,
  ConnectionsPanelOverlay,
} from './connections-panel';
import type { VariablesPanelRule, VariablesPanelVariable } from './variables-panel';
import type { StateInspectorMachine, StateMachineEventKind } from './state-inspector-panel';
import type { DeepLinkRecord } from './deep-links-panel';
import type { QuizRecord } from './quiz-panel';
import type { LeaderboardAggregate, LeaderboardEntry } from './leaderboard-panel';
import type { PresentationSequenceRecord } from './sequence-inspector-panel';
import type { A11yAuditFinding } from '../lib/theme-audit';
import type { DomioComponentDef } from '@domio/components';
import type { NlToolCallSummary } from './nl-patch-panel';
import type { DeckDiffEntry } from './deck-diff-panel';
import type { AuditEntryView } from '../components/prototyping/agent/AuditTrail';
import type { BrandKitDetail, LintIssue, ThemeDetail } from '../lib/brand-service';
import type { LintElementSummary } from '../components/brand/StyleLintPanel';

// ---------------------------------------------------------------------------
// Handler shapes — single-responsibility (SOLID S) callbacks the panels fire.
// ---------------------------------------------------------------------------

export interface PanelHandlers {
  // Layers / selection / insertion
  onSelect?: (id: ULID, modifiers: { shift: boolean; alt: boolean }) => void;
  onReorder?: (sourceId: ULID, targetId: ULID, place: 'before' | 'after') => void;
  onToggleFlag?: (id: ULID, flag: 'locked' | 'hidden') => void;
  onInsert?: (catalogId: string) => void;
  onInsertIcon?: (iconId: string, color: string) => void;
  onInsertMedia?: (kind: string, props: Record<string, unknown>) => void;
  /** Wave 2 §S2.4 — insert a section template (3–5 slides). */
  onInsertSection?: (sectionId: string) => void;
  /** Wave 2 §S2.4 — replace the deck with a full template. */
  onInsertTemplate?: (templateId: string) => void;
  /** Wave 2 §S2.4 — insert a stock photo. */
  onInsertStockImage?: (assetId: string) => void;
  /** Wave 2 §S2.4 — insert a Lottie animation. */
  onInsertLottie?: (animationId: string) => void;
  onPropEdit?: (key: string, from: unknown, to: unknown) => void;
  onVariantChange?: (from: string, to: string) => void;
  onFilterChange?: (filters: CrossFilter[]) => void;

  // Theme / brand
  onThemeChange?: (themeId: string) => void;
  onBrandKitChange?: (brandKitId: string) => void;
  onSchemeToggle?: (scheme: ColorScheme) => void;
  onOverrideChange?: (next: PaletteOverride | null) => void;
  onAudit?: () => void;
  // Wave 2 §S2.5 — extended theme/brand panel surface.
  /** Per-slide brand kit override; null = inherit from deck. */
  onSlideKitChange?: (kitId: string | null) => void;
  /** Push a (possibly edited) brand kit detail through the engine. */
  onKitDetailChange?: (kit: BrandKitDetail) => void;
  /** Receive a marketplace-installed theme. */
  onMarketplaceInstall?: (theme: ThemeDetail) => void;
  /** Receive a freshly generated dark theme. */
  onDarkGenerated?: (theme: ThemeDetail) => void;
  /** Apply a style-lint fix to an element. */
  onLintFix?: (elementId: string, issue: LintIssue) => void;
  /** Update a brand kit (rename / recolor). */
  onUpdateKit?: (
    kitId: string,
    patch: { name?: string; primaryHex?: string; accentHex?: string },
  ) => void;

  // Animation
  onTimelineChange?: (timeline: LayerTimeline | null) => void;
  onTransitionChange?: (transition: SlideTransition | null) => void;
  onMagicRoleChange?: (role: string | null) => void;
  onReducedMotionChange?: (policy: ReducedMotionPolicy | null) => void;
  onCopyAnimation?: () => void;
  onPasteAnimation?: () => void;

  // Connections / variables / state
  onAddHotspot?: (slideId: string, hotspot: Omit<ConnectionsPanelHotspot, 'id'>) => void;
  onRemoveHotspot?: (id: string) => void;
  onAddOverlay?: (slideId: string, overlay: Omit<ConnectionsPanelOverlay, 'id'>) => void;
  onRemoveOverlay?: (id: string) => void;
  onAddEdge?: (edge: Omit<ConnectionsPanelEdge, 'id'>) => void;
  onRemoveEdge?: (id: string) => void;
  onAddVariable?: (variable: Omit<VariablesPanelVariable, 'id'>) => void;
  onRemoveVariable?: (id: string) => void;
  onAddRule?: (rule: Omit<VariablesPanelRule, 'id'>) => void;
  onRemoveRule?: (id: string) => void;
  onAddStateMachine?: (
    instanceId: string,
    initialState: string,
    scope: StateInspectorMachine['scope'],
  ) => void;
  onRemoveStateMachine?: (id: string) => void;
  onAdvanceStateMachine?: (id: string, event: StateMachineEventKind) => void;
  onTogglePersistInstanceState?: (id: string, value: boolean) => void;

  // Audience (M6)
  onQuizPatch?: (patch: {
    name?: string;
    questions?: QuizRecord['questions'];
    passThreshold?: number;
    version: number;
  }) => void;
  onQuizDelete?: () => void;
  onLeaderboardUpdate?: (
    id: string,
    update: {
      status?: LeaderboardEntry['status'];
      reviewerId?: string | null;
      overrideScore?: number | null;
    },
  ) => void;
  onSequencePatch?: (patch: Partial<PresentationSequenceRecord> & { version: number }) => void;
  onSequenceDelete?: () => void;

  // Deep links (M7)
  onCreateDeepLinkSample?: (input: {
    deck_id: string;
    slide_id: string;
    scenario: string;
  }) => Promise<{ id: string; token: string }>;
  onResolveDeepLink?: (
    id: string,
  ) => Promise<{ slide_id: string; scenario: string; exp: number } | null>;
  onDeleteDeepLink?: (id: string) => Promise<boolean>;

  // Agent (M8)
  onNlParse?: (prompt: string) => Promise<readonly NlToolCallSummary[]>;
  onNlApply?: (calls: readonly NlToolCallSummary[]) => Promise<void> | void;
  onNlRollback?: (calls: readonly NlToolCallSummary[]) => Promise<void> | void;
  onDeckDiffCompare?: (
    a: string,
    b: string,
  ) => Promise<{
    added: readonly DeckDiffEntry[];
    removed: readonly DeckDiffEntry[];
    changed: readonly DeckDiffEntry[];
  }>;
  onAuditDiff?: (entry: AuditEntryView) => void;

  // Media / licenses / recording (M11)
  fetchGrants?: () => Promise<readonly unknown[]>;
  onRevoke?: (grantId: string) => void;
  onFinalizeRecording?: (draft: { chunks: readonly unknown[] }) => void;

  // Promote
  onPromote?: (def: DomioComponentDef, replaceSelection: boolean) => void;

  // Data sources
  onSelectDataSource?: (id: string | null) => void;
}

export interface PanelState {
  // Selection / slide
  deck: DeckDocument;
  activeSlide: Slide | undefined;
  activeSlideId: ULID;
  selectedIds: ReadonlySet<ULID>;
  selectedComponent: Element | undefined;
  selectedElements: readonly Element[];

  // Filters / data
  crossFilters: readonly CrossFilter[];

  // Theme / brand
  activeThemeId: string;
  activeBrandKitId: string;
  /** Active brand kit's full token detail (for the Tokens tab). */
  activeKitDetail: BrandKitDetail;
  /** Per-slide brand kit override id (or null = inherit). */
  slideKitId: string | null;
  colorScheme: ColorScheme;
  override: PaletteOverride | null;
  a11yFindings: readonly A11yAuditFinding[];
  isAuditing: boolean;
  /** Element summaries for the Style Lint tab. */
  lintElements: readonly LintElementSummary[];

  // Animation
  timeline: LayerTimeline | null;
  transition: SlideTransition | null;
  magicRole: string | null;
  reducedMotion: ReducedMotionPolicy | null;
  copiedAnimation: LayerTimeline | null;

  // Prototyping / connections / variables
  hotspots: readonly ConnectionsPanelHotspot[];
  overlays: readonly ConnectionsPanelOverlay[];
  branchingEdges: readonly ConnectionsPanelEdge[];
  variables: readonly VariablesPanelVariable[];
  rules: readonly VariablesPanelRule[];
  stateMachines: readonly StateInspectorMachine[];

  // Audience (M6)
  activeQuiz: QuizRecord;
  leaderboardItems: readonly LeaderboardEntry[];
  leaderboardAggregates: readonly LeaderboardAggregate[];
  activeSequence: PresentationSequenceRecord;

  // Deep links (M7)
  deepLinks: readonly DeepLinkRecord[];

  // Agent (M8)
  auditEntries: readonly unknown[];

  // Media (M11)
  selectedMediaKind: string | null;
  selectedMediaProps: Record<string, unknown> | null;
}

/**
 * EditorPanelContext — the single prop shape every left-rail panel
 * receives. Panels read what they need; missing handlers are simply
 * not invoked (the registry renders a non-interactive preview if a
 * panel surfaces a disabled control without a handler).
 */
export interface EditorPanelContext {
  state: PanelState;
  handlers: PanelHandlers;
  /** Optional theme/brand kit lists (kept on context to avoid module-level state). */
  themes: ReadonlyArray<{ id: string; name: string; scheme: 'light' | 'dark' }>;
  brandKits: ReadonlyArray<{ id: string; name: string; primaryHex: string; accentHex: string }>;
}

/**
 * EditorPanelComponent — the canonical prop shape for left-rail panels.
 */
export type EditorPanelComponent = ComponentType<EditorPanelContext>;

export interface PanelModule {
  /** The component the shell mounts when the tab is active. */
  Component: ComponentType<EditorPanelContext> | ((ctx: EditorPanelContext) => ReactElement | null);
}
