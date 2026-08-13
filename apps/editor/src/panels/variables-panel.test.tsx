import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { VariablesPanel } from './variables-panel';

function defaultProps(
  overrides: Partial<React.ComponentProps<typeof VariablesPanel>> = {},
): React.ComponentProps<typeof VariablesPanel> {
  return {
    variables: [],
    rules: [],
    onAddVariable: vi.fn(),
    onRemoveVariable: vi.fn(),
    onAddRule: vi.fn(),
    onRemoveRule: vi.fn(),
    ...overrides,
  } as React.ComponentProps<typeof VariablesPanel>;
}

describe('VariablesPanel', () => {
  it('renders the panel header', () => {
    render(<VariablesPanel {...defaultProps()} />);
    expect(screen.getByRole('heading', { name: 'Variables' })).toBeInTheDocument();
  });

  it('renders both tabs', () => {
    render(<VariablesPanel {...defaultProps()} />);
    expect(screen.getByTestId('p10-tab-variables')).toHaveTextContent('Variables');
    expect(screen.getByTestId('p10-tab-rules')).toHaveTextContent('Rules');
  });

  it('switches to the rules tab', () => {
    render(<VariablesPanel {...defaultProps()} />);
    fireEvent.click(screen.getByTestId('p10-tab-rules'));
    expect(screen.getByTestId('p10-rule-list')).toBeInTheDocument();
  });

  it('adds a variable with parsed numeric default', () => {
    const onAddVariable = vi.fn();
    render(<VariablesPanel {...defaultProps()} onAddVariable={onAddVariable} />);
    fireEvent.change(screen.getByTestId('p10-var-name'), { target: { value: 'SEATS' } });
    fireEvent.change(screen.getByTestId('p10-var-type'), { target: { value: 'number' } });
    fireEvent.change(screen.getByTestId('p10-var-default'), { target: { value: '12' } });
    fireEvent.click(screen.getByTestId('p10-var-add'));
    expect(onAddVariable).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'SEATS', type: 'number', defaultValue: 12 }),
    );
  });

  it('removes a variable', () => {
    const onRemoveVariable = vi.fn();
    render(
      <VariablesPanel
        {...defaultProps({
          variables: [
            {
              id: 'v1',
              name: 'TIER',
              scope: 'deck',
              type: 'string',
              defaultValue: 'monthly',
              visibility: 'deck_public',
            },
          ],
          onRemoveVariable,
        })}
      />,
    );
    fireEvent.click(screen.getByTestId('p10-var-remove'));
    expect(onRemoveVariable).toHaveBeenCalledWith('v1');
  });

  it('adds a rule', () => {
    const onAddRule = vi.fn();
    render(<VariablesPanel {...defaultProps()} onAddRule={onAddRule} />);
    fireEvent.click(screen.getByTestId('p10-tab-rules'));
    fireEvent.click(screen.getByTestId('p10-rule-add'));
    expect(onAddRule).toHaveBeenCalledWith(
      expect.objectContaining({ conditionSource: '$TIER == "annual"' }),
    );
  });

  it('previews a true rule', () => {
    render(
      <VariablesPanel
        {...defaultProps({
          variables: [
            {
              id: 'v1',
              name: 'TIER',
              scope: 'deck',
              type: 'string',
              defaultValue: 'annual',
              visibility: 'deck_public',
            },
          ],
        })}
      />,
    );
    fireEvent.click(screen.getByTestId('p10-tab-rules'));
    fireEvent.click(screen.getByTestId('p10-rule-test'));
    expect(screen.getByTestId('p10-rule-preview')).toHaveTextContent(/True/);
  });

  it('previews a false rule', () => {
    render(
      <VariablesPanel
        {...defaultProps({
          variables: [
            {
              id: 'v1',
              name: 'TIER',
              scope: 'deck',
              type: 'string',
              defaultValue: 'monthly',
              visibility: 'deck_public',
            },
          ],
        })}
      />,
    );
    fireEvent.click(screen.getByTestId('p10-tab-rules'));
    fireEvent.click(screen.getByTestId('p10-rule-test'));
    expect(screen.getByTestId('p10-rule-preview')).toHaveTextContent(/False/);
  });

  it('surfaces a compile error', () => {
    render(<VariablesPanel {...defaultProps()} />);
    fireEvent.click(screen.getByTestId('p10-tab-rules'));
    fireEvent.change(screen.getByTestId('p10-rule-condition'), { target: { value: 'eval("x")' } });
    fireEvent.click(screen.getByTestId('p10-rule-test'));
    expect(screen.getByTestId('p10-rule-error')).toBeInTheDocument();
  });

  it('removes a rule', () => {
    const onRemoveRule = vi.fn();
    render(
      <VariablesPanel
        {...defaultProps({
          rules: [
            {
              id: 'r1',
              name: 'Rule',
              priority: 0,
              conditionSource: '$A == 1',
              action: { kind: 'show', params: {} },
              enabled: true,
            },
          ],
          onRemoveRule,
        })}
      />,
    );
    fireEvent.click(screen.getByTestId('p10-tab-rules'));
    fireEvent.click(screen.getByTestId('p10-rule-remove'));
    expect(onRemoveRule).toHaveBeenCalledWith('r1');
  });

  it('shows the empty states', () => {
    render(<VariablesPanel {...defaultProps()} />);
    expect(screen.getByText('No variables yet.')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('p10-tab-rules'));
    expect(screen.getByText('No rules yet.')).toBeInTheDocument();
  });
});
