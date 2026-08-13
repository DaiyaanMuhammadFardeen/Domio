/**
 * PacingConfig tests — S4.5.
 */

import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { PacingConfig } from './PacingConfig';
import type { SlideSnapshot } from '../../runtime/types';

const SLIDES: SlideSnapshot[] = [
  { slide_id: 's1', slide_index: 0, title: 'Intro' },
  { slide_id: 's2', slide_index: 1, title: 'Body' },
];

describe('PacingConfig', () => {
  it('renders each slide row with the default target time', () => {
    render(<PacingConfig slides={SLIDES} />);
    expect(screen.getByTestId('pacing-config-row-s1')).toBeInTheDocument();
    const input = screen.getByTestId('pacing-config-input-s1') as HTMLInputElement;
    expect(input.value).toBe('60'); // default 60s
  });

  it('uses initialTargets when provided', () => {
    render(
      <PacingConfig slides={SLIDES} initialTargets={[{ slide_id: 's1', target_ms: 30_000 }]} />,
    );
    expect((screen.getByTestId('pacing-config-input-s1') as HTMLInputElement).value).toBe('30');
    expect((screen.getByTestId('pacing-config-input-s2') as HTMLInputElement).value).toBe('60');
  });

  it('emits onChange with the updated targets', () => {
    const onChange = vi.fn();
    render(<PacingConfig slides={SLIDES} onChange={onChange} />);
    fireEvent.change(screen.getByTestId('pacing-config-input-s1'), {
      target: { value: '45' },
    });
    expect(onChange).toHaveBeenLastCalledWith([
      { slide_id: 's1', target_ms: 45_000 },
      { slide_id: 's2', target_ms: 60_000 },
    ]);
  });

  it('renders the formatted preview', () => {
    render(
      <PacingConfig slides={SLIDES} initialTargets={[{ slide_id: 's1', target_ms: 75_000 }]} />,
    );
    expect(screen.getByTestId('pacing-config-preview-s1').textContent).toBe('1:15');
  });

  it('disables inputs when disabled', () => {
    render(<PacingConfig slides={SLIDES} disabled />);
    expect((screen.getByTestId('pacing-config-input-s1') as HTMLInputElement).disabled).toBe(true);
  });
});
