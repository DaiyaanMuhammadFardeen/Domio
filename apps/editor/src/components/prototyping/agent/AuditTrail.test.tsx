import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AuditTrail, type AuditEntryView } from './AuditTrail.js';

const entries: readonly AuditEntryView[] = [
  {
    id: 'a1',
    agentId: 'agent-1',
    toolName: 'create_hotspot',
    timestamp: '2026-08-01T00:00:00Z',
    source: 'agent',
    input: { deckId: 'd1' },
    output: { id: 'hs1' },
  },
  {
    id: 'a2',
    agentId: 'human:alice',
    toolName: 'update_variable',
    timestamp: '2026-08-01T00:00:01Z',
    source: 'human',
    input: { name: 'x', value: 1 },
    output: { ok: true },
  },
];

describe('AuditTrail', () => {
  it('renders the empty state when no entries', () => {
    render(<AuditTrail entries={[]} />);
    expect(screen.getByTestId('m8-audit-empty')).toBeInTheDocument();
  });

  it('renders one row per entry with tool name and source badge', () => {
    render(<AuditTrail entries={entries} />);
    const rows = screen.getAllByTestId('m8-audit-row');
    expect(rows.length).toBe(2);
    // entries are sorted newest-first, so first row is update_variable (a2)
    expect(screen.getAllByTestId('m8-audit-tool')[0]?.textContent).toBe('update_variable');
    expect(screen.getAllByTestId('m8-audit-tool')[1]?.textContent).toBe('create_hotspot');
    expect(screen.getAllByTestId('m8-audit-badge')[0]?.textContent).toBe('human');
    expect(screen.getAllByTestId('m8-audit-badge')[1]?.textContent).toBe('agent');
  });

  it('expands a row to reveal input / output', () => {
    render(<AuditTrail entries={entries} />);
    fireEvent.click(screen.getAllByTestId('m8-audit-toggle')[0] as HTMLElement);
    expect(screen.getByTestId('m8-audit-input')).toBeInTheDocument();
    expect(screen.getByTestId('m8-audit-output')).toBeInTheDocument();
  });

  it('invokes onDiff when the diff button is clicked', () => {
    const onDiff = vi.fn();
    render(<AuditTrail entries={entries} onDiff={onDiff} />);
    // entries are sorted newest-first, so toggle[1] is entries[0]
    fireEvent.click(screen.getAllByTestId('m8-audit-toggle')[1] as HTMLElement);
    fireEvent.click(screen.getByTestId('m8-audit-diff'));
    expect(onDiff).toHaveBeenCalledWith(entries[0]);
  });

  it('sorts entries newest-first', () => {
    render(<AuditTrail entries={entries} />);
    const tools = screen.getAllByTestId('m8-audit-tool');
    expect(tools[0]?.textContent).toBe('update_variable');
    expect(tools[1]?.textContent).toBe('create_hotspot');
  });
});