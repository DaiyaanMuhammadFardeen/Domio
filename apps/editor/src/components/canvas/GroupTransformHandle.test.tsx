import { describe, expect, it, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import { GroupTransformHandle } from './GroupTransformHandle';
import type { Element } from '@domio/schema/generated/scene-graph';
import { useEditorStore, resetEditorStore } from '../../store/editor-store';

function makeElement(id: string, x: number, y: number, w: number, h: number): Element {
  return {
    id,
    semanticId: `sem-${id}`,
    name: id,
    type: 'frame',
    parentId: null,
    transform: { x, y, w, h },
  } as unknown as Element;
}

describe('GroupTransformHandle', () => {
  afterEach(() => {
    resetEditorStore();
  });

  it('renders nothing when no element has a transform', () => {
    const elements: Element[] = [
      { id: 'a', semanticId: 'sa', name: 'a', type: 'frame', parentId: null } as unknown as Element,
    ];
    const { container } = render(
      <GroupTransformHandle elements={elements} slideWidth={1600} slideHeight={900} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders the bounding rect and resize handles for 2 elements', () => {
    const elements = [makeElement('a', 100, 100, 200, 80), makeElement('b', 400, 200, 80, 80)];
    const { container } = render(
      <GroupTransformHandle elements={elements} slideWidth={1600} slideHeight={900} />,
    );
    // The stroke-dashed bounding box should exist.
    const box = container.querySelector('rect[stroke-dasharray]');
    expect(box).toBeTruthy();
    // 8 resize handles + (no rotation handle because none triggers rotateVisible? - actually with 2+ yes)
    const resizeHandles = container.querySelectorAll('rect[data-resize-edge]');
    expect(resizeHandles).toHaveLength(8);
    const rotationHandle = container.querySelector('[data-rotate-handle]');
    expect(rotationHandle).toBeTruthy();
  });

  it('hides the rotation handle for a single selection', () => {
    useEditorStore.setState({ zoom: 1, pan: { x: 0, y: 0 } });
    const elements = [makeElement('only', 50, 50, 30, 30)];
    const { container } = render(
      <GroupTransformHandle elements={elements} slideWidth={1600} slideHeight={900} />,
    );
    expect(container.querySelector('[data-rotate-handle]')).toBeNull();
  });
});
