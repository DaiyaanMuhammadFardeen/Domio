/**
 * MultiBrandSwitcher — Wave 2 §S2.5 unit tests.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MultiBrandSwitcher } from './MultiBrandSwitcher';
import type { BrandKitDetail } from '../../lib/brand-service';

const KIT_A: BrandKitDetail = {
  id: 'brand-a',
  name: 'Alpha',
  primaryHex: '#111111',
  accentHex: '#222222',
  colors: [], typography: [], spacing: [], radius: [], shadows: [],
};

const KIT_B: BrandKitDetail = {
  id: 'brand-b',
  name: 'Bravo',
  primaryHex: '#333333',
  accentHex: '#444444',
  colors: [], typography: [], spacing: [], radius: [], shadows: [],
};

describe('MultiBrandSwitcher', () => {
  it('renders the deck + slide selectors', () => {
    render(
      <MultiBrandSwitcher
        kits={[KIT_A, KIT_B]}
        deckKitId="brand-a"
        activeSlideKitId={null}
        onDeckKitChange={vi.fn()}
        onSlideKitChange={vi.fn()}
        onUpdateKit={vi.fn()}
      />,
    );
    expect(screen.getByTestId('multi-brand-deck-field')).toBeInTheDocument();
    expect(screen.getByTestId('multi-brand-slide-field')).toBeInTheDocument();
  });

  it('emits onDeckKitChange when the deck select changes', () => {
    const onDeckKitChange = vi.fn();
    render(
      <MultiBrandSwitcher
        kits={[KIT_A, KIT_B]}
        deckKitId="brand-a"
        activeSlideKitId={null}
        onDeckKitChange={onDeckKitChange}
        onSlideKitChange={vi.fn()}
        onUpdateKit={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByTestId('multi-brand-deck-select'), { target: { value: 'brand-b' } });
    expect(onDeckKitChange).toHaveBeenCalledWith('brand-b');
  });

  it('emits onSlideKitChange when the slide select changes', () => {
    const onSlideKitChange = vi.fn();
    render(
      <MultiBrandSwitcher
        kits={[KIT_A, KIT_B]}
        deckKitId="brand-a"
        activeSlideKitId={null}
        onDeckKitChange={vi.fn()}
        onSlideKitChange={onSlideKitChange}
        onUpdateKit={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByTestId('multi-brand-slide-select'), { target: { value: 'brand-b' } });
    expect(onSlideKitChange).toHaveBeenCalledWith('brand-b');
  });

  it('emits null when the slide select is set to inherit', () => {
    const onSlideKitChange = vi.fn();
    render(
      <MultiBrandSwitcher
        kits={[KIT_A, KIT_B]}
        deckKitId="brand-a"
        activeSlideKitId="brand-b"
        onDeckKitChange={vi.fn()}
        onSlideKitChange={onSlideKitChange}
        onUpdateKit={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByTestId('multi-brand-slide-select'), { target: { value: '' } });
    expect(onSlideKitChange).toHaveBeenCalledWith(null);
  });

  it('applies the selected kit to the slide when Apply is clicked', () => {
    const onSlideKitChange = vi.fn();
    render(
      <MultiBrandSwitcher
        kits={[KIT_A, KIT_B]}
        deckKitId="brand-a"
        activeSlideKitId={null}
        onDeckKitChange={vi.fn()}
        onSlideKitChange={onSlideKitChange}
        onUpdateKit={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByTestId('multi-brand-row-brand-b'));
    fireEvent.click(screen.getByTestId('multi-brand-apply'));
    expect(onSlideKitChange).toHaveBeenCalledWith('brand-b');
  });

  it('opens the edit dialog when Edit is clicked', () => {
    render(
      <MultiBrandSwitcher
        kits={[KIT_A]}
        deckKitId="brand-a"
        activeSlideKitId={null}
        onDeckKitChange={vi.fn()}
        onSlideKitChange={vi.fn()}
        onUpdateKit={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByTestId('multi-brand-edit'));
    expect(screen.getByTestId('multi-brand-edit-name')).toBeInTheDocument();
  });

  it('emits onUpdateKit with the patched fields', () => {
    const onUpdateKit = vi.fn();
    render(
      <MultiBrandSwitcher
        kits={[KIT_A]}
        deckKitId="brand-a"
        activeSlideKitId={null}
        onDeckKitChange={vi.fn()}
        onSlideKitChange={vi.fn()}
        onUpdateKit={onUpdateKit}
      />,
    );
    fireEvent.click(screen.getByTestId('multi-brand-edit'));
    fireEvent.change(screen.getByTestId('multi-brand-edit-name'), { target: { value: 'Alpha 2' } });
    fireEvent.click(screen.getByTestId('multi-brand-edit-save'));
    expect(onUpdateKit).toHaveBeenCalledWith('brand-a', expect.objectContaining({ name: 'Alpha 2' }));
  });
});
