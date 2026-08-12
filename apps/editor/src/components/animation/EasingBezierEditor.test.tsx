/**
 * EasingBezierEditor — Wave 2 §S2.11 unit tests.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EasingBezierEditor, formatBezierTuple, parseBezierTuple, EASING_BEZIER_PRESETS } from './EasingBezierEditor';

/**
 * Fire a synthetic pointer event with explicit clientX/clientY.
 * jsdom's PointerEvent constructor doesn't honour init props on RTL's
 * `fireEvent.pointerMove`, so we craft the event manually.
 */
function firePointerEvent(target: Element, type: 'pointerdown' | 'pointermove' | 'pointerup' | 'pointercancel', init: { clientX: number; clientY: number; pointerId?: number }): void {
  const EventCtor = (typeof window !== 'undefined' && (window.PointerEvent || window.MouseEvent)) as typeof MouseEvent;
  const event = new EventCtor(type, { bubbles: true, cancelable: true, composed: true });
  // Override coordinates which jsdom doesn't initialise from the ctor.
  Object.defineProperty(event, 'clientX', { value: init.clientX, configurable: true });
  Object.defineProperty(event, 'clientY', { value: init.clientY, configurable: true });
  Object.defineProperty(event, 'pointerId', { value: init.pointerId ?? 1, configurable: true });
  Object.defineProperty(event, 'pointerType', { value: 'mouse', configurable: true });
  target.dispatchEvent(event);
}

describe('EasingBezierEditor', () => {
  it('renders the editor with two draggable handles', () => {
    render(<EasingBezierEditor value={[0.42, 0, 0.58, 1]} onChange={vi.fn()} />);
    expect(screen.getByTestId('easing-bezier-editor')).toBeInTheDocument();
    expect(screen.getByTestId('easing-bezier-handle-0')).toBeInTheDocument();
    expect(screen.getByTestId('easing-bezier-handle-1')).toBeInTheDocument();
  });

  it('renders the formatted readout', () => {
    render(<EasingBezierEditor value={[0.25, 0.1, 0.25, 1]} onChange={vi.fn()} />);
    expect(screen.getByTestId('easing-bezier-readout').textContent).toContain('cubic-bezier(0.25, 0.1, 0.25, 1)');
  });

  it('renders fixed anchors at (0, size) and (size, 0)', () => {
    render(<EasingBezierEditor value={[0.42, 0, 0.58, 1]} onChange={vi.fn()} size={200} />);
    expect(screen.getByTestId('easing-bezier-anchor-0')).toBeInTheDocument();
    expect(screen.getByTestId('easing-bezier-anchor-1')).toBeInTheDocument();
  });

  it('does not commit during drag (live preview only)', () => {
    const onChange = vi.fn();
    const { container } = render(
      <EasingBezierEditor value={[0.42, 0, 0.58, 1]} onChange={onChange} size={200} />,
    );
    const svg = container.querySelector('svg')!;
    vi.spyOn(svg, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      right: 200,
      bottom: 200,
      width: 200,
      height: 200,
      x: 0,
      y: 0,
      toJSON() {
        return this;
      },
    });
    firePointerEvent(screen.getByTestId('easing-bezier-handle-0'), 'pointerdown', { clientX: 0, clientY: 0 });
    firePointerEvent(svg, 'pointermove', { clientX: 50, clientY: 50 });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('commits onChange on pointer-up after a drag', () => {
    const onChange = vi.fn();
    const { container } = render(
      <EasingBezierEditor value={[0.42, 0, 0.58, 1]} onChange={onChange} size={200} />,
    );
    const svg = container.querySelector('svg')!;
    // jsdom doesn't track layout; provide a bounding rect so eventToSvg
    // can compute coordinate fractions.
    vi.spyOn(svg, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      right: 200,
      bottom: 200,
      width: 200,
      height: 200,
      x: 0,
      y: 0,
      toJSON() {
        return this;
      },
    });
    firePointerEvent(screen.getByTestId('easing-bezier-handle-0'), 'pointerdown', { clientX: 0, clientY: 0 });
    firePointerEvent(svg, 'pointermove', { clientX: 80, clientY: 80 });
    firePointerEvent(svg, 'pointerup', { clientX: 80, clientY: 80 });
    expect(onChange).toHaveBeenCalledTimes(1);
    const tuple = onChange.mock.calls[0]?.[0];
    expect(tuple[0]).toBeGreaterThan(0); // moved right
    expect(tuple[1]).toBeGreaterThan(0); // moved down (svg-y -> easing-y)
  });

  it('read-only mode disables drag commit', () => {
    const onChange = vi.fn();
    const { container } = render(
      <EasingBezierEditor value={[0.42, 0, 0.58, 1]} onChange={onChange} size={200} readOnly />,
    );
    const svg = container.querySelector('svg')!;
    vi.spyOn(svg, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      right: 200,
      bottom: 200,
      width: 200,
      height: 200,
      x: 0,
      y: 0,
      toJSON() {
        return this;
      },
    });
    firePointerEvent(screen.getByTestId('easing-bezier-handle-0'), 'pointerdown', { clientX: 0, clientY: 0 });
    firePointerEvent(svg, 'pointermove', { clientX: 90, clientY: 50 });
    firePointerEvent(svg, 'pointerup', { clientX: 90, clientY: 50 });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('applies the read-only attribute when readOnly is set', () => {
    render(<EasingBezierEditor value={[0.42, 0, 0.58, 1]} onChange={vi.fn()} readOnly />);
    expect(screen.getByTestId('easing-bezier-editor')).toHaveAttribute('data-readonly', 'true');
  });
});

describe('parseBezierTuple', () => {
  it('parses the canonical ease-in-out curve', () => {
    expect(parseBezierTuple('cubic-bezier(0.42, 0, 0.58, 1)')).toEqual([0.42, 0, 0.58, 1]);
  });

  it('tolerates whitespace', () => {
    expect(parseBezierTuple('cubic-bezier( 0.25 , 0.1 , 0.25 , 1 )')).toEqual([0.25, 0.1, 0.25, 1]);
  });

  it('rejects invalid input', () => {
    expect(parseBezierTuple('ease-in')).toBeNull();
    expect(parseBezierTuple('cubic-bezier(0.25, 0.1)')).toBeNull();
  });
});

describe('formatBezierTuple', () => {
  it('round-trips through parseBezierTuple', () => {
    const t: [number, number, number, number] = [0.42, 0, 0.58, 1];
    const formatted = formatBezierTuple(t);
    expect(formatted.startsWith('cubic-bezier(')).toBe(true);
    expect(parseBezierTuple(formatted)).toEqual(t);
  });

  it('trims trailing zeros', () => {
    expect(formatBezierTuple([0, 0, 1, 1])).toBe('cubic-bezier(0, 0, 1, 1)');
  });
});

describe('EASING_BEZIER_PRESETS', () => {
  it('exposes the four standard CSS easing names', () => {
    const names = EASING_BEZIER_PRESETS.map((p) => p.name);
    expect(names).toContain('linear');
    expect(names).toContain('ease-in');
    expect(names).toContain('ease-out');
    expect(names).toContain('ease-in-out');
  });

  it('every preset tuple round-trips through parseBezierTuple', () => {
    for (const preset of EASING_BEZIER_PRESETS) {
      // Presets are in cubic-bezier(x1,y1,x2,y2) order; format them so the
      // parser accepts the input.
      const formatted = formatBezierTuple(preset.value);
      expect(parseBezierTuple(formatted)).toEqual(preset.value);
    }
  });
});