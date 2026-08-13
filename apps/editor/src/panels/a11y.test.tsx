/**
 * Accessibility gate — run axe-core over the P06 panels.
 * DoD NFR-COM-11: no critical violations on insert / props / library surfaces.
 */
import { describe, expect, it, beforeAll } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import axe from 'axe-core';
import { InsertPanel } from './InsertPanel.js';
import { PropsPanel } from './PropsPanel.js';
import { getComponent } from '@domio/components';
import { asULID } from '@domio/schema';

function runAxe(root: HTMLElement): Promise<axe.AxeResults> {
  return axe.run(root, {
    rules: {
      'color-contrast': { enabled: false }, // jsdom has no real CSS cascade
    },
  });
}

describe('P06 panels — axe a11y', () => {
  beforeAll(() => {
    // axe needs a full document; testing-library provides one via jsdom
    document.body.innerHTML = '<div id="root"></div>';
  });

  it('InsertPanel has no critical/serious violations', async () => {
    const { container } = render(<InsertPanel onInsert={() => {}} />, {
      container: document.getElementById('root')!,
    });
    const results = await runAxe(container);
    const serious = results.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious',
    );
    expect(serious).toEqual([]);
    cleanup();
  });

  it('PropsPanel has no critical/serious violations', async () => {
    const def = getComponent('domio.stat-card')!;
    const layer = {
      id: asULID('01HZX01HZX01HZX01HZX01HZXVW'),
      semanticId: 'card',
      type: 'component' as const,
      name: 'Stat Card',
      parentId: null,
      transform: { x: 0, y: 0, w: def.size.w, h: def.size.h, rotation: 0 },
      component: { catalogId: def.catalogId, version: def.version, variant: 'light', props: {} },
    };
    const { container } = render(
      <PropsPanel element={layer} onPropEdit={() => {}} onVariantChange={() => {}} />,
      { container: document.getElementById('root')! },
    );
    const results = await runAxe(container);
    const serious = results.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious',
    );
    expect(serious).toEqual([]);
    cleanup();
  });
});
