/**
 * OutlineTree — recursive tree view of the active slide's elements,
 * with collapse / expand and drag-reorder.
 *
 * Wave 2 §S2.2. The tree groups elements by `parentId` so a
 * `GroupLayer` (`type: 'group'`) renders as a parent and its
 * children render nested inside it. Drag-reorder is intentionally
 * the same `place: 'before' | 'after'` contract the flat list
 * uses, so the same `ReorderOp` paths apply.
 *
 * The component is presentational and stateless aside from local
 * collapse state — it does not own the selection or commit any
 * mutations directly.
 */

import { useCallback, useMemo, useState } from 'react';
import type { CSSProperties, ReactElement } from 'react';
import type { Element, ULID } from '@domio/schema/generated/scene-graph';

export interface OutlineTreeProps {
  slideElements: ReadonlyArray<Element>;
  selectedIds: ReadonlySet<ULID>;
  onSelect: (id: ULID, modifiers: { shift: boolean; alt: boolean }) => void;
  onReorder: (sourceId: ULID, targetId: ULID, place: 'before' | 'after') => void;
  onToggleFlag: (id: ULID, flag: 'locked' | 'hidden') => void;
}

interface OutlineNode {
  element: Element;
  children: OutlineNode[];
}

function buildTree(elements: ReadonlyArray<Element>): OutlineNode[] {
  const byParent = new Map<ULID | null, Element[]>();
  for (const el of elements) {
    const list = byParent.get(el.parentId) ?? [];
    list.push(el);
    byParent.set(el.parentId, list);
  }
  const build = (parent: ULID | null): OutlineNode[] => {
    const kids = byParent.get(parent) ?? [];
    // Sort siblings by z (descending — top of stack first).
    kids.sort((a, b) => (b.z ?? 0) - (a.z ?? 0));
    return kids.map((el) => ({
      element: el,
      children: build(el.id),
    }));
  };
  return build(null);
}

export function OutlineTree(props: OutlineTreeProps): ReactElement {
  const { slideElements, selectedIds, onSelect, onReorder, onToggleFlag } = props;
  const tree = useMemo(() => buildTree(slideElements), [slideElements]);
  const [collapsed, setCollapsed] = useState<Set<ULID>>(new Set());
  const [dragId, setDragId] = useState<ULID | null>(null);

  const toggleCollapse = useCallback((id: ULID) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const onDragStart = useCallback((id: ULID) => setDragId(id), []);
  const onDragEnd = useCallback(() => setDragId(null), []);

  const renderNode = (node: OutlineNode, depth: number): ReactElement => {
    const isGroup = node.element.type === 'group';
    const isCollapsed = collapsed.has(node.element.id);
    const isSelected = selectedIds.has(node.element.id);
    const isDragging = dragId === node.element.id;

    return (
      <li
        key={node.element.id}
        className={[
          'outline-tree__node',
          isGroup ? 'is-group' : '',
          isSelected ? 'is-selected' : '',
          isDragging ? 'is-dragging' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        draggable
        onDragStart={() => onDragStart(node.element.id)}
        onDragEnd={onDragEnd}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          if (!dragId || dragId === node.element.id) return;
          const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
          const place = e.clientY < rect.top + rect.height / 2 ? 'before' : 'after';
          onReorder(dragId, node.element.id, place);
          setDragId(null);
        }}
        data-element-id={node.element.id}
      >
        <div
          className="outline-tree__row"
          style={{ paddingLeft: depth * 12 + 8 } as CSSProperties}
        >
          {isGroup ? (
            <button
              type="button"
              aria-label={isCollapsed ? 'Expand group' : 'Collapse group'}
              onClick={() => toggleCollapse(node.element.id)}
              className="outline-tree__caret"
              style={{ width: 16, marginRight: 4 }}
            >
              {isCollapsed ? '▶' : '▼'}
            </button>
          ) : (
            <span style={{ width: 16, marginRight: 4, display: 'inline-block' }} />
          )}
          <button
            type="button"
            className="outline-tree__label"
            onClick={(e) =>
              onSelect(node.element.id, { shift: e.shiftKey, alt: e.altKey })
            }
          >
            <span className={`outline-tree__type outline-tree__type--${node.element.type}`}>
              {node.element.type}
            </span>
            <span className="outline-tree__name">{node.element.name}</span>
          </button>
          <span className="outline-tree__actions">
            <button
              type="button"
              aria-label="Toggle lock"
              aria-pressed={node.element.locked === true}
              onClick={() => onToggleFlag(node.element.id, 'locked')}
            >
              {node.element.locked ? '🔒' : '🔓'}
            </button>
            <button
              type="button"
              aria-label="Toggle hide"
              aria-pressed={node.element.hidden === true}
              onClick={() => onToggleFlag(node.element.id, 'hidden')}
            >
              {node.element.hidden ? '◉' : '◌'}
            </button>
          </span>
        </div>
        {isGroup && !isCollapsed && node.children.length > 0 ? (
          <ul className="outline-tree__children" role="group">
            {node.children.map((child) => renderNode(child, depth + 1))}
          </ul>
        ) : null}
      </li>
    );
  };

  return (
    <ul className="outline-tree" role="tree" aria-label="Slide outline">
      {tree.map((node) => renderNode(node, 0))}
    </ul>
  );
}