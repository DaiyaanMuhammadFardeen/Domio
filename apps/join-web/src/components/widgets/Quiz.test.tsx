/**
 * Quiz widget test — pick an option, verify onSubmit called.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Quiz } from './Quiz';
import { buildProps, resetBus } from './test-utils';

describe('Quiz widget', () => {
  beforeEach(() => {
    resetBus();
  });

  it('renders options and fires onSubmit({choice,index}) on click', () => {
    const onSubmit = vi.fn();
    const props = buildProps('quiz', 'w1', { options: ['A', 'B'], correct: 0 }, { onSubmit });
    render(<Quiz.Component {...props} />);
    fireEvent.click(screen.getByTestId('quiz-choice-B'));
    expect(onSubmit).toHaveBeenCalledWith({ choice: 'B', index: 1 });
  });

  it('falls back to A/B/C/D when no options are provided', () => {
    const props = buildProps('quiz', 'w1', {});
    render(<Quiz.Component {...props} />);
    expect(screen.getByTestId('quiz-choice-A')).toBeInTheDocument();
    expect(screen.getByTestId('quiz-choice-D')).toBeInTheDocument();
  });
});
