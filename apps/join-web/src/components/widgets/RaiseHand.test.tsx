/**
 * RaiseHand widget test — toggle on, verify onSubmit.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { RaiseHand } from './RaiseHand';
import { buildProps, resetBus } from './test-utils';

describe('RaiseHand widget', () => {
  beforeEach(() => {
    resetBus();
  });

  it('toggles raised state and fires onSubmit({raised:true}) on first click', () => {
    const onSubmit = vi.fn();
    const props = buildProps('raise_hand', 'w1', {}, { onSubmit });
    render(<RaiseHand.Component {...props} />);
    fireEvent.click(screen.getByTestId('raise-hand-toggle'));
    expect(onSubmit).toHaveBeenCalledWith({ raised: true });
  });

  it('fires onSubmit({raised:false}) on second click', () => {
    const onSubmit = vi.fn();
    const props = buildProps('raise_hand', 'w1', {}, { onSubmit });
    render(<RaiseHand.Component {...props} />);
    const btn = screen.getByTestId('raise-hand-toggle');
    fireEvent.click(btn);
    fireEvent.click(btn);
    expect(onSubmit).toHaveBeenLastCalledWith({ raised: false });
  });
});