/**
 * OutputMirrorControls tests — S4.10.
 */

import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { OutputMirrorControls, type DisplayTarget } from './OutputMirrorControls';

const DISPLAYS: readonly DisplayTarget[] = [
  { id: 'laptop', label: 'Laptop', width: 1920, height: 1080 },
  { id: 'projector', label: 'Projector', width: 3840, height: 2160 },
  { id: 'led', label: 'LED wall', width: 5120, height: 2880 },
];

describe('OutputMirrorControls', () => {
  it('renders all three mirror modes', () => {
    render(<OutputMirrorControls mode="extend" />);
    expect(screen.getByTestId('output-mirror-controls-extend')).toBeInTheDocument();
    expect(screen.getByTestId('output-mirror-controls-clone')).toBeInTheDocument();
    expect(screen.getByTestId('output-mirror-controls-audience_only')).toBeInTheDocument();
  });

  it('marks the current mode as checked', () => {
    render(<OutputMirrorControls mode="audience_only" />);
    expect(screen.getByTestId('output-mirror-controls-audience_only')).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByTestId('output-mirror-controls-extend')).toHaveAttribute('aria-checked', 'false');
  });

  it('calls onChange when switching mode', () => {
    const onChange = vi.fn();
    render(<OutputMirrorControls mode="extend" onChange={onChange} />);
    fireEvent.click(screen.getByTestId('output-mirror-controls-clone'));
    expect(onChange).toHaveBeenCalledWith('clone', undefined);
  });

  it('calls onChange with new target when selecting a display', () => {
    const onChange = vi.fn();
    render(
      <OutputMirrorControls
        mode="extend"
        availableDisplays={DISPLAYS}
        onChange={onChange}
      />,
    );
    const select = screen.getByTestId('output-mirror-controls-target') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'projector' } });
    expect(onChange).toHaveBeenCalledWith('extend', 'projector');
  });

  it('renders the auto-detect fallback when no displays are provided', () => {
    render(<OutputMirrorControls mode="clone" />);
    const select = screen.getByTestId('output-mirror-controls-target') as HTMLSelectElement;
    expect(select.options.length).toBe(2); // auto-detect + 1 fallback
    expect(select.options[1]?.text).toMatch(/Built-in laptop screen/);
  });

  it('renders one option per provided display', () => {
    render(
      <OutputMirrorControls
        mode="extend"
        availableDisplays={DISPLAYS}
      />,
    );
    const select = screen.getByTestId('output-mirror-controls-target') as HTMLSelectElement;
    expect(select.options.length).toBe(4); // auto-detect + 3 displays
  });
});
