/**
 * ARPreviewButton — Wave 2 §S2.10 unit tests.
 */

import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ARPreviewButton } from './ARPreviewButton';

describe('ARPreviewButton', () => {
  it('renders the button', () => {
    render(<ARPreviewButton slideId="slide-1" />);
    expect(screen.getByTestId('ar-preview-btn')).toBeInTheDocument();
  });

  it('opens the modal with QR on click', async () => {
    render(<ARPreviewButton slideId="slide-1" />);
    fireEvent.click(screen.getByTestId('ar-preview-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('ar-preview-modal')).toBeInTheDocument();
    });
    expect(screen.getByTestId('ar-preview-qr')).toBeInTheDocument();
  });

  it('closes the modal when Close is clicked', async () => {
    render(<ARPreviewButton slideId="slide-1" />);
    fireEvent.click(screen.getByTestId('ar-preview-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('ar-preview-modal')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('ar-preview-close'));
    expect(screen.queryByTestId('ar-preview-modal')).toBeNull();
  });

  it('disables the button when disabled', () => {
    render(<ARPreviewButton slideId="slide-1" disabled />);
    expect(screen.getByTestId('ar-preview-btn')).toBeDisabled();
  });
});
