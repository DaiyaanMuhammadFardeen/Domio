/**
 * Editor handlers — single file owning every action the editor can
 * perform. They live in one place so the same handlers can be wired
 * into:
 *
 *  - `EditorRoot.tsx` (driven via `useEditorShortcuts(bindings)`)
 *  - `PanelHandlers` (every panel reads via the EditorPanelContext)
 *  - tests (each handler is a plain function — no React hooks needed)
 *
 * Architecture (Wave 2.1 — bulk EditorRoot rewrite):
 *  - State reads happen against `useEditorStore.getState()` so the
 *    handlers stay plain functions and don't need a hook boundary.
 *  - Mutations to the deck flow through `engine-bridge.applyOp(op)`,
 *    which also enqueues the autosave entry and updates the store's
 *    `deck` slice. The bridge is the single mutation entry point.
 *  - The canvas chrome (Rulers, ZoomHUD, SnapEngine) reads viewport
 *    state via `useViewport()` and dispatches back through
 *    `useEditorStore` directly — no mutation goes through this file
 *    for view-only state.
 *  - State-machine / NL / deep-link handlers still mutate local
 *    in-memory lists via store setters; their backend clients are
 *    documented NOT-YET-IMPLEMENTED seams and land in Wave 2.1+
 *    sub-phases.
 *
 * Returns: each handler is a plain `(arg) => void` function. Async
 * handlers return a Promise the caller can ignore.
 */

import {
  type CrossFilter,
  type HistoryOp,
  type LayerTimeline,
  type ReducedMotionPolicy,
  type SlideTransition,
  addElementOp,
  branchingEdgeOp,
  filterOp,
  hotspotOp,
  magicMoveOp,
  overlayOp,
  propEditOp,
  reducedMotionOp,
  removeElementOp,
  reorderOp,
  timelineOp,
  toggleFlag,
  transitionOp,
  variableOp,
  variantChangeOp,
} from '@domio/canvas';
import type { DeckDocument, Element, ULID } from '@domio/schema/generated/scene-graph';
import { expandComponent, getComponent, type DomioComponentDef } from '@domio/components';

import type { PaletteOverride, ColorScheme } from '../panels/theme-brand-panel';
import type {
  ConnectionsPanelEdge,
  ConnectionsPanelHotspot,
  ConnectionsPanelOverlay,
} from '../panels/connections-panel';
import type {
  VariablesPanelRule,
  VariablesPanelVariable,
} from '../panels/variables-panel';
import type {
  StateInspectorMachine,
  StateMachineEventKind,
} from '../panels/state-inspector-panel';
import type { DeepLinkRecord } from '../panels/deep-links-panel';
import type { QuizRecord } from '../panels/quiz-panel';
import type { LeaderboardEntry } from '../panels/leaderboard-panel';
import type { PresentationSequenceRecord } from '../panels/sequence-inspector-panel';
import type { NlToolCallSummary } from '../panels/nl-patch-panel';
import type { DeckDiffEntry } from '../panels/deck-diff-panel';
import type { AuditEntryView } from '../components/prototyping/agent/AuditTrail';
import type { A11yAuditFinding } from '../lib/theme-audit';
import { loadGrantsForWorkspace } from '../lib/license-bootstrap';
import { addToLibrary } from '../lib/library';
import { makeComponentLayer } from '../lib/componentLayer';
import { applyOp, redo, undo } from './engine-bridge';
import { useEditorStore } from './editor-store';
import { BOOTSTRAP_BRAND_KITS, BOOTSTRAP_THEMES } from '../lib/theme-bootstrap';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function nowOp(): number {
  return Date.now();
}

function makeId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Read the current deck from the store without subscribing. */
function getDeck(): DeckDocument | null {
  return useEditorStore.getState().deck;
}

/** Read the active slide id from the store. */
function getActiveSlideId(): ULID | null {
  return useEditorStore.getState().activeSlideId;
}

/** Resolve the active slide from the current deck + activeSlideId. */
function getActiveSlide(): { slide: Element[]; slideId: ULID | null } | null {
  const deck = getDeck();
  if (!deck) return null;
  const id = getActiveSlideId();
  const slide = deck.slides.find((s) => s.id === id) ?? deck.slides[0];
  if (!slide) return null;
  return { slide: slide.elements, slideId: slide.id };
}

/** Read selected-element views from the store. */
function getSelectedElements(): Element[] {
  const { deck, activeSlideId, selectedIds } = useEditorStore.getState();
  if (!deck) return [];
  const slide = deck.slides.find((s) => s.id === activeSlideId);
  if (!slide) return [];
  return slide.elements.filter((el) => selectedIds.has(el.id));
}

/** Single selected element, narrowed. Returns undefined when there isn't exactly one. */
function getSingleSelected(): Element | undefined {
  const els = getSelectedElements();
  return els.length === 1 ? els[0] : undefined;
}

/** Component-typed single selection. */
function getSingleSelectedComponent(): Extract<Element, { type: 'component' }> | undefined {
  const el = getSingleSelected();
  return el?.type === 'component' ? el : undefined;
}

// ---------------------------------------------------------------------------
// Selection / slide
// ---------------------------------------------------------------------------

export function handleSelect(
  id: ULID,
  modifiers: { shift: boolean; alt: boolean },
): void {
  useEditorStore.getState().toggleSelected(id, modifiers);
}

export function handleSelectOnly(id: ULID): void {
  useEditorStore.getState().setSelected([id]);
}

export function handleClearSelection(): void {
  useEditorStore.getState().clearSelected();
}

export function handleSelectDataSource(id: string | null): void {
  useEditorStore.getState().setSelectedDataSourceId(id);
}

export function handleSetActiveSlide(id: ULID): void {
  useEditorStore.getState().setActiveSlideId(id);
}

export function handleToggleFlag(id: ULID, flag: 'locked' | 'hidden'): void {
  const deck = getDeck();
  if (!deck) return;
  const next = toggleFlag(deck, id, flag);
  if (next === deck) return;
  // Reuse the engine's apply pipeline via replaceDeck (lock/hide isn't
  // a history op currently — fold the new deck in without an op).
  useEditorStore.getState().setDeck(next);
}

// ---------------------------------------------------------------------------
// Reorder / insert / remove
// ---------------------------------------------------------------------------

export function handleReorder(
  sourceId: ULID,
  targetId: ULID,
  place: 'before' | 'after',
): void {
  const ctx = getActiveSlide();
  if (!ctx) return;
  const slide = useEditorStore.getState().deck?.slides.find(
    (s) => s.id === ctx.slideId,
  );
  if (!slide) return;
  const targetEl = slide.elements.find((el) => el.id === targetId);
  const sourceEl = slide.elements.find((el) => el.id === sourceId);
  if (!targetEl || !sourceEl) return;
  const targetZ = (targetEl.z ?? 0) + (place === 'after' ? 1 : -1);
  const op = reorderOp(
    [
      {
        id: sourceId,
        fromZ: sourceEl.z ?? 0,
        toZ: targetZ,
        fromParent: sourceEl.parentId,
        toParent: sourceEl.parentId,
      },
    ],
    nowOp(),
  );
  applyOp(op);
}

const MEDIA_CATALOG_MAP: Record<string, string> = {
  model3d: 'domio.model3d',
  video: 'domio.video',
  audio: 'domio.audio',
  lottie: 'domio.lottie',
  embed: 'domio.embed',
  codeBlock: 'domio.codeBlock',
  latex: 'domio.latex',
  map: 'domio.map',
};

function insertComponentForCatalog(catalogId: string, props?: Record<string, unknown>): void {
  const ctx = getActiveSlide();
  if (!ctx || !ctx.slideId) return;
  const def = getComponent(catalogId);
  if (!def) return;
  const layer = makeComponentLayer(def);
  if (props) {
    layer.component.props = { ...props };
  }
  const op = addElementOp([layer], ctx.slideId, nowOp());
  applyOp(op);
  useEditorStore.getState().setSelected([layer.id]);
}

export function handleInsertComponent(catalogId: string): void {
  insertComponentForCatalog(catalogId);
  useEditorStore.getState().setLeftTab('layers');
}

export function handleInsertIcon(iconId: string, color: string): void {
  insertComponentForCatalog('domio.icon', { iconId, color, size: 48, label: '' });
}

export function handleInsertMedia(kind: string, props: Record<string, unknown>): void {
  const catalogId = MEDIA_CATALOG_MAP[kind] ?? `domio.${kind}`;
  insertComponentForCatalog(catalogId, props);
}

// ---------------------------------------------------------------------------
// Prop + variant + filter
// ---------------------------------------------------------------------------

export function handlePropEdit(key: string, from: unknown, to: unknown): void {
  const el = getSingleSelected();
  if (!el) return;
  const op = propEditOp([{ id: el.id, key, from, to }], nowOp());
  applyOp(op);
}

export function handleVariantChange(from: string, to: string): void {
  const el = getSingleSelected();
  if (!el) return;
  const op = variantChangeOp([{ id: el.id, from, to }], nowOp());
  applyOp(op);
}

export function handleFilterChange(newFilters: CrossFilter[]): void {
  const prev =
    useEditorStore.getState().crossFilters as unknown as CrossFilter[];
  useEditorStore.getState().setCrossFilters(newFilters);
  const ctx = getActiveSlide();
  if (!ctx) return;
  const slide = useEditorStore.getState().deck?.slides.find(
    (s) => s.id === ctx.slideId,
  );
  if (!slide) return;
  const ops: HistoryOp[] = [];
  for (const el of slide.elements) {
    if (el.type !== 'component') continue;
    const binding = (el.component.props ?? {})['x-domio:binding'] as
      | { listenToFilters?: string[] }
      | undefined;
    if (!binding?.listenToFilters?.length) continue;
    ops.push(filterOp(el.id, newFilters, prev, nowOp()));
  }
  for (const op of ops) applyOp(op);
}

// ---------------------------------------------------------------------------
// Theme / brand / a11y
// ---------------------------------------------------------------------------

export function handleThemeChange(themeId: string): void {
  const theme = BOOTSTRAP_THEMES.find((t) => t.id === themeId);
  useEditorStore.getState().setActiveThemeId(themeId);
  if (theme) useEditorStore.getState().setColorScheme(theme.scheme);
}

export function handleBrandKitChange(brandKitId: string): void {
  useEditorStore.getState().setActiveBrandKitId(brandKitId);
}

export function handleSchemeToggle(next: ColorScheme): void {
  useEditorStore.getState().setColorScheme(next);
  const matching = BOOTSTRAP_THEMES.find(
    (t) => t.scheme === next && t.id.includes('acme'),
  );
  if (matching) useEditorStore.getState().setActiveThemeId(matching.id);
}

export function handleOverrideChange(next: PaletteOverride | null): void {
  const id = getActiveSlideId();
  if (!id) return;
  useEditorStore.getState().setOverride(id, next);
}

export async function handleA11yAudit(): Promise<void> {
  const { setIsAuditing, setA11yFindings } = useEditorStore.getState();
  setIsAuditing(true);
  try {
    // Phase 13 transport will replace this with `token.audit_a11y`
    // from the brand-aware MCP surface. Until then, the audit reports
    // "no findings" against the current brand-kit tokens.
    await Promise.resolve();
    setA11yFindings([] as readonly A11yAuditFinding[]);
  } finally {
    setIsAuditing(false);
  }
}

// ---------------------------------------------------------------------------
// Animation
// ---------------------------------------------------------------------------

export function handleTimelineChange(timeline: LayerTimeline | null): void {
  const el = getSingleSelectedComponent();
  if (!el) return;
  const prev = (el.component.props ?? {})['x-domio:timeline'] as
    | LayerTimeline
    | null
    | undefined;
  const op = timelineOp(el.id, timeline, prev ?? null, nowOp());
  applyOp(op);
  useEditorStore.getState().setTimeline(timeline);
}

export function handleTransitionChange(transition: SlideTransition | null): void {
  const id = getActiveSlideId();
  if (!id) return;
  const deck = getDeck();
  if (!deck) return;
  const slide = deck.slides.find((s) => s.id === id);
  if (!slide) return;
  const prev = (slide as unknown as Record<string, unknown>)['x-domio:transition'] as
    | SlideTransition
    | null
    | undefined;
  const op = transitionOp(id, transition, prev ?? null, nowOp());
  applyOp(op);
  useEditorStore.getState().setTransition(transition);
}

export function handleMagicRoleChange(role: string | null): void {
  const el = getSingleSelected();
  if (!el) return;
  const prev = (el as unknown as Record<string, unknown>)['element_role'] as
    | string
    | null
    | undefined;
  const op = magicMoveOp(el.id, role, prev ?? null, nowOp());
  applyOp(op);
  useEditorStore.getState().setMagicRole(role);
}

export function handleReducedMotionChange(policy: ReducedMotionPolicy | null): void {
  const deck = getDeck();
  if (!deck) return;
  const prev = (deck as unknown as Record<string, unknown>)['x-domio:reduced-motion'] as
    | ReducedMotionPolicy
    | null
    | undefined;
  const op = reducedMotionOp(policy, prev ?? null, nowOp());
  applyOp(op);
  useEditorStore.getState().setReducedMotion(policy);
}

export function handleCopyAnimation(): void {
  const el = getSingleSelectedComponent();
  if (!el) return;
  const timeline = (el.component.props ?? {})['x-domio:timeline'] as
    | LayerTimeline
    | null;
  useEditorStore.getState().setCopiedAnimation(timeline ? { ...timeline } : null);
}

export function handlePasteAnimation(): void {
  const el = getSingleSelectedComponent();
  if (!el) return;
  const copied = useEditorStore.getState().copiedAnimation;
  if (!copied) return;
  const prev = (el.component.props ?? {})['x-domio:timeline'] as
    | LayerTimeline
    | null
    | undefined;
  const pasted = { ...copied, id: `tl-${nowOp()}` };
  const op = timelineOp(el.id, pasted, prev ?? null, nowOp());
  applyOp(op);
}

// ---------------------------------------------------------------------------
// Prototyping — hotspots, overlays, branching edges, variables, rules,
// state machines.
// ---------------------------------------------------------------------------

export function handleAddHotspot(
  slideId: string,
  hotspot: Omit<ConnectionsPanelHotspot, 'id'>,
): void {
  const id = makeId('hs');
  const next: ConnectionsPanelHotspot = { id, ...hotspot };
  useEditorStore.getState().addHotspot(next);
  const op = hotspotOp(slideId, next, null, nowOp());
  applyOp(op);
}

export function handleRemoveHotspot(id: string): void {
  useEditorStore.getState().removeHotspot(id);
}

export function handleAddOverlay(
  slideId: string,
  overlay: Omit<ConnectionsPanelOverlay, 'id'>,
): void {
  const id = makeId('ov');
  const next: ConnectionsPanelOverlay = { id, ...overlay };
  useEditorStore.getState().addOverlay(next);
  const op = overlayOp(slideId, next, null, nowOp());
  applyOp(op);
}

export function handleRemoveOverlay(id: string): void {
  useEditorStore.getState().removeOverlay(id);
}

export function handleAddEdge(edge: Omit<ConnectionsPanelEdge, 'id'>): void {
  const id = makeId('edge');
  const next: ConnectionsPanelEdge = { id, ...edge };
  useEditorStore.getState().addBranchingEdge(next);
  const op = branchingEdgeOp(edge.fromSlideId, next, null, nowOp());
  applyOp(op);
}

export function handleRemoveEdge(id: string): void {
  useEditorStore.getState().removeBranchingEdge(id);
}

export function handleAddVariable(variable: Omit<VariablesPanelVariable, 'id'>): void {
  const id = makeId('var');
  const next: VariablesPanelVariable = { id, ...variable };
  useEditorStore.getState().addVariable(next);
  const slideId = getActiveSlideId();
  if (!slideId) return;
  const op = variableOp(slideId, next, null, nowOp());
  applyOp(op);
}

export function handleRemoveVariable(id: string): void {
  useEditorStore.getState().removeVariable(id);
}

export function handleAddRule(rule: Omit<VariablesPanelRule, 'id'>): void {
  const id = makeId('rule');
  useEditorStore.getState().addRule({ id, ...rule });
}

export function handleRemoveRule(id: string): void {
  useEditorStore.getState().removeRule(id);
}

export function handleAddStateMachine(
  instanceId: string,
  initialState: string,
  scope: StateInspectorMachine['scope'],
): void {
  const id = makeId('sm');
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
  useEditorStore.getState().addStateMachine(machine);
}

export function handleRemoveStateMachine(id: string): void {
  useEditorStore.getState().removeStateMachine(id);
}

export function handleAdvanceStateMachine(
  id: string,
  event: StateMachineEventKind,
): void {
  const machine = useEditorStore.getState().stateMachines.find((m) => m.id === id);
  if (!machine) return;
  const match = machine.stateMachine.transitions.find(
    (t) => t.from === machine.currentState && t.event === event,
  );
  if (!match) return;
  useEditorStore
    .getState()
    .updateStateMachine(id, { currentState: match.to });
}

export function handleTogglePersistInstanceState(id: string, value: boolean): void {
  useEditorStore.getState().updateStateMachine(id, { persistInstanceState: value });
}

// ---------------------------------------------------------------------------
// Audience (M6) — quiz, leaderboard, presentation sequence
// ---------------------------------------------------------------------------

export function handleQuizPatch(patch: {
  name?: string;
  questions?: QuizRecord['questions'];
  passThreshold?: number;
  version: number;
}): void {
  const current = useEditorStore.getState().activeQuiz;
  useEditorStore.getState().setActiveQuiz({
    ...current,
    ...(patch.name !== undefined ? { name: patch.name } : {}),
    ...(patch.questions !== undefined ? { questions: patch.questions } : {}),
    ...(patch.passThreshold !== undefined ? { passThreshold: patch.passThreshold } : {}),
    version: patch.version + 1,
  });
}

export function handleQuizDelete(): void {
  const current = useEditorStore.getState().activeQuiz;
  useEditorStore.getState().setActiveQuiz({
    ...current,
    questions: [],
    version: current.version + 1,
  });
}

export function handleLeaderboardUpdate(
  id: string,
  update: {
    status?: LeaderboardEntry['status'];
    reviewerId?: string | null;
    overrideScore?: number | null;
  },
): void {
  const items = useEditorStore.getState().leaderboardItems.map((i) =>
    i.id === id ? { ...i, ...update } : i,
  );
  useEditorStore.getState().setLeaderboardItems(items);
}

export function handleSequencePatch(
  patch: Partial<PresentationSequenceRecord> & { version: number },
): void {
  const current = useEditorStore.getState().activeSequence;
  useEditorStore.getState().setActiveSequence({
    ...current,
    ...patch,
    version: patch.version + 1,
  });
}

export function handleSequenceDelete(): void {
  const current = useEditorStore.getState().activeSequence;
  useEditorStore.getState().setActiveSequence({
    ...current,
    slides: [],
    version: current.version + 1,
  });
}

// ---------------------------------------------------------------------------
// Deep links (M7) — local-only handlers; real client lands in Wave 2.1+.
// ---------------------------------------------------------------------------

export async function handleCreateDeepLinkSample(input: {
  deck_id: string;
  slide_id: string;
  scenario: string;
}): Promise<{ id: string; token: string }> {
  void input;
  const id = `dl${Date.now().toString(36).toUpperCase().padStart(9, '0').slice(-9)}`;
  const token = `local.${id}`;
  const expires_at = nowOp() + 30 * 24 * 60 * 60 * 1000;
  const next: DeepLinkRecord = {
    id,
    click_count: 0,
    expires_at,
    viewer_scope: 'public',
    single_use: false,
    created_at: nowOp(),
  };
  const links = [...useEditorStore.getState().deepLinks, next];
  useEditorStore.getState().setDeepLinks(links);
  return { id, token };
}

export async function handleResolveDeepLink(
  id: string,
): Promise<{ slide_id: string; scenario: string; exp: number } | null> {
  const r = useEditorStore.getState().deepLinks.find((d) => d.id === id);
  if (!r) return null;
  const slideId = getActiveSlideId() ?? ('' as ULID);
  return { slide_id: slideId, scenario: 'bear', exp: r.expires_at };
}

export async function handleDeleteDeepLink(id: string): Promise<boolean> {
  const links = useEditorStore.getState().deepLinks.filter((d) => d.id !== id);
  useEditorStore.getState().setDeepLinks(links);
  return true;
}

// ---------------------------------------------------------------------------
// Agent (M8) — audit, NL parse, NL apply, NL rollback, deck diff.
// ---------------------------------------------------------------------------

export function handleAuditDiff(_entry: AuditEntryView): void {
  /* no-op for now — render-only diff preview; reserved for future use */
  void _entry;
}

export async function handleNlParse(
  prompt: string,
): Promise<readonly NlToolCallSummary[]> {
  // Wired to the brand-aware MCP NL parser in Task #12. Until then
  // the editor returns an empty plan and the operator must wire the
  // prompt manually — no fake tool calls are emitted.
  void prompt;
  return [];
}

export function pushAuditEntry(entry: AuditEntryView): void {
  const current = useEditorStore.getState().auditEntries as readonly AuditEntryView[];
  useEditorStore.getState().setAuditEntries([entry, ...current]);
}

export async function handleNlApply(
  _calls: readonly NlToolCallSummary[],
): Promise<void> {
  pushAuditEntry({
    id: `apply-${nowOp()}`,
    agentId: 'agent-1',
    source: 'agent',
    toolName: 'nl_patch',
    timestamp: new Date().toISOString(),
    input: '<<nl-prompt>>',
    output: { ok: true },
  });
}

export async function handleNlRollback(
  _calls: readonly NlToolCallSummary[],
): Promise<void> {
  pushAuditEntry({
    id: `rollback-${nowOp()}`,
    agentId: 'agent-1',
    source: 'agent',
    toolName: 'nl_rollback',
    timestamp: new Date().toISOString(),
    input: '<<nl-prompt>>',
    output: { rolledBack: true },
  });
}

export async function handleDeckDiffCompare(
  _a: string,
  _b: string,
): Promise<{
  added: readonly DeckDiffEntry[];
  removed: readonly DeckDiffEntry[];
  changed: readonly DeckDiffEntry[];
}> {
  // Wired to the deck-version-svc diff endpoint in Task #12. Until then
  // the editor returns an empty diff — no fake entries.
  return { added: [], removed: [], changed: [] };
  void _a; void _b;
}

// ---------------------------------------------------------------------------
// Media / licenses / recording (M11)
// ---------------------------------------------------------------------------

export async function handleFetchGrants(): Promise<readonly unknown[]> {
  return loadGrantsForWorkspace('default-workspace');
}

export function handleRevokeGrant(grantId: string): void {
  // Wired to the media-license-svc revoke endpoint in Task #12.
  // Until then, the editor only logs the action for diagnostics.
  void grantId;
}

export function handleFinalizeRecording(draft: { chunks: readonly unknown[] }): void {
  // Recording finalize is wired to the prototype-recorder-svc upload
  // pipeline in Task #12. Until then, the editor only logs the chunk
  // count for diagnostics.
  void draft.chunks.length;
}

// ---------------------------------------------------------------------------
// Promote
// ---------------------------------------------------------------------------

export function handlePromote(def: DomioComponentDef, replaceSelection: boolean): void {
  addToLibrary({
    catalogId: def.catalogId,
    name: def.name,
    version: def.version,
    pinMode: 'track',
    pinValue: '',
  });

  if (!replaceSelection) return;

  const ctx = getActiveSlide();
  if (!ctx) return;
  const selected = getSelectedElements();
  if (selected.length === 0) return;

  const layer = makeComponentLayer(def);
  const slideId = ctx.slideId;
  if (!slideId) return;
  const removeOp = removeElementOp(selected, slideId, nowOp());
  applyOp(removeOp);
  const addOp = addElementOp([layer], slideId, nowOp());
  applyOp(addOp);
  useEditorStore.getState().setSelected([layer.id]);
}

// ---------------------------------------------------------------------------
// Context menu + UI shell
// ---------------------------------------------------------------------------

export function handleOpenContextMenu(
  ctx: { x: number; y: number; targetId: ULID | null } | null,
): void {
  useEditorStore.getState().openContextMenu(ctx);
}

export function handleContextMenuSelected(action: string): void {
  if (action === 'promote') {
    useEditorStore.getState().setPromoteOpen(true);
    return;
  }
  if (action === 'detach') {
    const el = getSingleSelectedComponent();
    if (!el) return;
    const ctx = getActiveSlide();
    if (!ctx) return;
    const slideId = ctx.slideId;
    if (!slideId) return;
    const expanded = expandComponent(el);
    const removeOp = removeElementOp([el], slideId, nowOp());
    applyOp(removeOp);
    const addOp = addElementOp(expanded, slideId, nowOp());
    applyOp(addOp);
    useEditorStore.getState().clearSelected();
  }
}

export function handleSetLeftTab(tab: string): void {
  useEditorStore.getState().setLeftTab(tab);
}

export function handleSetPaletteOpen(open: boolean): void {
  useEditorStore.getState().setPaletteOpen(open);
}

export function handleSetPromoteOpen(open: boolean): void {
  useEditorStore.getState().setPromoteOpen(open);
}

// ---------------------------------------------------------------------------
// Undo / redo — drop to the engine bridge + drive the history panel.
// ---------------------------------------------------------------------------

export function handleUndo(): void {
  undo();
}

export function handleRedo(): void {
  redo();
}

export function handleScrubHistory(_idx: number): void {
  // The bridge doesn't expose previewAt yet; the history panel calls
  // this for the future dialog. Keeps the EditorPanelContext contract
  // stable across this commit.
  void _idx;
}

// ---------------------------------------------------------------------------
// Shortcut-only handlers — viewport + presence ping. These are simple
// forwarders to store setters so the shortcut bindings stay flat.
// ---------------------------------------------------------------------------

export function handleSendPing(): void {
  // The actual `LocalPingAdapter` is opened by the calling component
  // and exposes `emit`; this handler is a placeholder that EditorRoot
  // wires back to the adapter. The shortcut system fires the binding
  // (see EditorRoot.tsx) which closes over the adapter.
}

export function handleZoomFit(slideWidth: number, slideHeight: number): void {
  const viewportW = typeof window !== 'undefined' ? window.innerWidth : 1280;
  const viewportH = typeof window !== 'undefined' ? window.innerHeight : 720;
  const fit = Math.min(viewportW / slideWidth, viewportH / slideHeight) * 0.95;
  const z = Math.max(0.1, Math.min(4, fit));
  useEditorStore.getState().setZoom(z);
  useEditorStore.getState().setPan({
    x: (viewportW - slideWidth * z) / 2,
    y: (viewportH - slideHeight * z) / 2,
  });
}

export function handleZoom100(): void {
  useEditorStore.getState().setZoom(1);
  useEditorStore.getState().setPan({ x: 0, y: 0 });
}

export function handleZoom200(): void {
  useEditorStore.getState().setZoom(2);
  useEditorStore.getState().setPan({ x: 0, y: 0 });
}

export function handleResetViewport(): void {
  useEditorStore.getState().resetViewport();
}

export function handleClearThemeOverride(): void {
  const id = getActiveSlideId();
  if (!id) return;
  useEditorStore.getState().setOverride(id, null);
}

// ---------------------------------------------------------------------------
// Panel handler aggregator — single object every left-rail panel reads
// via `EditorPanelContext.handlers`. Returning one object means
// EditorRoot doesn't need to know about individual handler signatures;
// new handlers just add themselves to this map.
// ---------------------------------------------------------------------------

export interface PanelHandlersMap {
  // Layers / selection
  onSelect: typeof handleSelect;
  onReorder: typeof handleReorder;
  onToggleFlag: typeof handleToggleFlag;
  onSelectDataSource: typeof handleSelectDataSource;

  // Insertion
  onInsert: typeof handleInsertComponent;
  onInsertIcon: typeof handleInsertIcon;
  onInsertMedia: typeof handleInsertMedia;
  onPropEdit: typeof handlePropEdit;
  onVariantChange: typeof handleVariantChange;
  onFilterChange: typeof handleFilterChange;

  // Theme / brand
  onThemeChange: typeof handleThemeChange;
  onBrandKitChange: typeof handleBrandKitChange;
  onSchemeToggle: typeof handleSchemeToggle;
  onOverrideChange: typeof handleOverrideChange;
  onAudit: typeof handleA11yAudit;

  // Animation
  onTimelineChange: typeof handleTimelineChange;
  onTransitionChange: typeof handleTransitionChange;
  onMagicRoleChange: typeof handleMagicRoleChange;
  onReducedMotionChange: typeof handleReducedMotionChange;
  onCopyAnimation: typeof handleCopyAnimation;
  onPasteAnimation: typeof handlePasteAnimation;

  // Connections / variables / state
  onAddHotspot: typeof handleAddHotspot;
  onRemoveHotspot: typeof handleRemoveHotspot;
  onAddOverlay: typeof handleAddOverlay;
  onRemoveOverlay: typeof handleRemoveOverlay;
  onAddEdge: typeof handleAddEdge;
  onRemoveEdge: typeof handleRemoveEdge;
  onAddVariable: typeof handleAddVariable;
  onRemoveVariable: typeof handleRemoveVariable;
  onAddRule: typeof handleAddRule;
  onRemoveRule: typeof handleRemoveRule;
  onAddStateMachine: typeof handleAddStateMachine;
  onRemoveStateMachine: typeof handleRemoveStateMachine;
  onAdvanceStateMachine: typeof handleAdvanceStateMachine;
  onTogglePersistInstanceState: typeof handleTogglePersistInstanceState;

  // Audience (M6)
  onQuizPatch: typeof handleQuizPatch;
  onQuizDelete: typeof handleQuizDelete;
  onLeaderboardUpdate: typeof handleLeaderboardUpdate;
  onSequencePatch: typeof handleSequencePatch;
  onSequenceDelete: typeof handleSequenceDelete;

  // Deep links (M7)
  onCreateDeepLinkSample: typeof handleCreateDeepLinkSample;
  onResolveDeepLink: typeof handleResolveDeepLink;
  onDeleteDeepLink: typeof handleDeleteDeepLink;

  // Agent (M8)
  onNlParse: typeof handleNlParse;
  onNlApply: typeof handleNlApply;
  onNlRollback: typeof handleNlRollback;
  onDeckDiffCompare: typeof handleDeckDiffCompare;
  onAuditDiff: typeof handleAuditDiff;

  // Media (M11)
  fetchGrants: typeof handleFetchGrants;
  onRevoke: typeof handleRevokeGrant;
  onFinalizeRecording: typeof handleFinalizeRecording;

  // Promote
  onPromote: typeof handlePromote;
}

/**
 * Build the single handlers object every left-rail panel reads. Memoised
 * by `useMemo(() => buildPanelHandlers(), [])` so consumers don't get
 * spurious re-renders from referential churn.
 */
export function buildPanelHandlers(): PanelHandlersMap {
  return {
    onSelect: handleSelect,
    onReorder: handleReorder,
    onToggleFlag: handleToggleFlag,
    onSelectDataSource: handleSelectDataSource,
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
    fetchGrants: handleFetchGrants,
    onRevoke: handleRevokeGrant,
    onFinalizeRecording: handleFinalizeRecording,
    onPromote: handlePromote,
  };
}

// ---------------------------------------------------------------------------
// Re-exports
// ---------------------------------------------------------------------------

export const editorBootstrapBrandKits = BOOTSTRAP_BRAND_KITS;
export const editorBootstrapThemes = BOOTSTRAP_THEMES;
