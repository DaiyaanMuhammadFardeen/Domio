/**
 * LibraryLockIcon — Wave 2 §S2.6 unit tests.
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LibraryLockIcon } from './LibraryLockIcon';

describe('LibraryLockIcon', () => {
  it('renders nothing when not locked', () => {
    const { container } = render(<LibraryLockIcon locked={false} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders an icon when locked', () => {
    render(<LibraryLockIcon locked />);
    expect(screen.getByTestId('library-lock-icon')).toBeInTheDocument();
  });

  it('honours a custom id', () => {
    render(<LibraryLockIcon locked id="custom-lock" />);
    expect(screen.getByTestId('custom-lock')).toBeInTheDocument();
  });
});
