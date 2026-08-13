/**
 * MotionPathEditor — Wave 2 §S2.11 unit tests.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MotionPathEditor } from './MotionPathEditor';
import { defaultMotionPath, type MotionPath } from '../../lib/motion-path';

function samplePath(): MotionPath {
  return {
    id: 'mp-1',
    origin: { x: 0, y: 0 },
    keyframes: [
      { timeMs: 0, x: 0, y: 0, controlOut: null },
      { timeMs: 500, x: 60, y: -20, controlOut: null },
      { timeMs: 1000, x: 0, y: 40, controlOut: null },
    ],
  };
}

describe('MotionPathEditor', () => {
  it('renders the canvas, keyframe list, and trigger selector', () => {
    render(<MotionPathEditor value={samplePath()} durationMs={1000} onChange={vi.fn()} />);
    expect(screen.getByTestId('motion-path-editor')).toBeInTheDocument();
    expect(screen.getByTestId('motion-path-canvas')).toBeInTheDocument();
    expect(screen.getByTestId('motion-path-trigger')).toBeInTheDocument();
  });

  it('renders one anchor per keyframe', () => {
    render(<MotionPathEditor value={samplePath()} durationMs={1000} onChange={vi.fn()} />);
    expect(screen.getByTestId('motion-path-anchor-0')).toBeInTheDocument();
    expect(screen.getByTestId('motion-path-anchor-1')).toBeInTheDocument();
    expect(screen.getByTestId('motion-path-anchor-2')).toBeInTheDocument();
  });

  it('renders the live preview dot', () => {
    render(<MotionPathEditor value={samplePath()} durationMs={1000} onChange={vi.fn()} />);
    expect(screen.getByTestId('motion-path-preview-dot')).toBeInTheDocument();
  });

  it('falls back to a default path when value is null', () => {
    render(<MotionPathEditor value={null} durationMs={1000} onChange={vi.fn()} />);
    expect(screen.getByTestId('motion-path-anchor-0')).toBeInTheDocument();
    expect(screen.getByTestId('motion-path-anchor-1')).toBeInTheDocument();
  });

  it('adds a keyframe when the add button is clicked', () => {
    const onChange = vi.fn();
    render(<MotionPathEditor value={samplePath()} durationMs={1000} onChange={onChange} />);
    fireEvent.click(screen.getByTestId('motion-path-add-keyframe'));
    expect(onChange).toHaveBeenCalledTimes(1);
    const arg = onChange.mock.calls[0]?.[0] as MotionPath;
    expect(arg.keyframes.length).toBe(4);
  });

  it('removes a keyframe when its remove button is clicked', () => {
    const onChange = vi.fn();
    render(<MotionPathEditor value={samplePath()} durationMs={1000} onChange={onChange} />);
    fireEvent.click(screen.getByTestId('motion-path-kf-remove-1'));
    expect(onChange).toHaveBeenCalledTimes(1);
    const arg = onChange.mock.calls[0]?.[0] as MotionPath;
    expect(arg.keyframes.length).toBe(2);
  });

  it('does not allow keyframe count to drop below 2', () => {
    const onChange = vi.fn();
    const minimal: MotionPath = {
      id: 'mp-min',
      origin: { x: 0, y: 0 },
      keyframes: [
        { timeMs: 0, x: 0, y: 0 },
        { timeMs: 1000, x: 0, y: 0 },
      ],
    };
    render(<MotionPathEditor value={minimal} durationMs={1000} onChange={onChange} />);
    fireEvent.click(screen.getByTestId('motion-path-kf-remove-0'));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByTestId('motion-path-kf-remove-0')).toBeDisabled();
  });

  it('fires onTriggerChange when the trigger dropdown changes', () => {
    const onTriggerChange = vi.fn();
    render(
      <MotionPathEditor
        value={samplePath()}
        durationMs={1000}
        onChange={vi.fn()}
        onTriggerChange={onTriggerChange}
      />,
    );
    fireEvent.change(screen.getByTestId('motion-path-trigger'), { target: { value: 'on_enter' } });
    expect(onTriggerChange).toHaveBeenCalledWith({ kind: 'on_enter' });
  });

  it('clears the path when the clear button is clicked', () => {
    const onChange = vi.fn();
    render(<MotionPathEditor value={samplePath()} durationMs={1000} onChange={onChange} />);
    fireEvent.click(screen.getByTestId('motion-path-clear'));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('shows the bezier easing editor for the first keyframe', () => {
    render(<MotionPathEditor value={samplePath()} durationMs={1000} onChange={vi.fn()} />);
    expect(screen.getByTestId('motion-path-easing-editor')).toBeInTheDocument();
  });

  it('read-only mode disables editing affordances', () => {
    render(<MotionPathEditor value={samplePath()} durationMs={1000} onChange={vi.fn()} readOnly />);
    expect(screen.getByTestId('motion-path-add-keyframe')).toBeDisabled();
    expect(screen.getByTestId('motion-path-clear')).toBeDisabled();
  });

  it('updates keyframe time when the time input is changed', () => {
    const onChange = vi.fn();
    render(<MotionPathEditor value={samplePath()} durationMs={1000} onChange={onChange} />);
    fireEvent.change(screen.getByTestId('motion-path-kf-time-1'), { target: { value: '750' } });
    expect(onChange).toHaveBeenCalledTimes(1);
    const arg = onChange.mock.calls[0]?.[0] as MotionPath;
    const k1 = arg.keyframes.find((k) => k.timeMs === 750);
    expect(k1).toBeTruthy();
  });

  it('updates keyframe x when the x input is changed', () => {
    const onChange = vi.fn();
    render(<MotionPathEditor value={samplePath()} durationMs={1000} onChange={onChange} />);
    fireEvent.change(screen.getByTestId('motion-path-kf-x-1'), { target: { value: '120' } });
    expect(onChange).toHaveBeenCalledTimes(1);
    const arg = onChange.mock.calls[0]?.[0] as MotionPath;
    expect(arg.keyframes[1]?.x).toBe(120);
  });

  it('renders the default-path when value is null', () => {
    const onChange = vi.fn();
    render(<MotionPathEditor value={null} durationMs={1000} onChange={onChange} />);
    // The default path has 2 keyframes; both anchors should render.
    expect(screen.getByTestId('motion-path-anchor-0')).toBeInTheDocument();
    expect(screen.getByTestId('motion-path-anchor-1')).toBeInTheDocument();
  });

  it('uses the supplied id on the root element', () => {
    render(
      <MotionPathEditor
        value={samplePath()}
        durationMs={1000}
        onChange={vi.fn()}
        id="custom-mp-id"
      />,
    );
    expect(screen.getByTestId('custom-mp-id')).toBeInTheDocument();
  });

  it('links the trigger select to the supplied trigger', () => {
    render(
      <MotionPathEditor
        value={samplePath()}
        durationMs={1000}
        onChange={vi.fn()}
        trigger={{ kind: 'on_data_change', seconds: 1, debounceMs: 0 }}
      />,
    );
    expect(screen.getByTestId('motion-path-trigger')).toHaveValue('on_data_change');
  });

  // Anchor that the default constant can be referenced.
  void defaultMotionPath;
});
