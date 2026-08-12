/**
 * CadImportDialog — Wave 2 §S2.10 unit tests.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CadImportDialog } from './CadImportDialog';

describe('CadImportDialog', () => {
  it('does not render when closed', () => {
    render(<CadImportDialog open={false} onClose={vi.fn()} onImport={vi.fn()} />);
    expect(screen.queryByTestId('cad-dialog')).toBeNull();
  });

  it('renders when open', () => {
    render(<CadImportDialog open onClose={vi.fn()} onImport={vi.fn()} />);
    expect(screen.getByTestId('cad-dialog')).toBeInTheDocument();
  });

  it('calls onClose when the close button is clicked', () => {
    const onClose = vi.fn();
    render(<CadImportDialog open onClose={onClose} onImport={vi.fn()} />);
    fireEvent.click(screen.getByTestId('cad-dialog-close'));
    expect(onClose).toHaveBeenCalled();
  });

  it('disables submit until a file is chosen', () => {
    render(<CadImportDialog open onClose={vi.fn()} onImport={vi.fn()} />);
    expect(screen.getByTestId('cad-dialog-submit')).toBeDisabled();
  });
});