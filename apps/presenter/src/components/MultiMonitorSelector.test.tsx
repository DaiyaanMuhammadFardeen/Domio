/**
 * MultiMonitorSelector tests — S4.1.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MultiMonitorSelector } from './MultiMonitorSelector';

describe('MultiMonitorSelector', () => {
  it('renders an empty list when no display is detected', () => {
    render(<MultiMonitorSelector sessionId="s1" onSelect={vi.fn()} />);
    expect(screen.getByTestId('multi-monitor-selector-list')).toBeInTheDocument();
    expect(screen.queryByTestId('multi-monitor-selector-secondary')).toBeNull();
  });

  it('shows a pop-out fallback button when no displays are detected', () => {
    render(<MultiMonitorSelector sessionId="s1" onSelect={vi.fn()} />);
    expect(screen.getByTestId('multi-monitor-selector-popup')).toBeInTheDocument();
  });

  it('renders the title copy', () => {
    render(<MultiMonitorSelector sessionId="s1" onSelect={vi.fn()} />);
    // The header <strong> contains the literal title; the description
    // paragraph below contains the same words, so query the strong by
    // its tag name to avoid the multi-match failure.
    const header = document.querySelector('strong');
    expect(header?.textContent).toMatch(/Audience display/i);
  });
});
