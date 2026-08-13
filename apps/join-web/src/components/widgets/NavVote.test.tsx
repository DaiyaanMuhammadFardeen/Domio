/**
 * NavVote widget test — click a target button.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { NavVote } from './NavVote';
import { buildProps, resetBus } from './test-utils';

describe('NavVote widget', () => {
  beforeEach(() => {
    resetBus();
  });

  it('fires onSubmit({target}) when Next is clicked', () => {
    const onSubmit = vi.fn();
    const props = buildProps('nav_vote', 'w1', { targets: ['prev', 'next'] }, { onSubmit });
    render(<NavVote.Component {...props} />);
    fireEvent.click(screen.getByTestId('nav-next'));
    expect(onSubmit).toHaveBeenCalledWith({ target: 'next' });
  });

  it('falls back to prev/next/skip when no targets are given', () => {
    const props = buildProps('nav_vote', 'w1', {});
    render(<NavVote.Component {...props} />);
    expect(screen.getByTestId('nav-prev')).toBeInTheDocument();
    expect(screen.getByTestId('nav-next')).toBeInTheDocument();
    expect(screen.getByTestId('nav-skip')).toBeInTheDocument();
  });
});