/**
 * Editor panel registry — single source of truth for the left rail.
 *
 * Per Wave 1 §S1.1 of docs/frontend-roadmap/01-wave-productionization.md.
 *
 * Every panel module under `entries.ts` is registered exactly once at
 * module load. The shell iterates `editorPanels.list()` to render
 * tab buttons and `editorPanels.get(id)?.Component` to render the
 * active panel — no `switch` statement, no hardcoded `leftTab === 'foo'`
 * branches.
 *
 * Open/closed (SOLID O): adding a 25th panel requires one new export
 * from `entries.ts` and one `register(...)` line here. EditorRoot.tsx
 * is untouched.
 */

import { createPanelRegistry, type PanelRegistry } from '@domio/ui';
import type { EditorLeftTab } from '../components/EditorRoot';
import type { EditorPanelContext } from './context';
import {
  LayersEntry,
  InsertEntry,
  LibraryEntry,
  StickersEntry,
  IconsEntry,
  ThemeBrandEntry,
  DataSourcesEntry,
  FiltersEntry,
  AnimationsEntry,
  ConnectionsEntry,
  VariablesEntry,
  DeepLinksEntry,
  M6QuizzesEntry,
  M6LeaderboardEntry,
  M6SequenceEntry,
  M8AuditEntry,
  M8NlPatchEntry,
  M8DeckDiffEntry,
  StateInspectorEntry,
  M11MediaEntry,
  M11LicensesEntry,
  M11RecordingEntry,
  P12CopilotEntry,
  MarketplaceEntry,
  CanvasControlsEntry,
  PrototypingEntry,
  DeviceFrameEntry,
} from './entries';
import { CopilotHubEntry } from './copilot-panel';

/**
 * Panel groups — used to organize the chrome (e.g. vertical separators
 * in the rail). Stable ordering; lower index = rendered earlier.
 */
export type EditorPanelGroup =
  | 'core'
  | 'data'
  | 'interaction'
  | 'audience'
  | 'agentic'
  | 'ai';

const REGISTRY = createPanelRegistry<EditorLeftTab, EditorPanelGroup, EditorPanelContext>();

// ---------------------------------------------------------------------------
// Register every panel. Order within each group is implicit by registration
// order; the `order` field is reserved for future per-group sorting.
// ---------------------------------------------------------------------------

REGISTRY.add({
  id: 'layers',
  label: 'Layers',
  group: 'core',
  surface: 'left',
  Component: LayersEntry.Component,
});
REGISTRY.add({
  id: 'insert',
  label: 'Insert',
  group: 'core',
  surface: 'left',
  Component: InsertEntry.Component,
});
REGISTRY.add({
  id: 'library',
  label: 'Library',
  group: 'core',
  surface: 'left',
  Component: LibraryEntry.Component,
});
REGISTRY.add({
  id: 'stickers',
  label: 'Stickers',
  group: 'core',
  surface: 'left',
  Component: StickersEntry.Component,
});
REGISTRY.add({
  id: 'icons',
  label: 'Icons',
  group: 'core',
  surface: 'left',
  Component: IconsEntry.Component,
});
REGISTRY.add({
  id: 'theme-brand',
  label: 'Theme',
  group: 'core',
  surface: 'left',
  Component: ThemeBrandEntry.Component,
});
REGISTRY.add({
  id: 'canvas-controls',
  label: 'Canvas',
  group: 'core',
  surface: 'left',
  Component: CanvasControlsEntry.Component,
});

REGISTRY.add({
  id: 'data-sources',
  label: 'Data',
  group: 'data',
  surface: 'left',
  Component: DataSourcesEntry.Component,
});
REGISTRY.add({
  id: 'filters',
  label: 'Filters',
  group: 'data',
  surface: 'left',
  Component: FiltersEntry.Component,
});

REGISTRY.add({
  id: 'animations',
  label: 'Animations',
  group: 'interaction',
  surface: 'left',
  Component: AnimationsEntry.Component,
});
REGISTRY.add({
  id: 'connections',
  label: 'Connections',
  group: 'interaction',
  surface: 'left',
  Component: ConnectionsEntry.Component,
});
REGISTRY.add({
  id: 'prototyping',
  label: 'Prototyping',
  group: 'interaction',
  surface: 'left',
  Component: PrototypingEntry.Component,
});
REGISTRY.add({
  id: 'device-frame',
  label: 'Device Frame',
  group: 'interaction',
  surface: 'left',
  Component: DeviceFrameEntry.Component,
});
REGISTRY.add({
  id: 'variables',
  label: 'Variables',
  group: 'interaction',
  surface: 'left',
  Component: VariablesEntry.Component,
});
REGISTRY.add({
  id: 'deep-links',
  label: 'Deep Links',
  group: 'interaction',
  surface: 'left',
  Component: DeepLinksEntry.Component,
});
REGISTRY.add({
  id: 'state-inspector',
  label: 'State inspector',
  group: 'interaction',
  surface: 'left',
  Component: StateInspectorEntry.Component,
});

REGISTRY.add({
  id: 'm6-quizzes',
  label: 'Quizzes',
  group: 'audience',
  surface: 'left',
  Component: M6QuizzesEntry.Component,
});
REGISTRY.add({
  id: 'm6-leaderboard',
  label: 'Leaderboard',
  group: 'audience',
  surface: 'left',
  Component: M6LeaderboardEntry.Component,
});
REGISTRY.add({
  id: 'm6-sequence',
  label: 'Sequence',
  group: 'audience',
  surface: 'left',
  Component: M6SequenceEntry.Component,
});

REGISTRY.add({
  id: 'm8-audit',
  label: 'Audit',
  group: 'agentic',
  surface: 'left',
  Component: M8AuditEntry.Component,
});
REGISTRY.add({
  id: 'm8-nl-patch',
  label: 'NL Patch',
  group: 'agentic',
  surface: 'left',
  Component: M8NlPatchEntry.Component,
});
REGISTRY.add({
  id: 'm8-deck-diff',
  label: 'Deck Diff',
  group: 'agentic',
  surface: 'left',
  Component: M8DeckDiffEntry.Component,
});
REGISTRY.add({
  id: 'p12-copilot',
  label: 'Copilot',
  group: 'agentic',
  surface: 'left',
  Component: P12CopilotEntry.Component,
});

REGISTRY.add({
  id: 'm11-media',
  label: 'Media',
  group: 'core',
  surface: 'left',
  Component: M11MediaEntry.Component,
});
REGISTRY.add({
  id: 'm11-licenses',
  label: 'Licenses',
  group: 'core',
  surface: 'left',
  Component: M11LicensesEntry.Component,
});
REGISTRY.add({
  id: 'm11-recording',
  label: 'Recording',
  group: 'core',
  surface: 'left',
  Component: M11RecordingEntry.Component,
});

REGISTRY.add({
  id: 'marketplace',
  label: 'Marketplace',
  group: 'core',
  surface: 'left',
  Component: MarketplaceEntry.Component,
});

REGISTRY.add({
  id: 'copilot-hub',
  label: 'Copilot Hub',
  group: 'ai',
  surface: 'right',
  Component: CopilotHubEntry.Component,
});

/**
 * The frozen registry instance. Single instance per process — registry
 * mutation is not expected at runtime.
 */
export const editorPanels: PanelRegistry<EditorLeftTab, EditorPanelGroup, EditorPanelContext> =
  REGISTRY;

export type EditorPanel = ReturnType<typeof editorPanels.list>[number];
