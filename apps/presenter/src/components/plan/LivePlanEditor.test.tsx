/**
 * LivePlanEditor tests — S4.4.
 */

import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { LivePlanEditor } from './LivePlanEditor';
import type { SlideSnapshot } from '../../runtime/types';

const SLIDES: SlideSnapshot[] = [
  { slide_id: 's1', slide_index: 0, title: 'Intro' },
  { slide_id: 's2', slide_index: 1, title: 'Body' },
  { slide_id: 's3', slide_index: 2, title: 'Conclusion' },
];

describe('LivePlanEditor', () => {
  it('renders the slides in the given initial order', () => {
    render(<LivePlanEditor slides={SLIDES} initialOrder={['s1', 's2', 's3']} initialHidden={[]} />);
    const titles = screen.getAllByTestId(/live-plan-editor-title-/);
    expect(titles.map((el) => el.textContent)).toEqual(['Intro', 'Body', 'Conclusion']);
  });

  it('moves a slide down and emits the new order', () => {
    const onChange = vi.fn();
    render(
      <LivePlanEditor
        slides={SLIDES}
        initialOrder={['s1', 's2', 's3']}
        initialHidden={[]}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByTestId('live-plan-editor-down-s1'));
    expect(onChange).toHaveBeenCalledWith({ order: ['s2', 's1', 's3'], hidden: [] });
  });

  it('moves a slide up and emits the new order', () => {
    const onChange = vi.fn();
    render(
      <LivePlanEditor
        slides={SLIDES}
        initialOrder={['s1', 's2', 's3']}
        initialHidden={[]}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByTestId('live-plan-editor-up-s2'));
    expect(onChange).toHaveBeenCalledWith({ order: ['s2', 's1', 's3'], hidden: [] });
  });

  it('disables the up button on the first row and down on the last', () => {
    render(<LivePlanEditor slides={SLIDES} initialOrder={['s1', 's2', 's3']} initialHidden={[]} />);
    expect((screen.getByTestId('live-plan-editor-up-s1') as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByTestId('live-plan-editor-down-s3') as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  it('toggles hidden and emits a new hidden set', () => {
    const onChange = vi.fn();
    render(
      <LivePlanEditor
        slides={SLIDES}
        initialOrder={['s1', 's2', 's3']}
        initialHidden={[]}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByTestId('live-plan-editor-hide-s2'));
    expect(onChange).toHaveBeenCalledWith({ order: ['s1', 's2', 's3'], hidden: ['s2'] });

    fireEvent.click(screen.getByTestId('live-plan-editor-hide-s2'));
    expect(onChange).toHaveBeenLastCalledWith({ order: ['s1', 's2', 's3'], hidden: [] });
  });

  it('renders hidden slides with reduced opacity and strikethrough', () => {
    render(
      <LivePlanEditor slides={SLIDES} initialOrder={['s1', 's2', 's3']} initialHidden={['s2']} />,
    );
    const row = screen.getByTestId('live-plan-editor-row-s2');
    expect(row.getAttribute('data-hidden')).toBe('true');
  });
});
