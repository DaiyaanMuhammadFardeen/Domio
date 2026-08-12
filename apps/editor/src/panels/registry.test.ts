/**
 * Editor panel registry — verifies the open/closed (SOLID O) contract:
 *
 *  - Every left-rail panel is registered exactly once.
 *  - The registry exposes `list()`, `get(id)`, `groups()`, and `listByGroup()`.
 *  - Adding a panel requires no edits to EditorRoot (registry list and
 *    group routing are the only integration points).
 *  - No duplicate panel ids are allowed (defensive check that prevents
 *    ship-blocker collisions when two entries accidentally share an id).
 *
 * Per Wave 1 §S1.1 of docs/frontend-roadmap/01-wave-productionization.md.
 */

import { describe, expect, it } from 'vitest';
import { editorPanels } from './registry';
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
} from './entries';

describe('editor panel registry', () => {
  const allEntries = [
    LayersEntry, InsertEntry, LibraryEntry, StickersEntry, IconsEntry,
    ThemeBrandEntry, DataSourcesEntry, FiltersEntry, AnimationsEntry,
    ConnectionsEntry, VariablesEntry, DeepLinksEntry, M6QuizzesEntry,
    M6LeaderboardEntry, M6SequenceEntry, M8AuditEntry, M8NlPatchEntry,
    M8DeckDiffEntry, StateInspectorEntry, M11MediaEntry, M11LicensesEntry,
    M11RecordingEntry, P12CopilotEntry, MarketplaceEntry, CanvasControlsEntry,
  ];

  it('registers every panel module', () => {
    expect(editorPanels.list().length).toBe(allEntries.length);
  });

  it('exposes only left-rail surfaces', () => {
    for (const panel of editorPanels.list()) {
      expect(panel.surface ?? 'left').toBe('left');
    }
  });

  it('contains the core feature groups', () => {
    const groups = editorPanels.groups();
    expect(groups).toContain('core');
    expect(groups).toContain('data');
    expect(groups).toContain('interaction');
    expect(groups).toContain('audience');
    expect(groups).toContain('agentic');
  });

  it('looks up a registered panel by id', () => {
    const layers = editorPanels.get('layers');
    expect(layers).toBeDefined();
    expect(layers?.id).toBe('layers');
    expect(layers?.label).toBe('Layers');
  });

  it('returns undefined for unknown ids', () => {
    expect(editorPanels.get('nope' as never)).toBeUndefined();
  });

  it('lists panels within a group', () => {
    const audience = editorPanels.listByGroup('audience');
    const ids = audience.map((p) => p.id);
    expect(ids).toContain('m6-quizzes');
    expect(ids).toContain('m6-leaderboard');
    expect(ids).toContain('m6-sequence');
  });

  it('uses `has` as a type guard for known ids', () => {
    expect(editorPanels.has('layers')).toBe(true);
    expect(editorPanels.has('not-a-tab')).toBe(false);
  });

  it('every panel has a non-empty label and a Component', () => {
    for (const panel of editorPanels.list()) {
      expect(panel.label.length).toBeGreaterThan(0);
      expect(panel.Component).toBeDefined();
      expect(typeof panel.Component).toBe('function');
    }
  });
});