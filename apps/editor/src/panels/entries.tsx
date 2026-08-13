/**
 * Per-panel entry modules — adapt each existing panel to the
 * `EditorPanelContext` shape consumed by the registry.
 *
 * Per Wave 1 §S1.1 of docs/frontend-roadmap/01-wave-productionization.md.
 *
 * Each entry is a single-responsibility (SOLID S) adapter: it pulls
 * only the fields + handlers it needs from the shared context and
 * forwards them to the underlying panel. The existing panel
 * implementations are untouched.
 *
 * Open/closed: adding a new panel requires a new entry here and
 * one line in `registry.ts`. No edits to EditorRoot or to other
 * adapters.
 */

import type { ReactElement } from 'react';
import type { EditorPanelContext, EditorPanelComponent, PanelModule } from './context';
import { LayersPanel } from './LayersPanel';
import { InsertPanel } from './InsertPanel';
import { PropsPanel } from './PropsPanel';
import { LibraryPanel } from './library-panel';
import { StickersPanel } from './stickers-panel';
import { IconPicker } from './icon-picker';
import { ThemeBrandPanel } from './theme-brand-panel';
import { ThemePanel } from '../components/brand/ThemePanel';
import { DataSourcePanel } from './data-source-panel';
import { FiltersPanel } from './filters-panel';
import { AnimationsPanel } from './animations-panel';
import { ConnectionsPanel } from './connections-panel';
import { VariablesPanel } from './variables-panel';
import { StateInspectorPanel } from './state-inspector-panel';
import { DeepLinksPanel } from './deep-links-panel';
import { QuizPanel } from './quiz-panel';
import { LeaderboardPanel } from './leaderboard-panel';
import { SequenceInspectorPanel } from './sequence-inspector-panel';
import { MediaPanel } from './media-panel';
import { LicenseDashboard } from './license-dashboard';
import { RecordingPanel } from './recording-panel';
import { NlPatchPanel, type NlToolCallSummary } from './nl-patch-panel';
import { DeckDiffPanel, type DeckDiffEntry } from './deck-diff-panel';
import { MarketplacePanel } from './marketplace-panel';
import { CanvasControlsPanel } from './canvas-controls-panel';
import { OutlineApproval } from '../components/copilot/OutlineApproval';
import { AuditTrail, type AuditEntryView } from '../components/prototyping/agent/AuditTrail';
import { PrototypingPanel } from '../components/prototyping/PrototypingPanel';
import { DeviceFramePicker } from '../components/prototyping/DeviceFramePicker';

// ---------------------------------------------------------------------------
// Core / structure
// ---------------------------------------------------------------------------

export const LayersEntry: PanelModule = {
  Component: (ctx: EditorPanelContext): ReactElement | null => {
    if (!ctx.state.activeSlide) return null;
    const { onSelect, onReorder, onToggleFlag } = ctx.handlers;
    if (!onSelect || !onReorder || !onToggleFlag) return null;
    return (
      <LayersPanel
        slide={ctx.state.activeSlide}
        selectedIds={ctx.state.selectedIds}
        onSelect={onSelect}
        onReorder={onReorder}
        onToggleFlag={onToggleFlag}
      />
    );
  },
};

export const InsertEntry: PanelModule = {
  Component: (ctx: EditorPanelContext): ReactElement | null => {
    if (!ctx.handlers.onInsert) return null;
    return (
      <InsertPanel
        onInsert={ctx.handlers.onInsert}
        onInsertSection={ctx.handlers.onInsertSection}
        onInsertTemplate={ctx.handlers.onInsertTemplate}
        onInsertStockImage={ctx.handlers.onInsertStockImage}
        onInsertLottie={ctx.handlers.onInsertLottie}
        onInsertIcon={ctx.handlers.onInsertIcon}
      />
    );
  },
};

export const LibraryEntry: PanelModule = {
  Component: (ctx: EditorPanelContext): ReactElement | null => {
    if (!ctx.handlers.onInsert) return null;
    return <LibraryPanel onInsert={ctx.handlers.onInsert} />;
  },
};

export const StickersEntry: PanelModule = {
  Component: (ctx: EditorPanelContext): ReactElement | null => {
    if (!ctx.handlers.onInsert) return null;
    return <StickersPanel onInsert={ctx.handlers.onInsert} />;
  },
};

export const IconsEntry: PanelModule = {
  Component: (ctx: EditorPanelContext): ReactElement | null => {
    if (!ctx.handlers.onInsertIcon) return null;
    return <IconPicker onInsert={ctx.handlers.onInsertIcon} />;
  },
};

export const ThemeBrandEntry: PanelModule = {
  Component: (ctx: EditorPanelContext): ReactElement | null => {
    const h = ctx.handlers;
    // The new ThemePanel supersedes the legacy one. If the host
    // doesn't provide the extended kit-detail + handlers, fall back
    // to the legacy panel so existing contexts keep rendering.
    const hasFullSurface =
      !!h.onKitDetailChange &&
      !!h.onSlideKitChange &&
      !!h.onMarketplaceInstall &&
      !!h.onDarkGenerated &&
      !!h.onLintFix;
    if (!hasFullSurface) {
      if (
        !h.onThemeChange ||
        !h.onBrandKitChange ||
        !h.onSchemeToggle ||
        !h.onOverrideChange ||
        !h.onAudit
      ) {
        return null;
      }
      return (
        <ThemeBrandPanel
          themes={ctx.themes}
          activeThemeId={ctx.state.activeThemeId}
          onThemeChange={h.onThemeChange}
          brandKits={ctx.brandKits}
          activeBrandKitId={ctx.state.activeBrandKitId}
          onBrandKitChange={h.onBrandKitChange}
          colorScheme={ctx.state.colorScheme}
          onSchemeToggle={h.onSchemeToggle}
          override={ctx.state.override}
          onOverrideChange={h.onOverrideChange}
          a11yFindings={ctx.state.a11yFindings}
          onAudit={h.onAudit}
          isAuditing={ctx.state.isAuditing}
          slideId={ctx.state.activeSlideId}
        />
      );
    }
    return (
      <ThemePanel
        themes={ctx.themes}
        activeThemeId={ctx.state.activeThemeId}
        onThemeChange={h.onThemeChange ?? (() => {})}
        brandKits={ctx.brandKits}
        activeBrandKitId={ctx.state.activeBrandKitId}
        onBrandKitChange={h.onBrandKitChange ?? (() => {})}
        colorScheme={ctx.state.colorScheme}
        onSchemeToggle={h.onSchemeToggle ?? (() => {})}
        override={ctx.state.override}
        onOverrideChange={h.onOverrideChange ?? (() => {})}
        activeKitDetail={ctx.state.activeKitDetail}
        onKitDetailChange={h.onKitDetailChange ?? (() => {})}
        slideKitId={ctx.state.slideKitId}
        onSlideKitChange={h.onSlideKitChange ?? (() => {})}
        lintElements={ctx.state.lintElements}
        onLintFix={h.onLintFix ?? (() => {})}
        onMarketplaceInstall={h.onMarketplaceInstall ?? (() => {})}
        onDarkGenerated={h.onDarkGenerated ?? (() => {})}
      />
    );
  },
};

// ---------------------------------------------------------------------------
// Data / interaction
// ---------------------------------------------------------------------------

export const DataSourcesEntry: PanelModule = {
  Component: (ctx: EditorPanelContext): ReactElement | null => {
    if (!ctx.handlers.onSelectDataSource) return null;
    return (
      <DataSourcePanel selectedSourceId={null} onSelectSource={ctx.handlers.onSelectDataSource} />
    );
  },
};

export const FiltersEntry: PanelModule = {
  Component: (ctx: EditorPanelContext): ReactElement | null => {
    if (!ctx.handlers.onFilterChange) return null;
    return (
      <FiltersPanel
        filters={ctx.state.crossFilters as never}
        onChange={ctx.handlers.onFilterChange}
      />
    );
  },
};

export const AnimationsEntry: PanelModule = {
  Component: (ctx: EditorPanelContext): ReactElement | null => {
    const h = ctx.handlers;
    if (
      !h.onTimelineChange ||
      !h.onTransitionChange ||
      !h.onMagicRoleChange ||
      !h.onReducedMotionChange ||
      !h.onCopyAnimation ||
      !h.onPasteAnimation
    ) {
      return null;
    }
    return (
      <AnimationsPanel
        timeline={ctx.state.timeline}
        onTimelineChange={h.onTimelineChange}
        transition={ctx.state.transition}
        onTransitionChange={h.onTransitionChange}
        magicRole={ctx.state.magicRole}
        onMagicRoleChange={h.onMagicRoleChange}
        hasMatchingRole={false}
        reducedMotion={ctx.state.reducedMotion}
        onReducedMotionChange={h.onReducedMotionChange}
        copiedAnimation={ctx.state.copiedAnimation}
        onCopy={h.onCopyAnimation}
        onPaste={h.onPasteAnimation}
      />
    );
  },
};

export const ConnectionsEntry: PanelModule = {
  Component: (ctx: EditorPanelContext): ReactElement | null => {
    const h = ctx.handlers;
    if (
      !h.onAddHotspot ||
      !h.onRemoveHotspot ||
      !h.onAddEdge ||
      !h.onRemoveEdge ||
      !h.onAddOverlay ||
      !h.onRemoveOverlay
    ) {
      return null;
    }
    return (
      <ConnectionsPanel
        slides={ctx.state.deck.slides}
        activeSlideId={ctx.state.activeSlideId}
        hotspots={ctx.state.hotspots as never}
        overlays={ctx.state.overlays as never}
        edges={ctx.state.branchingEdges as never}
        onAddHotspot={h.onAddHotspot}
        onRemoveHotspot={h.onRemoveHotspot}
        onAddEdge={h.onAddEdge}
        onRemoveEdge={h.onRemoveEdge}
        onAddOverlay={h.onAddOverlay}
        onRemoveOverlay={h.onRemoveOverlay}
      />
    );
  },
};

/**
 * Wave 2 §S2.12 — Prototyping entry: voice triggers + gesture picker +
 * conditional logic builder + form palette.
 */
export const PrototypingEntry: PanelModule = {
  Component: (_ctx: EditorPanelContext): ReactElement | null => {
    return (
      <PrototypingPanel
        initialGestures={['click']}
        onChangeGestures={() => {
          // Persistence wired in once editor-store gains prototyping slots.
        }}
        onChangeTrigger={() => {}}
        onChangeLogic={() => {}}
        onInsertFormInput={() => {}}
      />
    );
  },
};

/**
 * Wave 2 §S2.12 — Device-frame picker entry. Used by the preview
 * chrome; surfaces both list + grid modes via `display` prop.
 */
export const DeviceFrameEntry: PanelModule = {
  Component: (_ctx: EditorPanelContext): ReactElement | null => {
    return (
      <DeviceFramePicker
        display="grid"
        onChange={() => {
          // Persistence wired in once editor-store gains preview frame slot.
        }}
      />
    );
  },
};

export const VariablesEntry: PanelModule = {
  Component: (ctx: EditorPanelContext): ReactElement | null => {
    const h = ctx.handlers;
    if (!h.onAddVariable || !h.onRemoveVariable || !h.onAddRule || !h.onRemoveRule) {
      return null;
    }
    return (
      <VariablesPanel
        variables={ctx.state.variables as never}
        rules={ctx.state.rules as never}
        onAddVariable={h.onAddVariable}
        onRemoveVariable={h.onRemoveVariable}
        onAddRule={h.onAddRule}
        onRemoveRule={h.onRemoveRule}
      />
    );
  },
};

export const DeepLinksEntry: PanelModule = {
  Component: (ctx: EditorPanelContext): ReactElement | null => {
    const h = ctx.handlers;
    if (!h.onCreateDeepLinkSample || !h.onResolveDeepLink || !h.onDeleteDeepLink) return null;
    return (
      <DeepLinksPanel
        deckId={ctx.state.deck.id}
        activeSlideId={ctx.state.activeSlideId}
        links={ctx.state.deepLinks as never}
        onCreateSample={h.onCreateDeepLinkSample}
        onResolve={h.onResolveDeepLink}
        onDelete={h.onDeleteDeepLink}
      />
    );
  },
};

// ---------------------------------------------------------------------------
// State machines (M3)
// ---------------------------------------------------------------------------

export const StateInspectorEntry: PanelModule = {
  Component: (ctx: EditorPanelContext): ReactElement | null => {
    const h = ctx.handlers;
    if (
      !h.onAddStateMachine ||
      !h.onRemoveStateMachine ||
      !h.onAdvanceStateMachine ||
      !h.onTogglePersistInstanceState
    ) {
      return null;
    }
    return (
      <StateInspectorPanel
        machines={ctx.state.stateMachines as never}
        activeSlideId={ctx.state.activeSlideId}
        onAddMachine={h.onAddStateMachine}
        onRemoveMachine={h.onRemoveStateMachine}
        onAdvance={h.onAdvanceStateMachine}
        onTogglePersistInstanceState={h.onTogglePersistInstanceState}
      />
    );
  },
};

// ---------------------------------------------------------------------------
// Audience (M6)
// ---------------------------------------------------------------------------

export const M6QuizzesEntry: PanelModule = {
  Component: (ctx: EditorPanelContext): ReactElement | null => {
    if (!ctx.handlers.onQuizPatch || !ctx.handlers.onQuizDelete) return null;
    return (
      <QuizPanel
        quiz={ctx.state.activeQuiz}
        onPatch={ctx.handlers.onQuizPatch}
        onDelete={ctx.handlers.onQuizDelete}
      />
    );
  },
};

export const M6LeaderboardEntry: PanelModule = {
  Component: (ctx: EditorPanelContext): ReactElement | null => {
    if (!ctx.handlers.onLeaderboardUpdate) return null;
    return (
      <LeaderboardPanel
        items={ctx.state.leaderboardItems as never}
        aggregates={ctx.state.leaderboardAggregates as never}
        onUpdate={ctx.handlers.onLeaderboardUpdate}
      />
    );
  },
};

export const M6SequenceEntry: PanelModule = {
  Component: (ctx: EditorPanelContext): ReactElement | null => {
    if (!ctx.handlers.onSequencePatch || !ctx.handlers.onSequenceDelete) return null;
    return (
      <SequenceInspectorPanel
        sequence={ctx.state.activeSequence}
        onPatch={ctx.handlers.onSequencePatch}
        onDelete={ctx.handlers.onSequenceDelete}
      />
    );
  },
};

// ---------------------------------------------------------------------------
// Agent (M8)
// ---------------------------------------------------------------------------

export const M8AuditEntry: PanelModule = {
  Component: (ctx: EditorPanelContext): ReactElement | null => {
    const onDiff = (ctx.handlers.onAuditDiff ?? (() => undefined)) as (
      entry: AuditEntryView,
    ) => void;
    return (
      <AuditTrail entries={ctx.state.auditEntries as readonly AuditEntryView[]} onDiff={onDiff} />
    );
  },
};

export const M8NlPatchEntry: PanelModule = {
  Component: (ctx: EditorPanelContext): ReactElement | null => {
    const h = ctx.handlers;
    if (!h.onNlParse || !h.onNlApply || !h.onNlRollback) return null;
    return (
      <NlPatchPanel
        deckId={ctx.state.deck.id}
        onParse={h.onNlParse as (prompt: string) => Promise<readonly NlToolCallSummary[]>}
        onApply={h.onNlApply as (calls: readonly NlToolCallSummary[]) => Promise<void>}
        onRollback={h.onNlRollback as (calls: readonly NlToolCallSummary[]) => Promise<void>}
      />
    );
  },
};

export const M8DeckDiffEntry: PanelModule = {
  Component: (ctx: EditorPanelContext): ReactElement | null => {
    if (!ctx.handlers.onDeckDiffCompare) return null;
    return (
      <DeckDiffPanel
        defaultDeckId={ctx.state.deck.id}
        onCompare={
          ctx.handlers.onDeckDiffCompare as (
            a: string,
            b: string,
          ) => Promise<{
            added: readonly DeckDiffEntry[];
            removed: readonly DeckDiffEntry[];
            changed: readonly DeckDiffEntry[];
          }>
        }
      />
    );
  },
};

// ---------------------------------------------------------------------------
// Media (M11)
// ---------------------------------------------------------------------------

export const M11MediaEntry: PanelModule = {
  Component: (ctx: EditorPanelContext): ReactElement | null => {
    if (!ctx.handlers.onPropEdit || !ctx.handlers.onInsertMedia) return null;
    return (
      <MediaPanel
        selectedKind={ctx.state.selectedMediaKind}
        selectedProps={ctx.state.selectedMediaProps}
        onPropEdit={ctx.handlers.onPropEdit}
        onInsert={ctx.handlers.onInsertMedia}
      />
    );
  },
};

export const M11LicensesEntry: PanelModule = {
  Component: (ctx: EditorPanelContext): ReactElement | null => {
    if (!ctx.handlers.fetchGrants || !ctx.handlers.onRevoke) return null;
    return (
      <LicenseDashboard
        workspaceId="default-workspace"
        fetchGrants={ctx.handlers.fetchGrants as () => Promise<readonly never[]>}
        onRevoke={ctx.handlers.onRevoke}
      />
    );
  },
};

export const M11RecordingEntry: PanelModule = {
  Component: (ctx: EditorPanelContext): ReactElement | null => {
    if (!ctx.handlers.onFinalizeRecording) return null;
    return (
      <RecordingPanel
        viewportWidth={1920}
        viewportHeight={1080}
        fps={30}
        onFinalize={ctx.handlers.onFinalizeRecording}
      />
    );
  },
};

// ---------------------------------------------------------------------------
// Copilot (P12) and marketplace
// ---------------------------------------------------------------------------

export const P12CopilotEntry: PanelModule = {
  Component: (): ReactElement => <OutlineApproval />,
};

export const MarketplaceEntry: PanelModule = {
  Component: (ctx: EditorPanelContext): ReactElement | null => {
    if (!ctx.handlers.onInsert) return null;
    return (
      <MarketplacePanel onInsert={ctx.handlers.onInsert} brandKitId={ctx.state.activeBrandKitId} />
    );
  },
};

// ---------------------------------------------------------------------------
// PropsPanel — not a left-rail tab, but lives on the right rail. Exporting
// the same shape so future refactors can move it to the registry too.
// ---------------------------------------------------------------------------

export const PropsEntry: PanelModule = {
  Component: (ctx: EditorPanelContext): ReactElement | null => {
    const el = ctx.state.selectedComponent;
    if (
      !el ||
      el.type !== 'component' ||
      !ctx.handlers.onPropEdit ||
      !ctx.handlers.onVariantChange
    ) {
      return null;
    }
    return (
      <PropsPanel
        element={el}
        onPropEdit={ctx.handlers.onPropEdit}
        onVariantChange={ctx.handlers.onVariantChange}
      />
    );
  },
};

export const HistoryEntry: PanelModule = {
  // History takes no panel-context handlers — engine state lives in the
  // shell. The shell renders it directly on the right rail rather than
  // through the registry.
  Component: (): ReactElement | null => null,
};

export const CanvasControlsEntry: PanelModule = {
  // Wave 2 §S2.1. The canvas chrome controls panel reads everything
  // it needs from the editor store and the viewport hook, so it
  // doesn't depend on any context handler.
  Component: (): ReactElement | null => <CanvasControlsPanel />,
};

// Type re-export so callers can import the component type.
export type { EditorPanelComponent };
