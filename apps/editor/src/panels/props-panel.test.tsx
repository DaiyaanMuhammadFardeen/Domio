import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { getComponent } from '@domio/components';
import { asULID } from '@domio/schema';
import { PropsPanel } from './PropsPanel.js';
import type { ComponentLayer } from '@domio/schema';

const def = getComponent('domio.stat-card');

function layer(overrides: Partial<ComponentLayer['component']> = {}): ComponentLayer {
  return {
    id: asULID('00000000000000000000000010'),
    semanticId: 'stat1',
    type: 'component',
    name: 'Stat Card',
    parentId: null,
    transform: { x: 0, y: 0, w: def!.size.w, h: def!.size.h, rotation: 0 },
    component: {
      catalogId: 'domio.stat-card',
      version: '1.0.0',
      variant: 'light',
      props: {},
      ...overrides,
    },
  };
}

describe('PropsPanel', () => {
  it('renders the component name, catalog id, and variant switcher', () => {
    render(
      <PropsPanel element={layer()} onPropEdit={vi.fn()} onVariantChange={vi.fn()} />,
    );
    expect(screen.getByText('Stat Card')).toBeInTheDocument();
    expect(screen.getByText(/domio\.stat-card · v1\.0\.0/)).toBeInTheDocument();
    const group = screen.getByRole('group', { name: 'Variant' });
    expect(within(group).getByText('Light')).toBeInTheDocument();
    expect(within(group).getByText('Dark')).toBeInTheDocument();
  });

  it('marks required props with an asterisk', () => {
    render(
      <PropsPanel element={layer()} onPropEdit={vi.fn()} onVariantChange={vi.fn()} />,
    );
    const valueLabel = screen.getByLabelText('Value *');
    expect(valueLabel).toBeInTheDocument();
  });

  it('emits a prop edit when a text field changes', () => {
    const onPropEdit = vi.fn();
    render(
      <PropsPanel element={layer()} onPropEdit={onPropEdit} onVariantChange={vi.fn()} />,
    );
    const input = screen.getByLabelText('Label');
    fireEvent.change(input, { target: { value: 'MRR' } });
    expect(onPropEdit).toHaveBeenCalledWith('label', 'Revenue', 'MRR');
  });

  it('emits a prop edit when a number field changes', () => {
    const onPropEdit = vi.fn();
    render(
      <PropsPanel element={layer()} onPropEdit={onPropEdit} onVariantChange={vi.fn()} />,
    );
    const input = screen.getByLabelText('Value *');
    fireEvent.change(input, { target: { value: '99' } });
    expect(onPropEdit).toHaveBeenCalledWith('value', 42, 99);
  });

  it('emits a prop edit when a toggle flips', () => {
    const onPropEdit = vi.fn();
    render(
      <PropsPanel element={layer()} onPropEdit={onPropEdit} onVariantChange={vi.fn()} />,
    );
    const toggle = screen.getByLabelText('Show delta');
    fireEvent.click(toggle);
    expect(onPropEdit).toHaveBeenCalledWith('showDelta', true, false);
  });

  it('emits a variant change when the variant switcher is used', () => {
    const onVariantChange = vi.fn();
    render(
      <PropsPanel element={layer()} onPropEdit={vi.fn()} onVariantChange={onVariantChange} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Dark' }));
    expect(onVariantChange).toHaveBeenCalledWith('light', 'dark');
  });

  it('reflects already-set props instead of defaults', () => {
    render(
      <PropsPanel
        element={layer({ props: { label: 'ARR', showDelta: false } })}
        onPropEdit={vi.fn()}
        onVariantChange={vi.fn()}
      />,
    );
    expect(screen.getByLabelText('Label')).toHaveValue('ARR');
  });
});
