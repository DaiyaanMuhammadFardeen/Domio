import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { StateInspectorPanel, type StateInspectorMachine } from './state-inspector-panel';

function makeMachine(overrides: Partial<StateInspectorMachine> = {}): StateInspectorMachine {
  return {
    id: 'm1',
    instanceId: 'inst-s1-1',
    stateMachine: {
      states: {
        idle: { label: 'Idle' },
        active: { label: 'Active' },
      },
      initial: 'idle',
      transitions: [
        { from: 'idle', to: 'active', event: 'click' },
        { from: 'active', to: 'idle', event: 'default' },
      ],
    },
    currentState: 'idle',
    scope: 'slide',
    persistInstanceState: false,
    ...overrides,
  };
}

function defaultProps(
  overrides: Partial<React.ComponentProps<typeof StateInspectorPanel>> = {},
): React.ComponentProps<typeof StateInspectorPanel> {
  return {
    machines: [],
    activeSlideId: 's1',
    onAddMachine: vi.fn(),
    onRemoveMachine: vi.fn(),
    onAdvance: vi.fn(),
    onTogglePersistInstanceState: vi.fn(),
    ...overrides,
  } as React.ComponentProps<typeof StateInspectorPanel>;
}

describe('StateInspectorPanel', () => {
  it('renders the panel header', () => {
    render(<StateInspectorPanel {...defaultProps()} />);
    expect(screen.getByRole('heading', { name: 'State inspector' })).toBeInTheDocument();
  });

  it('shows the empty state when no machines exist', () => {
    render(<StateInspectorPanel {...defaultProps()} />);
    expect(screen.getByText('No state machines on this slide.')).toBeInTheDocument();
  });

  it('adds a state machine with the entered values', () => {
    const onAddMachine = vi.fn();
    render(<StateInspectorPanel {...defaultProps()} onAddMachine={onAddMachine} />);
    fireEvent.change(screen.getByTestId('m3-instance-id'), { target: { value: 'inst-s1-2' } });
    fireEvent.change(screen.getByTestId('m3-initial-state'), { target: { value: 'focused' } });
    fireEvent.change(screen.getByTestId('m3-scope'), { target: { value: 'session' } });
    fireEvent.click(screen.getByTestId('m3-add-machine'));
    expect(onAddMachine).toHaveBeenCalledWith('inst-s1-2', 'focused', 'session');
  });

  it('renders a transition row for each transition sorted by precedence', () => {
    render(
      <StateInspectorPanel
        {...defaultProps({
          machines: [
            makeMachine({
              stateMachine: {
                states: { idle: {}, active: {}, focus: {} },
                initial: 'idle',
                transitions: [
                  { from: 'idle', to: 'active', event: 'click' },
                  { from: 'idle', to: 'focus', event: 'focus' },
                  { from: 'idle', to: 'active', event: 'hover' },
                ],
              },
            }),
          ],
        })}
      />,
    );
    const rows = screen.getAllByTestId('m3-transition-row').map((r) => r.textContent);
    expect(rows[0]).toContain('focus');
    expect(rows[1]).toContain('click');
    expect(rows[2]).toContain('hover');
  });

  it('selects a different machine on click', () => {
    const m1 = makeMachine({ id: 'm1', instanceId: 'inst-s1-1' });
    const m2 = makeMachine({
      id: 'm2',
      instanceId: 'inst-s1-2',
      stateMachine: {
        states: { a: {}, b: {} },
        initial: 'a',
        transitions: [{ from: 'a', to: 'b', event: 'click' }],
      },
    });
    render(<StateInspectorPanel {...defaultProps({ machines: [m1, m2] })} />);
    fireEvent.click(screen.getAllByTestId('m3-machine-select')[1]!);
    const graph = screen.getByTestId('m3-transition-graph');
    const row = within(graph).getAllByTestId('m3-transition-row')[0];
    expect(row).toHaveTextContent('a');
    expect(row).toHaveTextContent('click');
    expect(row).toHaveTextContent('b');
  });

  it('removes a machine on button click', () => {
    const onRemoveMachine = vi.fn();
    render(
      <StateInspectorPanel
        {...defaultProps({
          machines: [makeMachine({ id: 'm1', instanceId: 'inst-s1-1' })],
          onRemoveMachine,
        })}
      />,
    );
    fireEvent.click(screen.getByTestId('m3-machine-remove'));
    expect(onRemoveMachine).toHaveBeenCalledWith('m1');
  });

  it('shows the current state', () => {
    render(
      <StateInspectorPanel
        {...defaultProps({ machines: [makeMachine({ currentState: 'active' })] })}
      />,
    );
    expect(screen.getByTestId('m3-current-state')).toHaveTextContent('Current:');
    expect(screen.getByTestId('m3-current-state')).toHaveTextContent('active');
  });

  it('toggles the pause-and-inspect flag and surfaces a paused indicator', () => {
    render(
      <StateInspectorPanel
        {...defaultProps({ machines: [makeMachine({ currentState: 'active' })] })}
      />,
    );
    fireEvent.click(screen.getByTestId('m3-pause-toggle'));
    expect(screen.getByTestId('m3-paused-flag')).toBeInTheDocument();
    // The Apply event button is disabled while paused.
    expect(screen.getByTestId('m3-advance')).toBeDisabled();
  });

  it('disables the advance button when paused even if a machine is selected', () => {
    render(<StateInspectorPanel {...defaultProps({ machines: [makeMachine()] })} />);
    fireEvent.click(screen.getByTestId('m3-pause-toggle'));
    expect(screen.getByTestId('m3-advance')).toBeDisabled();
  });

  it('applies the selected event when not paused', () => {
    const onAdvance = vi.fn();
    render(<StateInspectorPanel {...defaultProps({ machines: [makeMachine()], onAdvance })} />);
    fireEvent.change(screen.getByTestId('m3-advance-event'), { target: { value: 'press' } });
    fireEvent.click(screen.getByTestId('m3-advance'));
    expect(onAdvance).toHaveBeenCalledWith('m1', 'press');
  });

  it('toggles persist_instance_state', () => {
    const onToggle = vi.fn();
    render(
      <StateInspectorPanel
        {...defaultProps({
          machines: [makeMachine({ id: 'm1' })],
          onTogglePersistInstanceState: onToggle,
        })}
      />,
    );
    fireEvent.click(screen.getByTestId('m3-persist-toggle'));
    expect(onToggle).toHaveBeenCalledWith('m1', true);
  });

  it('filters machines to the active slide', () => {
    render(
      <StateInspectorPanel
        {...defaultProps({
          activeSlideId: 's1',
          machines: [
            makeMachine({ id: 'm1', instanceId: 'inst-s1-1' }),
            makeMachine({ id: 'm2', instanceId: 'inst-s2-1' }),
          ],
        })}
      />,
    );
    const rows = screen.getAllByTestId('m3-machine-row');
    expect(rows).toHaveLength(1);
    expect(rows[0]?.textContent).toContain('inst-s1-1');
  });
});
