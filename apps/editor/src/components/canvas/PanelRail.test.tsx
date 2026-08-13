import { describe, expect, it, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { PanelRail } from './PanelRail';

const PANELS = [
  { id: 'layers', label: 'Layers', group: 'core' },
  { id: 'library', label: 'Library', group: 'core' },
  { id: 'data', label: 'Data', group: 'data' },
  { id: 'filters', label: 'Filters', group: 'data' },
  { id: 'anim', label: 'Animations', group: 'foo' },
  { id: 'foos', label: 'Foo settings', group: 'foo' },
] as const;

const GROUPS = [
  { id: 'core', label: 'Core' },
  { id: 'data', label: 'Data' },
  { id: 'foo', label: 'Foo group' },
] as const;

describe('PanelRail', () => {
  it('renders every group header', () => {
    const { getAllByTestId } = render(
      <PanelRail
        panels={PANELS as unknown as ReadonlyArray<{ id: string; label: string; group: string }>}
        groups={GROUPS as unknown as ReadonlyArray<{ id: string; label: string }>}
        activeId="layers"
        onSelect={() => {}}
      />,
    );
    expect(getAllByTestId(/^panel-group-(core|data|foo)$/).length).toBe(3);
  });

  it('collapses and expands a group via the header button', () => {
    const { container, getAllByTestId } = render(
      <PanelRail
        panels={PANELS as unknown as ReadonlyArray<{ id: string; label: string; group: string }>}
        groups={GROUPS as unknown as ReadonlyArray<{ id: string; label: string }>}
        activeId="layers"
        onSelect={() => {}}
      />,
    );
    // The "Layers" tab should render initially.
    expect(container.querySelector('[data-testid="panel-tab-layers"]')).toBeTruthy();

    const coreHeader = getAllByTestId('panel-group-core')[0] as HTMLElement;
    expect(coreHeader).toBeTruthy();
    const headerBtn = coreHeader.querySelector('.panel-rail__group-header') as HTMLButtonElement;
    expect(headerBtn).toBeTruthy();
    expect(headerBtn.getAttribute('aria-expanded')).toBe('true');

    // Collapse the group.
    fireEvent.click(headerBtn);
    expect(headerBtn.getAttribute('aria-expanded')).toBe('false');
    expect(container.querySelector('[data-testid="panel-tab-layers"]')).toBeNull();

    // Expand it again.
    fireEvent.click(headerBtn);
    expect(headerBtn.getAttribute('aria-expanded')).toBe('true');
    expect(container.querySelector('[data-testid="panel-tab-layers"]')).toBeTruthy();
  });

  it('filters panels by search text and hides group headers', () => {
    const { container, getByTestId } = render(
      <PanelRail
        panels={PANELS as unknown as ReadonlyArray<{ id: string; label: string; group: string }>}
        groups={GROUPS as unknown as ReadonlyArray<{ id: string; label: string }>}
        activeId="layers"
        onSelect={() => {}}
      />,
    );
    const search = getByTestId('panel-search') as HTMLInputElement;
    fireEvent.change(search, { target: { value: 'foo' } });

    // Group headers hidden in search mode.
    expect(container.querySelector('[data-testid="panel-group-core"]')).toBeNull();
    // Only the matching panels remain — foos is the only match.
    expect(container.querySelector('[data-testid="panel-tab-foos"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="panel-tab-layers"]')).toBeNull();
    // Search is case-insensitive.
    fireEvent.change(search, { target: { value: 'LAYERS' } });
    expect(container.querySelector('[data-testid="panel-tab-layers"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="panel-tab-foos"]')).toBeNull();
  });

  it('clears the search when Escape is pressed', () => {
    const { getByTestId } = render(
      <PanelRail
        panels={PANELS as unknown as ReadonlyArray<{ id: string; label: string; group: string }>}
        groups={GROUPS as unknown as ReadonlyArray<{ id: string; label: string }>}
        activeId="layers"
        onSelect={() => {}}
      />,
    );
    const search = getByTestId('panel-search') as HTMLInputElement;
    fireEvent.change(search, { target: { value: 'foo' } });
    expect(search.value).toBe('foo');
    fireEvent.keyDown(search, { key: 'Escape' });
    expect(search.value).toBe('');
  });

  it('invokes onSelect when a panel button is clicked', () => {
    const onSelect = vi.fn();
    const { getByTestId } = render(
      <PanelRail
        panels={PANELS as unknown as ReadonlyArray<{ id: string; label: string; group: string }>}
        groups={GROUPS as unknown as ReadonlyArray<{ id: string; label: string }>}
        activeId="layers"
        onSelect={onSelect}
      />,
    );
    fireEvent.click(getByTestId('panel-tab-library'));
    expect(onSelect).toHaveBeenCalledWith('library');
  });

  it('marks the active panel with aria-selected=true', () => {
    const { getByTestId } = render(
      <PanelRail
        panels={PANELS as unknown as ReadonlyArray<{ id: string; label: string; group: string }>}
        groups={GROUPS as unknown as ReadonlyArray<{ id: string; label: string }>}
        activeId="data"
        onSelect={() => {}}
      />,
    );
    const dataTab = getByTestId('panel-tab-data') as HTMLButtonElement;
    expect(dataTab.getAttribute('aria-selected')).toBe('true');
    const layersTab = getByTestId('panel-tab-layers') as HTMLButtonElement;
    expect(layersTab.getAttribute('aria-selected')).toBe('false');
  });
});
