import { describe, expect, it } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import { SortableTable, type SortableColumn } from './SortableTable';

interface Row extends Record<string, unknown> {
  name: string;
  count: number;
}

const COLUMNS: ReadonlyArray<SortableColumn<Row>> = [
  { key: 'name', header: 'Name', type: 'string' },
  { key: 'count', header: 'Count', type: 'number', align: 'right' },
];

const ROWS: Row[] = [
  { name: 'banana', count: 3 },
  { name: 'apple', count: 10 },
  { name: 'cherry', count: 1 },
];

describe('SortableTable', () => {
  it('sorts by string column ascending', () => {
    render(<SortableTable rows={ROWS} columns={COLUMNS} />);
    fireEvent.click(screen.getByRole('button', { name: /Name/ }));
    const bodyRows = screen.getAllByRole('row').slice(1);
    expect(within(bodyRows[0] as HTMLElement).getByText('apple')).toBeInTheDocument();
    expect(within(bodyRows[2] as HTMLElement).getByText('cherry')).toBeInTheDocument();
  });

  it('sorts by numeric column', () => {
    render(<SortableTable rows={ROWS} columns={COLUMNS} />);
    fireEvent.click(screen.getByRole('button', { name: /Count/ }));
    const bodyRows = screen.getAllByRole('row').slice(1);
    // Ascending: 1, 3, 10.
    expect(within(bodyRows[0] as HTMLElement).getByText('1')).toBeInTheDocument();
    expect(within(bodyRows[2] as HTMLElement).getByText('10')).toBeInTheDocument();
  });

  it('toggles sort direction on repeated clicks', () => {
    render(<SortableTable rows={ROWS} columns={COLUMNS} />);
    const header = screen.getByRole('button', { name: /Name/ });
    fireEvent.click(header);
    let bodyRows = screen.getAllByRole('row').slice(1);
    expect(within(bodyRows[0] as HTMLElement).getByText('apple')).toBeInTheDocument();
    fireEvent.click(header);
    bodyRows = screen.getAllByRole('row').slice(1);
    expect(within(bodyRows[0] as HTMLElement).getByText('cherry')).toBeInTheDocument();
    // Third click clears.
    fireEvent.click(header);
    bodyRows = screen.getAllByRole('row').slice(1);
    expect(within(bodyRows[0] as HTMLElement).getByText('banana')).toBeInTheDocument();
  });

  it('renders empty state', () => {
    render(<SortableTable<Row> rows={[]} columns={COLUMNS} emptyMessage="Nothing here" />);
    expect(screen.getByText('Nothing here')).toBeInTheDocument();
  });
});
