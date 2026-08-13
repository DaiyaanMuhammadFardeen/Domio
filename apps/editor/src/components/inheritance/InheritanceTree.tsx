/**
 * InheritanceTree — visualization of every deck derived from a master.
 *
 * Per Wave 11 §S11.8 of docs/frontend-roadmap/11-wave-novel-frontier.md.
 *
 * Root node = the master deck (parent_id === null). Children = every
 * derived deck connected via an InheritanceEdge. Each node renders the
 * deck title, version, last-synced timestamp, and a colored sync-status
 * badge (in-sync / diverged / pending). Hover surfaces quick stats;
 * click selects the node so the parent can act on it.
 */

'use client';

import { useMemo, type ReactElement } from 'react';
import { FormattedMessage } from '@domio/ui';
import type {
  DeckNode,
  InheritanceEdge,
  SyncStatus,
} from '../../lib/inheritance-service';
import { findMaster, groupChildrenByParent } from '../../lib/inheritance-service';

export interface InheritanceTreeProps {
  readonly nodes: readonly DeckNode[];
  readonly edges: readonly InheritanceEdge[];
  /** Currently-selected node id. */
  readonly selectedId?: string | null;
  /** Invoked when the user clicks a node. */
  readonly onSelect?: (nodeId: string) => void;
  readonly dataTestId?: string;
}

interface NodeRowProps {
  readonly node: DeckNode;
  readonly depth: number;
  readonly isMaster: boolean;
  readonly isSelected: boolean;
  readonly onSelect?: ((nodeId: string) => void) | undefined;
  readonly dataTestId: string;
}

const STATUS_COLOR: Record<SyncStatus, string> = {
  in_sync: '#16a34a',
  diverged: '#dc2626',
  pending: '#a16207',
};

const STATUS_BG: Record<SyncStatus, string> = {
  in_sync: 'rgba(22, 163, 74, 0.08)',
  diverged: 'rgba(220, 38, 38, 0.08)',
  pending: 'rgba(161, 98, 7, 0.12)',
};

function formatRelative(ms: number, now: number = Date.now()): string {
  const diff = now - ms;
  if (diff < 0) return 'in the future';
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(ms).toLocaleDateString();
}

function StatusBadge({ status }: { status: SyncStatus }): ReactElement {
  const id =
    status === 'in_sync'
      ? 'editor.inheritance.tree.status.inSync'
      : status === 'diverged'
      ? 'editor.inheritance.tree.status.diverged'
      : 'editor.inheritance.tree.status.pending';
  return (
    <span
      data-testid={`inheritance-tree-badge-${status}`}
      style={{
        display: 'inline-block',
        padding: '2px 8px',
        borderRadius: 999,
        background: STATUS_BG[status],
        color: STATUS_COLOR[status],
        fontSize: 11,
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: 0.3,
      }}
    >
      <FormattedMessage id={id} />
    </span>
  );
}

function NodeRow({
  node,
  depth,
  isMaster,
  isSelected,
  onSelect,
  dataTestId,
}: NodeRowProps): ReactElement {
  const indent = depth * 18;
  const handleClick = (): void => {
    onSelect?.(node.id);
  };
  const hoverStats: string[] = [
    `${node.slide_count} slides`,
    `version ${node.version}`,
    `synced ${formatRelative(node.last_synced_at_ms)}`,
  ];
  return (
    <button
      type="button"
      onClick={handleClick}
      data-testid={`${dataTestId}-node-${node.id}`}
      data-selected={isSelected}
      data-status={node.sync_status}
      title={hoverStats.join(' • ')}
      style={{
        display: 'flex',
        width: '100%',
        textAlign: 'left',
        alignItems: 'center',
        gap: 12,
        padding: '10px 12px',
        paddingLeft: 12 + indent,
        margin: '4px 0',
        border: `1px solid ${isSelected ? '#3b82f6' : 'rgba(0,0,0,0.12)'}`,
        borderRadius: 6,
        background: isSelected ? 'rgba(59,130,246,0.06)' : 'rgba(0,0,0,0.02)',
        cursor: 'pointer',
        font: 'inherit',
        color: 'inherit',
      }}
    >
      <span aria-hidden="true" style={{ fontSize: 14, opacity: 0.6, width: 14, textAlign: 'center' }}>
        {isMaster ? '★' : depth === 1 ? '└' : '·'}
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {node.title}
        </span>
        <span style={{ display: 'block', fontSize: 11, opacity: 0.65 }}>
          <FormattedMessage id="editor.inheritance.tree.lastSynced" /> {formatRelative(node.last_synced_at_ms)} · {node.version}
        </span>
      </span>
      <span aria-hidden="true" style={{ fontSize: 11, opacity: 0.6 }}>
        <FormattedMessage id="editor.inheritance.tree.slides" values={{ n: node.slide_count }} />
      </span>
      <StatusBadge status={node.sync_status} />
    </button>
  );
}

export function InheritanceTree({
  nodes,
  edges,
  selectedId,
  onSelect,
  dataTestId = 'inheritance-tree',
}: InheritanceTreeProps): ReactElement {
  const master = useMemo(() => findMaster(nodes), [nodes]);
  const grouped = useMemo(() => groupChildrenByParent(edges), [edges]);

  if (!master) {
    return (
      <div
        data-testid={dataTestId}
        style={{
          padding: 16,
          border: '1px dashed rgba(0,0,0,0.2)',
          borderRadius: 6,
          textAlign: 'center',
          opacity: 0.7,
        }}
      >
        No master deck selected.
      </div>
    );
  }

  const directChildren = grouped.get(master.id) ?? [];

  return (
    <div data-testid={dataTestId} role="tree" aria-label="Deck inheritance">
      <NodeRow
        node={master}
        depth={0}
        isMaster
        isSelected={selectedId === master.id}
        onSelect={onSelect}
        dataTestId={dataTestId}
      />
      {directChildren.map((edge) => {
        const child = nodes.find((n) => n.id === edge.child_id);
        if (!child) return null;
        return (
          <NodeRow
            key={edge.child_id}
            node={child}
            depth={1}
            isMaster={false}
            isSelected={selectedId === child.id}
            onSelect={onSelect}
            dataTestId={dataTestId}
          />
        );
      })}
    </div>
  );
}
