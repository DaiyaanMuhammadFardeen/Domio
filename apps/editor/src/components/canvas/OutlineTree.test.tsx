import { describe, expect, it, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { OutlineTree } from './OutlineTree';
import type { Element, ULID } from '@domio/schema/generated/scene-graph';

function id(value: string): ULID {
  return value as unknown as ULID;
}

function makeElement(
  id: string,
  type: 'frame' | 'group',
  parentId: ULID | null,
  z: number,
  name = id,
): Element {
  return {
    id: id as unknown as ULID,
    semanticId: `sem-${id}`,
    name,
    type,
    parentId,
    z,
  } as unknown as Element;
}

describe('OutlineTree', () => {
  it('renders a flat list when no group exists', () => {
    const elements = [
      makeElement('a', 'frame', null, 1, 'A'),
      makeElement('b', 'frame', null, 2, 'B'),
    ];
    const { container } = render(
      <OutlineTree
        slideElements={elements}
        selectedIds={new Set()}
        onSelect={() => {}}
        onReorder={() => {}}
        onToggleFlag={() => {}}
      />,
    );
    const names = container.querySelectorAll('.outline-tree__name');
    expect(names).toHaveLength(2);
  });

  it('nests children under their group parent', () => {
    const elements = [
      makeElement('g', 'group', null, 10, 'G'),
      makeElement('a', 'frame', id('g'), 1, 'A'),
      makeElement('b', 'frame', id('g'), 2, 'B'),
    ];
    const { container } = render(
      <OutlineTree
        slideElements={elements}
        selectedIds={new Set()}
        onSelect={() => {}}
        onReorder={() => {}}
        onToggleFlag={() => {}}
      />,
    );
    // The group renders, the children render nested under it.
    expect(container.querySelector('.outline-tree__children')).toBeTruthy();
    const nestedRows = container.querySelectorAll('.outline-tree__children > li');
    expect(nestedRows).toHaveLength(2);
  });

  it('collapses and expands a group via the caret', () => {
    const elements = [
      makeElement('g', 'group', null, 10, 'G'),
      makeElement('a', 'frame', id('g'), 1, 'A'),
    ];
    const { container } = render(
      <OutlineTree
        slideElements={elements}
        selectedIds={new Set()}
        onSelect={() => {}}
        onReorder={() => {}}
        onToggleFlag={() => {}}
      />,
    );
    const caret = container.querySelector('.outline-tree__caret') as HTMLButtonElement;
    expect(caret).toBeTruthy();
    fireEvent.click(caret);
    // After collapse, the nested <ul> should be gone.
    expect(container.querySelector('.outline-tree__children')).toBeNull();
  });

  it('forwards onReorder with place: before / after', () => {
    const elements = [
      makeElement('a', 'frame', null, 1, 'A'),
      makeElement('b', 'frame', null, 2, 'B'),
    ];
    const onReorder = vi.fn();
    const { container } = render(
      <OutlineTree
        slideElements={elements}
        selectedIds={new Set()}
        onSelect={() => {}}
        onReorder={onReorder}
        onToggleFlag={() => {}}
      />,
    );
    const rows = container.querySelectorAll('li');
    // Simulate drag from row 0 to row 1. We don't need to construct
    // a DataTransfer object because the component reads from the
    // drop event's bounding rect, not the transfer data.
    fireEvent.dragStart(rows[0] as HTMLElement);
    fireEvent.dragOver(rows[1] as HTMLElement);
    fireEvent.drop(rows[1] as HTMLElement, { clientY: 0 });
    expect(onReorder).toHaveBeenCalled();
  });
});
