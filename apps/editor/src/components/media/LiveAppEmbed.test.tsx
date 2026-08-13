/**
 * LiveAppEmbed — Wave 2 §S2.10 unit tests.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LiveAppEmbed } from './LiveAppEmbed';

describe('LiveAppEmbed', () => {
  it('renders URL, origins, permissions, and JWT fields', () => {
    render(<LiveAppEmbed initialUrl="https://example.com/app" onChange={vi.fn()} />);
    expect(screen.getByTestId('embed-url')).toBeInTheDocument();
    expect(screen.getByTestId('embed-origins')).toBeInTheDocument();
    expect(screen.getByTestId('embed-jwt')).toBeInTheDocument();
  });

  it('toggles a permission', () => {
    render(<LiveAppEmbed initialUrl="https://example.com" onChange={vi.fn()} />);
    const cb = screen.getByTestId('embed-permission-clipboard-write');
    expect(cb).not.toBeChecked();
    fireEvent.click(cb);
    expect(cb).toBeChecked();
  });

  it('regenerates the JWT', () => {
    render(<LiveAppEmbed initialUrl="https://example.com" onChange={vi.fn()} />);
    const before = (screen.getByTestId('embed-jwt') as HTMLInputElement).value;
    fireEvent.click(screen.getByTestId('embed-regen-jwt'));
    const after = (screen.getByTestId('embed-jwt') as HTMLInputElement).value;
    expect(after).not.toBe(before);
  });

  it('emits onChange when Apply is clicked', () => {
    const onChange = vi.fn();
    render(<LiveAppEmbed initialUrl="https://example.com" onChange={onChange} />);
    fireEvent.click(screen.getByTestId('embed-apply'));
    expect(onChange).toHaveBeenCalled();
  });
});
