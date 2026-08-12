/**
 * AgendaTimer tests — S4.11.
 */

import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { AgendaTimer, computeAlertLevel, formatMmSs } from './AgendaTimer';
import type { AgendaTimer as AgendaTimerData } from '../../runtime/types';

const TIMERS: AgendaTimerData[] = [
  {
    id: 'intro',
    label: 'Intro',
    starts_at_ms: 0,
    duration_ms: 5 * 60 * 1000,
    remaining_ms: 5 * 60 * 1000,
    status: 'running',
    visible_to: 'both',
  },
  {
    id: 'demo',
    label: 'Demo',
    starts_at_ms: 0,
    duration_ms: 15 * 60 * 1000,
    remaining_ms: 2 * 60 * 1000,
    status: 'paused',
    visible_to: 'presenter',
  },
  {
    id: 'qna',
    label: 'Q&A',
    starts_at_ms: 0,
    duration_ms: 5 * 60 * 1000,
    remaining_ms: 5 * 60 * 1000,
    status: 'idle',
    visible_to: 'audience',
  },
];

describe('AgendaTimer helpers', () => {
  it('computeAlertLevel returns safe when <80% consumed', () => {
    expect(computeAlertLevel(60_000, 100_000)).toBe('safe');
    expect(computeAlertLevel(25_000, 100_000)).toBe('safe');
  });

  it('computeAlertLevel returns soft between 80% and 100%', () => {
    expect(computeAlertLevel(15_000, 100_000)).toBe('soft');
  });

  it('computeAlertLevel returns hard when fully consumed or over', () => {
    expect(computeAlertLevel(0, 100_000)).toBe('hard');
    expect(computeAlertLevel(-1_000, 100_000)).toBe('hard');
  });

  it('computeAlertLevel returns safe for zero-duration', () => {
    expect(computeAlertLevel(0, 0)).toBe('safe');
    expect(computeAlertLevel(10_000, 0)).toBe('safe');
  });

  it('formatMmSs pads seconds', () => {
    expect(formatMmSs(0)).toBe('0:00');
    expect(formatMmSs(59_000)).toBe('0:59');
    expect(formatMmSs(60_000)).toBe('1:00');
    expect(formatMmSs(125_000)).toBe('2:05');
    expect(formatMmSs(-1000)).toBe('0:00');
  });
});

describe('AgendaTimer', () => {
  it('renders one row per agenda timer', () => {
    render(<AgendaTimer agendaTimers={TIMERS} />);
    expect(screen.getByTestId('agenda-timer-intro')).toBeInTheDocument();
    expect(screen.getByTestId('agenda-timer-demo')).toBeInTheDocument();
    expect(screen.getByTestId('agenda-timer-qna')).toBeInTheDocument();
  });

  it('shows the running timer as primary when primaryId is undefined', () => {
    render(<AgendaTimer agendaTimers={TIMERS} />);
    expect(screen.getByTestId('agenda-timer-intro')).toHaveAttribute('data-primary', 'true');
    expect(screen.getByTestId('agenda-timer-demo')).toHaveAttribute('data-primary', 'false');
  });

  it('marks the explicitly picked id as primary', () => {
    render(<AgendaTimer agendaTimers={TIMERS} primaryId="demo" />);
    expect(screen.getByTestId('agenda-timer-demo')).toHaveAttribute('data-primary', 'true');
    expect(screen.getByTestId('agenda-timer-intro')).toHaveAttribute('data-primary', 'false');
  });

  it('derives correct alert levels per timer', () => {
    render(<AgendaTimer agendaTimers={TIMERS} />);
    expect(screen.getByTestId('agenda-timer-intro')).toHaveAttribute('data-alert', 'safe');
    expect(screen.getByTestId('agenda-timer-demo')).toHaveAttribute('data-alert', 'soft'); // 13min/15min = 87% consumed
  });

  it('derives soft alert at exactly 80%', () => {
    const arr: AgendaTimerData[] = [
      {
        id: 'soft',
        label: 'Soft',
        starts_at_ms: 0,
        duration_ms: 100_000,
        remaining_ms: 20_000,
        status: 'running',
        visible_to: 'both',
      },
    ];
    render(<AgendaTimer agendaTimers={arr} />);
    expect(screen.getByTestId('agenda-timer-soft')).toHaveAttribute('data-alert', 'soft');
  });

  it('fires onPrimaryChange when a label is clicked', () => {
    const onPrimaryChange = vi.fn();
    render(<AgendaTimer agendaTimers={TIMERS} onPrimaryChange={onPrimaryChange} />);
    fireEvent.click(screen.getByTestId('agenda-timer-demo-pick'));
    expect(onPrimaryChange).toHaveBeenCalledWith('demo');
  });

  it('cycles visibility on visibility button click', () => {
    const onVisibilityToggle = vi.fn();
    render(<AgendaTimer agendaTimers={TIMERS} onVisibilityToggle={onVisibilityToggle} />);
    // demo starts as 'presenter' → next 'audience'
    fireEvent.click(screen.getByTestId('agenda-timer-demo-visibility'));
    expect(onVisibilityToggle).toHaveBeenCalledWith('demo', 'audience');
  });

  it('formats remaining_ms as mm:ss', () => {
    render(<AgendaTimer agendaTimers={TIMERS} />);
    expect(screen.getByTestId('agenda-timer-intro-time')).toHaveTextContent('5:00');
    expect(screen.getByTestId('agenda-timer-demo-time')).toHaveTextContent('2:00');
  });
});
