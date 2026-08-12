/**
 * ParkingLot tests — S4.4.
 */

import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ParkingLot, type ParkingLotItem } from './ParkingLot';

const ITEMS: ParkingLotItem[] = [
  { id: 'q1', author: 'Alice', text: 'How does pricing work?', received_at_ms: 1000, votes: 3 },
  { id: 'q2', author: 'Bob', text: 'What about GDPR?', received_at_ms: 2000, votes: 1 },
  { id: 'q3', author: 'Carol', text: 'Pricing tiers comparison', received_at_ms: 3000, votes: 5 },
];

describe('ParkingLot', () => {
  it('renders the question count', () => {
    render(<ParkingLot items={ITEMS} />);
    expect(screen.getByText(/3 questions/)).toBeInTheDocument();
  });

  it('renders each item', () => {
    render(<ParkingLot items={ITEMS} />);
    expect(screen.getByTestId('parking-lot-item-q1')).toBeInTheDocument();
    expect(screen.getByTestId('parking-lot-item-q2')).toBeInTheDocument();
    expect(screen.getByTestId('parking-lot-item-q3')).toBeInTheDocument();
  });

  it('shows an empty-state message when there are no items', () => {
    render(<ParkingLot items={[]} />);
    expect(screen.getByTestId('parking-lot-empty').textContent).toMatch(/No questions yet/);
  });

  it('filters items by text', () => {
    render(<ParkingLot items={ITEMS} />);
    const filter = screen.getByTestId('parking-lot-filter');
    fireEvent.change(filter, { target: { value: 'gdpr' } });
    expect(screen.queryByTestId('parking-lot-item-q1')).toBeNull();
    expect(screen.getByTestId('parking-lot-item-q2')).toBeInTheDocument();
  });

  it('emits onPromote when the wrap-up button is clicked', () => {
    const onPromote = vi.fn();
    render(<ParkingLot items={ITEMS} onPromote={onPromote} />);
    fireEvent.click(screen.getByTestId('parking-lot-promote-q1'));
    expect(onPromote).toHaveBeenCalledWith('q1');
  });
});