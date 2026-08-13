/**
 * CaptionsToggle tests — S5.5.
 */

import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CaptionsToggle } from './CaptionsToggle';

describe('CaptionsToggle', () => {
  it('renders all three options', () => {
    render(<CaptionsToggle value="both" onChange={() => {}} />);
    expect(screen.getByTestId('captions-toggle-captions')).toBeInTheDocument();
    expect(screen.getByTestId('captions-toggle-audio')).toBeInTheDocument();
    expect(screen.getByTestId('captions-toggle-both')).toBeInTheDocument();
  });

  it('marks the active option with aria-checked=true', () => {
    render(<CaptionsToggle value="audio" onChange={() => {}} />);
    expect(screen.getByTestId('captions-toggle-audio').getAttribute('aria-checked')).toBe('true');
    expect(screen.getByTestId('captions-toggle-captions').getAttribute('aria-checked')).toBe(
      'false',
    );
    expect(screen.getByTestId('captions-toggle-both').getAttribute('aria-checked')).toBe('false');
  });

  it('calls onChange with "audio" when the audio button is clicked', () => {
    const onChange = vi.fn();
    render(<CaptionsToggle value="captions" onChange={onChange} />);
    screen.getByTestId('captions-toggle-audio').click();
    expect(onChange).toHaveBeenCalledWith('audio');
  });

  it('calls onChange with "captions" when the captions button is clicked', () => {
    const onChange = vi.fn();
    render(<CaptionsToggle value="both" onChange={onChange} />);
    screen.getByTestId('captions-toggle-captions').click();
    expect(onChange).toHaveBeenCalledWith('captions');
  });

  it('calls onChange with "both" when the both button is clicked', () => {
    const onChange = vi.fn();
    render(<CaptionsToggle value="audio" onChange={onChange} />);
    screen.getByTestId('captions-toggle-both').click();
    expect(onChange).toHaveBeenCalledWith('both');
  });
});
