/**
 * SelectivePush — main inheritance management surface.
 *
 * Per Wave 11 §S11.8 of docs/frontend-roadmap/11-wave-novel-frontier.md.
 *
 * Layout:
 *   - Top: master deck selector (a small select listing every deck
 *     that has at least one derived child).
 *   - Middle: descent tree (InheritanceTree).
 *   - Bottom: actions — Push to downstream, Compare versions, Show
 *     conflicts.
 *
 * Pulls tree data from `listInheritanceTree` and slide / conflict data
 * from `listConflictingSlides`. The ConflictResolver panel is shown
 * inline when the user clicks "Show conflicts".
 */

'use client';

import { useCallback, useEffect, useMemo, useState, type ReactElement } from 'react';
import { FormattedMessage } from '@domio/ui';
import {
  listInheritanceTree,
  listConflictingSlides,
  pushSlides,
  type DeckNode,
  type InheritanceEdge,
  type SlideConflict,
} from '../../lib/inheritance-service';
import { findMaster } from '../../lib/inheritance-service';
import { InheritanceTree } from './InheritanceTree';
import { PropagateDialog, type PropagateSlide } from './PropagateDialog';
import { ConflictResolver } from './ConflictResolver';

export interface SelectivePushProps {
  /**
   * Optional list of decks the editor is currently working with.
   * The selector will default to the first entry whose `parent_id`
   * is `null` and which has at least one derived child.
   */
  readonly availableMasters?: readonly DeckNode[];
  /** Initial master deck id to load. */
  readonly initialMasterId?: string;
  /** Master deck title used to derive sample slide data. */
  readonly masterTitle?: string;
  /** Mock slide list fed into the PropagateDialog. */
  readonly masterSlides?: readonly PropagateSlide[];
  readonly dataTestId?: string;
}

const DEFAULT_MASTERS: readonly DeckNode[] = [
  {
    id: 'deck-master',
    title: 'Master Sales Deck',
    version: 'v18.2',
    parent_id: null,
    last_synced_at_ms: Date.now() - 3 * 60 * 60 * 1000,
    sync_status: 'in_sync',
    slide_count: 24,
  },
  {
    id: 'deck-product-master',
    title: 'Product Master',
    version: 'v7.0',
    parent_id: null,
    last_synced_at_ms: Date.now() - 12 * 60 * 60 * 1000,
    sync_status: 'in_sync',
    slide_count: 38,
  },
];

const DEFAULT_SLIDES: readonly PropagateSlide[] = (() => {
  const titles = [
    'Cover',
    'Agenda',
    'Pricing tiers overview',
    'Customer logos wall',
    'Security & compliance',
    'Integration partners',
    'Onboarding timeline',
    'Support SLA',
    'ROI calculator',
    'Case study: Globex',
    'Roadmap 2026',
    'Team intro',
    'FAQ',
  ];
  const now = Date.now();
  return titles.map((title, idx) => ({
    id: `s${idx + 1}`,
    title,
    lastChangedAtMs: now - (idx + 1) * 6 * 60 * 60 * 1000,
    affectedDeckCount: ((idx * 7) % 4) + 1,
  }));
})();

export function SelectivePush({
  availableMasters = DEFAULT_MASTERS,
  initialMasterId,
  masterTitle,
  masterSlides = DEFAULT_SLIDES,
  dataTestId = 'selective-push',
}: SelectivePushProps): ReactElement {
  const masters = availableMasters.filter((n) => n.parent_id === null);
  const initialMaster =
    masters.find((m) => m.id === initialMasterId)?.id ?? masters[0]?.id ?? 'deck-master';

  const [masterId, setMasterId] = useState<string>(initialMaster);
  const [nodes, setNodes] = useState<readonly DeckNode[]>([]);
  const [edges, setEdges] = useState<readonly InheritanceEdge[]>([]);
  const [conflicts, setConflicts] = useState<readonly SlideConflict[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [propagateOpen, setPropagateOpen] = useState<boolean>(false);
  const [showConflicts, setShowConflicts] = useState<boolean>(false);
  const [pushNotice, setPushNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [tree, cf] = await Promise.all([
        listInheritanceTree(masterId),
        listConflictingSlides(masterId),
      ]);
      setNodes(tree.nodes);
      setEdges(tree.edges);
      setConflicts(cf);
    } finally {
      setLoading(false);
    }
  }, [masterId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const onSelectMaster = useCallback((next: string) => {
    setMasterId(next);
    setSelectedNodeId(null);
    setShowConflicts(false);
  }, []);

  const onPush = useCallback(
    async (slideIds: readonly string[]) => {
      const result = await pushSlides(masterId, slideIds);
      setPushNotice(
        `Pushed ${slideIds.length} slide(s) to ${result.affected_decks.length} deck(s).`,
      );
      setPropagateOpen(false);
      await reload();
      // Auto-clear the notice after a few seconds so the UI doesn't stay cluttered.
      window.setTimeout(() => setPushNotice(null), 4000);
    },
    [masterId, reload],
  );

  const master = useMemo(() => findMaster(nodes), [nodes]);
  const displayTitle = master?.title ?? masterTitle ?? '';

  return (
    <section
      data-testid={dataTestId}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        padding: 16,
        background: 'white',
        color: '#111',
        borderRadius: 8,
        border: '1px solid rgba(0,0,0,0.08)',
      }}
    >
      <header>
        <h1 style={{ margin: 0, fontSize: 20 }}>
          <FormattedMessage id="editor.inheritance.heading" />
        </h1>
        <p style={{ margin: '4px 0 0', opacity: 0.7 }}>
          <FormattedMessage id="editor.inheritance.subheading" />
        </p>
      </header>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <label htmlFor={`${dataTestId}-master-select`} style={{ fontWeight: 600 }}>
          Master
        </label>
        <select
          id={`${dataTestId}-master-select`}
          data-testid={`${dataTestId}-master-select`}
          value={masterId}
          onChange={(e) => onSelectMaster(e.target.value)}
          style={{ padding: '4px 8px' }}
        >
          {masters.map((m) => (
            <option key={m.id} value={m.id}>
              {m.title} ({m.version})
            </option>
          ))}
        </select>
        <span style={{ marginLeft: 'auto', fontSize: 12, opacity: 0.6 }}>
          {loading ? 'Loading…' : `${nodes.length} deck(s)`}
        </span>
      </div>

      <div>
        <h2 style={{ margin: '0 0 8px', fontSize: 14, fontWeight: 600 }}>
          <FormattedMessage id="editor.inheritance.tree.heading" />
        </h2>
        <InheritanceTree
          nodes={nodes}
          edges={edges}
          selectedId={selectedNodeId}
          onSelect={setSelectedNodeId}
          dataTestId={`${dataTestId}-tree`}
        />
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button
          type="button"
          data-testid={`${dataTestId}-action-push`}
          onClick={() => setPropagateOpen(true)}
          style={{ padding: '6px 14px', cursor: 'pointer' }}
        >
          Push to downstream
        </button>
        <button
          type="button"
          data-testid={`${dataTestId}-action-compare`}
          onClick={() => setSelectedNodeId(selectedNodeId ? null : selectedNodeId)}
          disabled={!selectedNodeId}
          style={{
            padding: '6px 14px',
            cursor: selectedNodeId ? 'pointer' : 'not-allowed',
            opacity: selectedNodeId ? 1 : 0.5,
          }}
        >
          Compare versions
        </button>
        <button
          type="button"
          data-testid={`${dataTestId}-action-conflicts`}
          onClick={() => setShowConflicts((v) => !v)}
          style={{ padding: '6px 14px', cursor: 'pointer' }}
        >
          {showConflicts ? 'Hide conflicts' : `Show conflicts (${conflicts.length})`}
        </button>
      </div>

      {pushNotice ? (
        <div
          data-testid={`${dataTestId}-push-notice`}
          style={{
            padding: '8px 12px',
            background: 'rgba(22,163,74,0.08)',
            color: '#166534',
            borderRadius: 6,
            fontSize: 13,
          }}
        >
          {pushNotice}
        </div>
      ) : null}

      {showConflicts ? (
        <ConflictResolver
          conflicts={conflicts}
          onResolve={async () => {
            await reload();
          }}
          dataTestId={`${dataTestId}-conflicts`}
        />
      ) : null}

      <PropagateDialog
        open={propagateOpen}
        slides={masterSlides}
        masterTitle={displayTitle}
        onCancel={() => setPropagateOpen(false)}
        onPush={onPush}
        dataTestId={`${dataTestId}-propagate`}
      />
    </section>
  );
}
