/**
 * SequenceInspectorPanel tests (Phase 10 M6.2).
 */

import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SequenceInspectorPanel, type PresentationSequenceRecord } from './sequence-inspector-panel';

const TENANT = 't1';
const DECK = 'd1';

function makeSequence(): PresentationSequenceRecord {
  return {
    id: 'seq1',
    tenantId: TENANT,
    deckId: DECK,
    name: 'Onboarding',
    slides: ['s1', 's2', 's3'],
    intervalMs: 1000,
    pauseOnEvent: false,
    loop: false,
    count: 1,
    interruptionPolicy: 'queue',
    reducedMotionDefaultOff: true,
    pauseWarnAtMs: 1_800_000,
    version: 0,
  };
}

describe('SequenceInspectorPanel', () => {
  it('renders the panel with all controls', () => {
    render(<SequenceInspectorPanel sequence={makeSequence()} onPatch={vi.fn()} />);
    expect(screen.getByTestId('m6-sequence-panel')).toBeTruthy();
    expect(screen.getByTestId('m6-sequence-name')).toBeTruthy();
    expect(screen.getByTestId('m6-sequence-interval')).toBeTruthy();
    expect(screen.getByTestId('m6-sequence-policy')).toBeTruthy();
    expect(screen.getByTestId('m6-sequence-loop')).toBeTruthy();
    expect(screen.getByTestId('m6-sequence-count')).toBeTruthy();
    expect(screen.getByTestId('m6-sequence-reduced-motion')).toBeTruthy();
    expect(screen.getByTestId('m6-sequence-pause-warn')).toBeTruthy();
  });

  it('renders each slide row', () => {
    render(<SequenceInspectorPanel sequence={makeSequence()} onPatch={vi.fn()} />);
    expect(screen.getByTestId('m6-sequence-slide-0')).toBeTruthy();
    expect(screen.getByTestId('m6-sequence-slide-1')).toBeTruthy();
    expect(screen.getByTestId('m6-sequence-slide-2')).toBeTruthy();
  });

  it('renames the sequence', () => {
    const onPatch = vi.fn();
    render(<SequenceInspectorPanel sequence={makeSequence()} onPatch={onPatch} />);
    fireEvent.change(screen.getByTestId('m6-sequence-name'), { target: { value: 'New' } });
    expect(onPatch).toHaveBeenCalledWith({ version: 0, name: 'New' });
  });

  it('changes interruption policy', () => {
    const onPatch = vi.fn();
    render(<SequenceInspectorPanel sequence={makeSequence()} onPatch={onPatch} />);
    fireEvent.change(screen.getByTestId('m6-sequence-policy'), { target: { value: 'abort' } });
    expect(onPatch).toHaveBeenCalledWith({ version: 0, interruptionPolicy: 'abort' });
  });

  it('moves a slide down', () => {
    const onPatch = vi.fn();
    render(<SequenceInspectorPanel sequence={makeSequence()} onPatch={onPatch} />);
    fireEvent.click(screen.getByTestId('m6-sequence-down-0'));
    const arg = onPatch.mock.calls[0]?.[0] as { slides: string[] };
    expect(arg.slides).toEqual(['s2', 's1', 's3']);
  });

  it('disables move-up on the first slide', () => {
    render(<SequenceInspectorPanel sequence={makeSequence()} onPatch={vi.fn()} />);
    expect((screen.getByTestId('m6-sequence-up-0') as HTMLButtonElement).disabled).toBe(true);
  });

  it('disables move-down on the last slide', () => {
    render(<SequenceInspectorPanel sequence={makeSequence()} onPatch={vi.fn()} />);
    expect((screen.getByTestId('m6-sequence-down-2') as HTMLButtonElement).disabled).toBe(true);
  });

  it('toggles loop and emits patch', () => {
    const onPatch = vi.fn();
    render(<SequenceInspectorPanel sequence={makeSequence()} onPatch={onPatch} />);
    fireEvent.click(screen.getByTestId('m6-sequence-loop'));
    expect(onPatch).toHaveBeenCalledWith({ version: 0, loop: true });
  });

  it('toggles reduced-motion default off', () => {
    const onPatch = vi.fn();
    render(<SequenceInspectorPanel sequence={makeSequence()} onPatch={onPatch} />);
    fireEvent.click(screen.getByTestId('m6-sequence-reduced-motion'));
    expect(onPatch).toHaveBeenCalledWith({ version: 0, reducedMotionDefaultOff: false });
  });

  it('triggers delete when wired', () => {
    const onDelete = vi.fn();
    render(<SequenceInspectorPanel sequence={makeSequence()} onPatch={vi.fn()} onDelete={onDelete} />);
    fireEvent.click(screen.getByTestId('m6-sequence-delete'));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });
});
