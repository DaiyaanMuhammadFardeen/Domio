/**
 * EmojiReaction widget test — click 👍, verify onSubmit called.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { EmojiReaction } from './EmojiReaction';
import { buildProps, resetBus } from './test-utils';

describe('EmojiReaction widget', () => {
  beforeEach(() => {
    resetBus();
  });

  it('renders all 6 emoji buttons', () => {
    const props = buildProps('reaction', 'w1', {});
    render(<EmojiReaction.Component {...props} />);
    for (const e of ['👍', '❤️', '😂', '😮', '👏', '🎉']) {
      expect(screen.getByTestId(`reaction-${e}`)).toBeInTheDocument();
    }
  });

  it('fires onSubmit({emoji}) on tap', () => {
    const onSubmit = vi.fn();
    const props = buildProps('reaction', 'w1', {}, { onSubmit });
    render(<EmojiReaction.Component {...props} />);
    fireEvent.click(screen.getByTestId('reaction-👍'));
    expect(onSubmit).toHaveBeenCalledWith({ emoji: '👍' });
  });
});