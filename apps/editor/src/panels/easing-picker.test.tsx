import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { EasingPicker, validateBezier } from './easing-picker';

describe('EasingPicker', () => {
  it('renders with a preset value', () => {
    render(<EasingPicker value="ease-in" onChange={vi.fn()} />);
    expect(screen.getByTestId('p09-easing-select')).toHaveValue('ease-in');
  });

  it('shows Custom option selected when value is cubic-bezier', () => {
    render(<EasingPicker value="cubic-bezier(0.25, 0.1, 0.25, 1)" onChange={vi.fn()} />);
    expect(screen.getByTestId('p09-easing-select')).toHaveValue('__custom');
    expect(screen.getByTestId('p09-easing-custom')).toHaveValue('cubic-bezier(0.25, 0.1, 0.25, 1)');
  });

  it('calls onChange when selecting a preset', () => {
    const onChange = vi.fn();
    render(<EasingPicker value="linear" onChange={onChange} />);
    fireEvent.change(screen.getByTestId('p09-easing-select'), { target: { value: 'bounce' } });
    expect(onChange).toHaveBeenCalledWith('bounce');
  });

  it('shows custom input when selecting Custom', () => {
    const onChange = vi.fn();
    render(<EasingPicker value="linear" onChange={onChange} />);
    fireEvent.change(screen.getByTestId('p09-easing-select'), { target: { value: '__custom' } });
    expect(screen.getByTestId('p09-easing-custom')).toBeInTheDocument();
  });

  it('validates cubic-bezier on blur', () => {
    const onChange = vi.fn();
    render(<EasingPicker value="linear" onChange={onChange} />);
    fireEvent.change(screen.getByTestId('p09-easing-select'), { target: { value: '__custom' } });
    fireEvent.change(screen.getByTestId('p09-easing-custom'), {
      target: { value: 'cubic-bezier(0.25, 0.1, 0.25, 1)' },
    });
    fireEvent.blur(screen.getByTestId('p09-easing-custom'));
    expect(onChange).toHaveBeenCalledWith('cubic-bezier(0.25, 0.1, 0.25, 1)');
  });

  it('shows error for invalid bezier on blur', () => {
    const onChange = vi.fn();
    render(<EasingPicker value="linear" onChange={onChange} />);
    fireEvent.change(screen.getByTestId('p09-easing-select'), { target: { value: '__custom' } });
    fireEvent.change(screen.getByTestId('p09-easing-custom'), { target: { value: 'invalid' } });
    fireEvent.blur(screen.getByTestId('p09-easing-custom'));
    expect(screen.getByText('Invalid cubic-bezier curve')).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('validateBezier', () => {
  it('accepts valid cubic-bezier', () => {
    expect(validateBezier('cubic-bezier(0.25, 0.1, 0.25, 1)')).toBe(true);
    expect(validateBezier('cubic-bezier(0, 0, 1, 1)')).toBe(true);
  });

  it('rejects invalid strings', () => {
    expect(validateBezier('invalid')).toBe(false);
    expect(validateBezier('cubic-bezier(0.25, 0.1)')).toBe(false);
    expect(validateBezier('ease-in')).toBe(false);
  });
});
