import { describe, it, expect } from 'vitest';
import { MenuRegistry, flattenDeepMenu } from '../src/menus/registry.js';

describe('MenuRegistry', () => {
  it('flattens nested sub-menus to a maximum depth of 2', () => {
    const flat = flattenDeepMenu([
      {
        id: 'group',
        label: 'Group',
        children: [
          { id: 'a', label: 'A' },
          { id: 'b', label: 'B' },
        ],
      },
      {
        id: 'top',
        label: 'Top',
      },
    ]);
    expect(flat.map((entry) => entry.id)).toEqual(['group', 'a', 'b', 'top']);
  });

  it('hides feature-flagged entries', () => {
    const flat = flattenDeepMenu([
      { id: 'visible', label: 'Visible' },
      { id: 'hidden', label: 'Hidden', hidden: true },
    ]);
    expect(flat.map((entry) => entry.id)).toEqual(['visible']);
  });

  it('pins most-recently-used entries to the top', () => {
    const registry = new MenuRegistry();
    registry.register('frame', [
      { id: 'a', label: 'A' },
      { id: 'b', label: 'B' },
      { id: 'c', label: 'C' },
    ]);
    const sorted = registry.sortedFor('frame', ['c']);
    expect(sorted[0]!.id).toBe('c');
  });
});