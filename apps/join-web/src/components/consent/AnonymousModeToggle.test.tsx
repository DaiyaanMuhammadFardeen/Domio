/**
 * AnonymousModeToggle tests — S5.10.
 */

import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { AnonymousModeToggle } from './AnonymousModeToggle';
import { HANDLES } from '@/runtime/anonymous';

describe('AnonymousModeToggle', () => {
  it('renders the off state and shows no handle', () => {
    render(<AnonymousModeToggle enabled={false} onChange={() => {}} handle={null} />);
    const toggle = screen.getByTestId('anonymous-mode-toggle');
    expect(toggle).toHaveAttribute('data-enabled', 'false');
    expect(screen.getByTestId('anonymous-mode-switch')).toHaveTextContent(/Go anonymous/);
    expect(toggle).toHaveTextContent(/Show your display name/);
  });

  it('renders the on state with the supplied handle', () => {
    render(<AnonymousModeToggle enabled={true} onChange={() => {}} handle="Cosmic Otter" />);
    const toggle = screen.getByTestId('anonymous-mode-toggle');
    expect(toggle).toHaveAttribute('data-enabled', 'true');
    expect(toggle).toHaveTextContent(/Cosmic Otter/);
  });

  it('fires onChange(true, <handle>) when toggled on from the off state', () => {
    const onChange = vi.fn();
    render(<AnonymousModeToggle enabled={false} onChange={onChange} handle={null} />);
    fireEvent.click(screen.getByTestId('anonymous-mode-switch'));
    expect(onChange).toHaveBeenCalledTimes(1);
    const [next, handle] = onChange.mock.calls[0] as [boolean, string | null];
    expect(next).toBe(true);
    expect(typeof handle).toBe('string');
    expect(HANDLES).toContain(handle);
  });

  it('fires onChange(false, null) when toggled off from the on state', () => {
    const onChange = vi.fn();
    render(<AnonymousModeToggle enabled={true} onChange={onChange} handle="Quiet Falcon" />);
    fireEvent.click(screen.getByTestId('anonymous-mode-switch'));
    expect(onChange).toHaveBeenCalledWith(false, null);
  });
});
