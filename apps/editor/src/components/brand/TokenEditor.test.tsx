/**
 * TokenEditor — Wave 2 §S2.5 unit tests.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TokenEditor } from './TokenEditor';
import type { BrandKitDetail } from '../../lib/brand-service';

const KIT: BrandKitDetail = {
  id: 'brand-acme',
  name: 'Acme',
  primaryHex: '#33180c',
  accentHex: '#aa3a14',
  colors: [
    {
      id: 'color.brand.primary',
      label: 'Primary',
      stops: [
        { id: '100', label: '100', value: '#f5e8de' },
        { id: '500', label: '500', value: '#33180c' },
      ],
    },
  ],
  typography: [
    { id: 'type.heading', label: 'Heading', fontFamily: 'Inter', fontSizePx: 32, lineHeight: 1.2, fontWeight: 700, letterSpacingEm: -0.01 },
  ],
  spacing: [
    { id: 'space', label: 'Spacing', stops: [
      { id: '1', label: '1×', value: '4px' },
      { id: '4', label: '4×', value: '16px' },
    ] },
  ],
  radius: [
    { id: 'radius', label: 'Radius', stops: [
      { id: 'md', label: 'MD', value: '8px' },
    ] },
  ],
  shadows: [
    { id: 'shadow', label: 'Shadow', stops: [
      { id: 'md', label: 'MD', value: '0 4px 8px rgba(0,0,0,0.15)' },
    ] },
  ],
};

describe('TokenEditor', () => {
  it('renders all five sections', () => {
    render(<TokenEditor kit={KIT} onChange={vi.fn()} />);
    expect(screen.getByTestId('token-editor-section-colors')).toBeInTheDocument();
    expect(screen.getByTestId('token-editor-section-typography')).toBeInTheDocument();
    expect(screen.getByTestId('token-editor-section-spacing')).toBeInTheDocument();
    expect(screen.getByTestId('token-editor-section-radius')).toBeInTheDocument();
    expect(screen.getByTestId('token-editor-section-shadow')).toBeInTheDocument();
  });

  it('renders the live preview tile', () => {
    render(<TokenEditor kit={KIT} onChange={vi.fn()} />);
    expect(screen.getByTestId('token-editor-preview')).toBeInTheDocument();
  });

  it('forwards a color stop change', () => {
    const onChange = vi.fn();
    render(<TokenEditor kit={KIT} onChange={onChange} />);
    const swatch = screen.getByTestId('token-editor-color-color.brand.primary-500');
    fireEvent.change(swatch, { target: { value: '#00ff00' } });
    expect(onChange).toHaveBeenCalled();
    const next = onChange.mock.calls[0]?.[0] as BrandKitDetail;
    expect(next.colors[0]?.stops[1]?.value).toBe('#00ff00');
  });

  it('forwards a typography field change', () => {
    const onChange = vi.fn();
    render(<TokenEditor kit={KIT} onChange={onChange} />);
    const label = screen.getByTestId('token-editor-type-label-type.heading');
    fireEvent.change(label, { target: { value: 'Title' } });
    expect(onChange).toHaveBeenCalled();
    const next = onChange.mock.calls[0]?.[0] as BrandKitDetail;
    expect(next.typography[0]?.label).toBe('Title');
  });

  it('forwards a spacing step change', () => {
    const onChange = vi.fn();
    render(<TokenEditor kit={KIT} onChange={onChange} />);
    fireEvent.change(screen.getByTestId('token-editor-space-4'), { target: { value: '20px' } });
    expect(onChange).toHaveBeenCalled();
    const next = onChange.mock.calls[0]?.[0] as BrandKitDetail;
    expect(next.spacing[0]?.stops[1]?.value).toBe('20px');
  });

  it('forwards a radius change', () => {
    const onChange = vi.fn();
    render(<TokenEditor kit={KIT} onChange={onChange} />);
    fireEvent.change(screen.getByTestId('token-editor-radius-md'), { target: { value: '12px' } });
    expect(onChange).toHaveBeenCalled();
    const next = onChange.mock.calls[0]?.[0] as BrandKitDetail;
    expect(next.radius[0]?.stops[0]?.value).toBe('12px');
  });

  it('forwards a shadow change', () => {
    const onChange = vi.fn();
    render(<TokenEditor kit={KIT} onChange={onChange} />);
    fireEvent.change(screen.getByTestId('token-editor-shadow-md'), { target: { value: '0 8px 16px rgba(0,0,0,0.2)' } });
    expect(onChange).toHaveBeenCalled();
    const next = onChange.mock.calls[0]?.[0] as BrandKitDetail;
    expect(next.shadows[0]?.stops[0]?.value).toBe('0 8px 16px rgba(0,0,0,0.2)');
  });

  it('adds a new stop to an existing color scale', () => {
    const onChange = vi.fn();
    render(<TokenEditor kit={KIT} onChange={onChange} />);
    fireEvent.click(screen.getByTestId('token-editor-color-add-color.brand.primary'));
    expect(onChange).toHaveBeenCalled();
    const next = onChange.mock.calls[0]?.[0] as BrandKitDetail;
    expect(next.colors[0]?.stops.length).toBe(3);
  });

  it('disables inputs in read-only mode', () => {
    render(<TokenEditor kit={KIT} onChange={vi.fn()} readOnly />);
    const swatch = screen.getByTestId('token-editor-color-color.brand.primary-500');
    expect(swatch).toBeDisabled();
  });
});
