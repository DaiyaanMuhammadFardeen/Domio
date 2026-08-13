/**
 * MapPicker — Wave 2 §S2.10 unit tests.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MapPicker } from './MapPicker';

const value = { lat: 51.5074, lng: -0.1278, label: 'London' };

describe('MapPicker', () => {
  it('renders the marker info', () => {
    render(<MapPicker value={value} onChange={vi.fn()} />);
    expect(screen.getByTestId('map-picker')).toBeInTheDocument();
    expect(screen.getByText(/London/)).toBeInTheDocument();
  });

  it('emits onChange when lat changes', () => {
    const onChange = vi.fn();
    render(<MapPicker value={value} onChange={onChange} />);
    fireEvent.change(screen.getByTestId('map-picker-lat'), { target: { value: '48.8566' } });
    expect(onChange).toHaveBeenCalled();
    const next = onChange.mock.calls[0]![0] as { lat: number };
    expect(next.lat).toBe(48.8566);
  });

  it('shows the choropleth panel when metric columns are provided', () => {
    render(<MapPicker value={value} onChange={vi.fn()} metricColumns={['sales', 'count']} />);
    expect(screen.getByTestId('map-picker-choropleth')).toBeInTheDocument();
    expect(screen.getByTestId('map-picker-metric')).toBeInTheDocument();
  });
});
