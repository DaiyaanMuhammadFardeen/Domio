import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import {
  TestSessionsPanel,
  type TestSessionRow,
  type ReplaySnapshotView,
} from './test-sessions-panel';

const SAMPLE_EVENTS = [
  { id: 'e1', seq: 1, eventType: 'session_start' as const, createdAt: 1_700_000_000_000, region: 'us-east', consent: 'opt_in' as const },
  { id: 'e2', seq: 2, eventType: 'slide_enter' as const, createdAt: 1_700_000_001_000, region: 'us-east', consent: 'opt_in' as const },
  { id: 'e3', seq: 3, eventType: 'click' as const, createdAt: 1_700_000_002_000, region: 'us-east', consent: 'opt_in' as const },
];

const SAMPLE_SESSIONS: TestSessionRow[] = [
  {
    id: 's1',
    subjectId: 'subj-1',
    consent: 'opt_in',
    region: 'us-east',
    startedAt: 1_700_000_000_000,
    eventCount: 3,
    events: SAMPLE_EVENTS,
  },
  {
    id: 's2',
    subjectId: 'subj-2',
    consent: 'anonymous',
    region: 'eu-central',
    startedAt: 1_700_000_100_000,
    eventCount: 0,
    events: [],
  },
];

const SNAP: ReplaySnapshotView = { atEvent: 1, atMs: 1_700_000_000_000, variables: { TOTAL: 42 } };

function defaultProps(overrides: Partial<React.ComponentProps<typeof TestSessionsPanel>> = {}): React.ComponentProps<typeof TestSessionsPanel> {
  return {
    sessions: SAMPLE_SESSIONS,
    selectedSessionId: 's1',
    onSelectSession: vi.fn(),
    onLoadSnapshot: vi.fn(() => SNAP),
    onDeleteSession: vi.fn(),
    onExportSession: vi.fn(),
    onDeleteAllSessionsForSubject: vi.fn(),
    ...overrides,
  } as React.ComponentProps<typeof TestSessionsPanel>;
}

describe('TestSessionsPanel', () => {
  it('renders the panel header', () => {
    render(<TestSessionsPanel {...defaultProps()} />);
    expect(screen.getByRole('heading', { name: 'User-testing sessions' })).toBeInTheDocument();
  });

  it('shows the empty state when there are no sessions', () => {
    render(<TestSessionsPanel {...defaultProps({ sessions: [] })} />);
    expect(screen.getByText('No sessions yet.')).toBeInTheDocument();
  });

  it('renders one row per session', () => {
    render(<TestSessionsPanel {...defaultProps()} />);
    expect(screen.getAllByTestId('m5-sessions-row')).toHaveLength(2);
  });

  it('selects a session on click', () => {
    const onSelectSession = vi.fn();
    render(<TestSessionsPanel {...defaultProps({ onSelectSession })} />);
    const row = screen.getAllByTestId('m5-sessions-row')[1]!;
    fireEvent.click(within(row).getByTestId('m5-sessions-select'));
    expect(onSelectSession).toHaveBeenCalledWith('s1');
  });

  it('renders events for the selected session and shows the variable snapshot after scrubbing', () => {
    render(<TestSessionsPanel {...defaultProps()} />);
    expect(screen.getAllByTestId('m5-sessions-event-row')).toHaveLength(3);
    fireEvent.change(screen.getByTestId('m5-sessions-scrub'), { target: { value: '2' } });
    expect(screen.getByTestId('m5-sessions-snapshot').textContent).toContain('"TOTAL"');
  });

  it('invokes the delete handler when delete is clicked', () => {
    const onDeleteSession = vi.fn();
    render(<TestSessionsPanel {...defaultProps({ onDeleteSession })} />);
    const row = screen.getAllByTestId('m5-sessions-row')[1]!;
    fireEvent.click(within(row).getByTestId('m5-sessions-delete'));
    expect(onDeleteSession).toHaveBeenCalledWith('s1');
  });

  it('invokes the export handler when export is clicked', () => {
    const onExportSession = vi.fn();
    render(<TestSessionsPanel {...defaultProps({ onExportSession })} />);
    const row = screen.getAllByTestId('m5-sessions-row')[1]!;
    fireEvent.click(within(row).getByTestId('m5-sessions-export'));
    expect(onExportSession).toHaveBeenCalledWith('s1');
  });

  it('invokes the subject-delete handler with the subject id', () => {
    const onDeleteAll = vi.fn();
    render(<TestSessionsPanel {...defaultProps({ onDeleteAllSessionsForSubject: onDeleteAll })} />);
    const row = screen.getAllByTestId('m5-sessions-row')[1]!;
    fireEvent.click(within(row).getByTestId('m5-sessions-delete-subject'));
    expect(onDeleteAll).toHaveBeenCalledWith('subj-1');
  });

  it('loads a snapshot when the scrub slider changes', () => {
    const onLoadSnapshot = vi.fn(() => SNAP);
    render(<TestSessionsPanel {...defaultProps({ onLoadSnapshot })} />);
    fireEvent.change(screen.getByTestId('m5-sessions-scrub'), { target: { value: '2' } });
    expect(onLoadSnapshot).toHaveBeenCalledWith('s1', 2);
  });
});