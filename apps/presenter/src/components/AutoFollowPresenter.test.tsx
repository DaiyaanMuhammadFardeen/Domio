/**
 * AutoFollowPresenter tests — S4.13.
 */

import { describe, it, expect, vi } from 'vitest';
import { createRef, type RefObject } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { AutoFollowPresenter } from './AutoFollowPresenter';

const RECT = { left: 0, top: 0, right: 100, bottom: 100, width: 100, height: 100, x: 0, y: 0, toJSON: () => '' };

function withRect(ref: RefObject<HTMLDivElement | null>): void {
  // Set the rect AFTER render, when ref.current is attached.
  if (ref.current) {
    Object.defineProperty(ref.current, 'getBoundingClientRect', {
      value: () => RECT,
      configurable: true,
    });
  }
}

describe('AutoFollowPresenter', () => {
  it('renders nothing visible when disabled', () => {
    const ref = createRef<HTMLDivElement>();
    const { container } = render(
      <div>
        <div ref={ref} style={{ width: 100, height: 100 }}>
          slide
        </div>
        <AutoFollowPresenter targetRef={ref} enabled={false} />
      </div>,
    );
    const node = container.querySelector('[data-testid="auto-follow-presenter"]');
    expect(node).toHaveAttribute('hidden');
  });

  it('emits pointer positions normalized to the target rect', () => {
    const ref = createRef<HTMLDivElement>();
    const onPointerMove = vi.fn();
    render(
      <div>
        <div ref={ref}>slide</div>
        <AutoFollowPresenter
          targetRef={ref}
          enabled={true}
          onPointerMove={onPointerMove}
        />
      </div>,
    );
    withRect(ref);
    fireEvent.mouseMove(window, { clientX: 50, clientY: 80 });
    const node = screen.getByTestId('auto-follow-presenter');
    expect(node).toHaveAttribute('data-enabled', 'true');
    expect(Number(node.getAttribute('data-x'))).toBeCloseTo(0.5, 1);
    expect(Number(node.getAttribute('data-y'))).toBeCloseTo(0.8, 1);
  });

it('clamps pointer values to 0..1', () => {
    const ref = createRef<HTMLDivElement>();
    render(
      <div>
        <div ref={ref}>slide</div>
        <AutoFollowPresenter targetRef={ref} enabled={true} />
      </div>,
    );
    withRect(ref);
    fireEvent.mouseMove(window, { clientX: 500, clientY: 500 });
    const node = screen.getByTestId('auto-follow-presenter');
    expect(Number(node.getAttribute('data-x'))).toBe(1);
    expect(Number(node.getAttribute('data-y'))).toBe(1);
  });
});
