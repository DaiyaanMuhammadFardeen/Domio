/**
 * DeviceFramePicker — Wave 2 §S2.12 unit tests.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DeviceFramePicker } from './DeviceFramePicker';

describe('DeviceFramePicker', () => {
  it('renders the default frames in list mode', () => {
    render(<DeviceFramePicker onChange={vi.fn()} />);
    expect(screen.getByTestId('device-frame-iphone-15')).toBeInTheDocument();
    expect(screen.getByTestId('device-frame-ipad-11')).toBeInTheDocument();
    expect(screen.getByTestId('device-frame-desktop-1280')).toBeInTheDocument();
  });

  it('emits onChange when a frame is selected', () => {
    const onChange = vi.fn();
    render(<DeviceFramePicker onChange={onChange} />);
    fireEvent.click(screen.getByTestId('device-frame-iphone-15'));
    expect(onChange).toHaveBeenCalled();
    const spec = onChange.mock.calls[0]![0] as { id: string; width: number };
    expect(spec.id).toBe('iphone-15');
    expect(spec.width).toBe(393);
  });

  it('renders in grid mode', () => {
    render(<DeviceFramePicker display="grid" onChange={vi.fn()} />);
    expect(screen.getByTestId('device-frame-preview-iphone-15')).toBeInTheDocument();
  });
});
