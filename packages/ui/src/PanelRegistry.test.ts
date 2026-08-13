import { describe, expect, it } from 'vitest';
import { createPanelRegistry, type PanelDefinition } from './PanelRegistry.js';

type Id = 'a' | 'b' | 'c';
type Group = 'first' | 'second';

const makePanel = (id: Id, group: Group, order = 0): PanelDefinition<Id, Group, unknown> => ({
  id,
  label: id.toUpperCase(),
  group,
  order,
  // A trivial component (function returning null) is enough for registry tests.
  Component: () => null,
});

describe('createPanelRegistry', () => {
  it('adds and retrieves panels by id', () => {
    const reg = createPanelRegistry<Id, Group, unknown>();
    reg.add(makePanel('a', 'first'));
    const got = reg.get('a');
    expect(got?.id).toBe('a');
    expect(got?.label).toBe('A');
  });

  it('addAll registers many at once', () => {
    const reg = createPanelRegistry<Id, Group, unknown>();
    reg.addAll([makePanel('a', 'first'), makePanel('b', 'second')]);
    expect(reg.list()).toHaveLength(2);
  });

  it('rejects duplicate ids', () => {
    const reg = createPanelRegistry<Id, Group, unknown>();
    reg.add(makePanel('a', 'first'));
    expect(() => reg.add(makePanel('a', 'first'))).toThrow(/duplicate/i);
  });

  it('listByGroup returns panels sorted by order', () => {
    const reg = createPanelRegistry<Id, Group, unknown>();
    reg.addAll([
      makePanel('a', 'first', 2),
      makePanel('b', 'first', 1),
      makePanel('c', 'second', 0),
    ]);
    const firsts = reg.listByGroup('first');
    expect(firsts.map((p) => p.id)).toEqual(['b', 'a']);
  });

  it('groups returns unique groups in insertion order', () => {
    const reg = createPanelRegistry<Id, Group, unknown>();
    reg.addAll([makePanel('a', 'first'), makePanel('b', 'second'), makePanel('c', 'first')]);
    expect(reg.groups()).toEqual(['first', 'second']);
  });

  it('has is a type guard', () => {
    const reg = createPanelRegistry<Id, Group, unknown>();
    reg.add(makePanel('a', 'first'));
    expect(reg.has('a')).toBe(true);
    expect(reg.has('z')).toBe(false);
  });
});
