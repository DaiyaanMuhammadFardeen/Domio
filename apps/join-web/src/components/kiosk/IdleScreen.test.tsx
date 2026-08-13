/**
 * IdleScreen tests — S5.8.
 */

import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { IdleScreen } from './IdleScreen';

describe('IdleScreen', () => {
  it('renders nothing when visible=false', () => {
    const { container } = render(
      <IdleScreen visible={false} onWake={() => {}} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders the overlay when visible=true', () => {
    render(<IdleScreen visible={true} onWake={() => {}} promptText="Tap me" />);
    const overlay = screen.getByTestId('kiosk-idle-screen');
    expect(overlay).toBeInTheDocument();
    expect(overlay).toHaveTextContent(/Tap me/);
    expect(overlay).toHaveAttribute('role', 'button');
  });

  it('fires onWake when the user clicks the overlay', () => {
    const onWake = vi.fn();
    render(<IdleScreen visible={true} onWake={onWake} />);
    fireEvent.click(screen.getByTestId('kiosk-idle-screen'));
    expect(onWake).toHaveBeenCalledTimes(1);
  });

  it('fires onWake on a pointerdown event', () => {
    const onWake = vi.fn();
    render(<IdleScreen visible={true} onWake={onWake} />);
    fireEvent.pointerDown(screen.getByTestId('kiosk-idle-screen'));
    expect(onWake).toHaveBeenCalledTimes(1);
  });
});