/**
 * Model3DEditor — Wave 2 §S2.10 unit tests.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Model3DEditor } from './Model3DEditor';

describe('Model3DEditor', () => {
  it('renders the viewport', () => {
    render(
      <Model3DEditor
        src="model.glb"
        hotspots={[]}
        keyframes={[]}
        onHotspotsChange={vi.fn()}
        onKeyframesChange={vi.fn()}
      />,
    );
    expect(screen.getByTestId('model3d-editor')).toBeInTheDocument();
    expect(screen.getByTestId('model3d-viewport')).toBeInTheDocument();
  });

  it('renders existing hotspots', () => {
    const hotspots = [{ id: 'h-1', x: 0.5, y: 0.5, action: 'goto:slide-2' }];
    render(
      <Model3DEditor
        src="model.glb"
        hotspots={hotspots}
        keyframes={[]}
        onHotspotsChange={vi.fn()}
        onKeyframesChange={vi.fn()}
      />,
    );
    expect(screen.getByTestId('model3d-hotspot-h-1')).toBeInTheDocument();
  });

  it('clicking the viewport shows the action input', () => {
    render(
      <Model3DEditor
        src="model.glb"
        hotspots={[]}
        keyframes={[]}
        onHotspotsChange={vi.fn()}
        onKeyframesChange={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByTestId('model3d-viewport'));
    expect(screen.getByTestId('model3d-pending')).toBeInTheDocument();
  });

  it('adds a hotspot when Enter is pressed on the action input', () => {
    const onHotspotsChange = vi.fn();
    render(
      <Model3DEditor
        src="model.glb"
        hotspots={[]}
        keyframes={[]}
        onHotspotsChange={onHotspotsChange}
        onKeyframesChange={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByTestId('model3d-viewport'));
    const input = screen.getByTestId('model3d-action-input');
    fireEvent.change(input, { target: { value: 'goto:slide-3' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onHotspotsChange).toHaveBeenCalled();
    const next = onHotspotsChange.mock.calls[0]![0] as Array<{ action: string }>;
    expect(next[0]!.action).toBe('goto:slide-3');
  });

  it('adds a keyframe', () => {
    const onKeyframesChange = vi.fn();
    render(
      <Model3DEditor
        src="model.glb"
        hotspots={[]}
        keyframes={[]}
        onHotspotsChange={vi.fn()}
        onKeyframesChange={onKeyframesChange}
      />,
    );
    fireEvent.click(screen.getByTestId('model3d-keyframe-add'));
    expect(onKeyframesChange).toHaveBeenCalled();
  });
});
