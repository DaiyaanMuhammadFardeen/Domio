import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { KpiTile } from './KpiTile';

describe('KpiTile', () => {
  it('renders title and value', () => {
    render(<KpiTile title="Sessions" value="1.2k" />);
    expect(screen.getByText('Sessions')).toBeInTheDocument();
    expect(screen.getByText('1.2k')).toBeInTheDocument();
  });

  it('renders positive delta in green', () => {
    const { container } = render(<KpiTile title="X" value="10" delta={5.4} />);
    const deltaEl = screen.getByText('5.4%');
    expect(deltaEl).toBeInTheDocument();
    // The wrapping div carries the green class for positive deltas.
    const wrapper = container.querySelector('.text-emerald-600');
    expect(wrapper).not.toBeNull();
  });

  it('renders negative delta in red', () => {
    const { container } = render(<KpiTile title="Y" value="5" delta={-3.2} />);
    const deltaEl = screen.getByText('3.2%');
    expect(deltaEl).toBeInTheDocument();
    const wrapper = container.querySelector('.text-rose-600');
    expect(wrapper).not.toBeNull();
  });

  it('renders zero delta neutrally', () => {
    render(<KpiTile title="Z" value="0" delta={0} />);
    expect(screen.getByText('0.0%')).toBeInTheDocument();
  });
});