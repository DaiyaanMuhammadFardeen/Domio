/**
 * Poll widget test — renders options, fires onSubmit on click.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Poll } from './Poll';
import { buildProps, resetBus } from './test-utils';

describe('Poll widget', () => {
  beforeEach(() => {
    resetBus();
  });

  it('renders options from payload and fires onSubmit({option})', () => {
    const onSubmit = vi.fn();
    const props = buildProps('poll', 'w1', { options: ['A', 'B'] }, { onSubmit });
    render(<Poll.Component {...props} />);
    expect(screen.getByTestId('poll-option-A')).toBeInTheDocument();
    expect(screen.getByTestId('poll-option-B')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('poll-option-A'));
    expect(onSubmit).toHaveBeenCalledWith({ option: 'A' });
  });

  it('renders a Yes/No fallback when no options are provided', () => {
    const props = buildProps('poll', 'w1', {});
    render(<Poll.Component {...props} />);
    expect(screen.getByTestId('poll-option-Yes')).toBeInTheDocument();
    expect(screen.getByTestId('poll-option-No')).toBeInTheDocument();
  });
});