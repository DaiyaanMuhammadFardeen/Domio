/**
 * Registry tests — every AudienceWidgetType resolves to a Component.
 */

import { describe, expect, it } from 'vitest';
import { REGISTERED_WIDGET_KINDS, WIDGET_REGISTRY, getWidget } from '@/components/widgets/registry';

describe('widget registry', () => {
  it('has exactly 8 widget kinds registered', () => {
    expect(REGISTERED_WIDGET_KINDS).toBe(8);
    expect(WIDGET_REGISTRY.size).toBe(8);
  });

  it.each([
    'poll',
    'word_cloud',
    'qa',
    'quiz',
    'reaction',
    'nav_vote',
    'sentiment',
    'raise_hand',
  ] as const)('resolves %s to a Component', (type) => {
    const entry = getWidget(type);
    expect(entry).toBeDefined();
    expect(entry?.type).toBe(type);
    expect(typeof entry?.Component).toBe('function');
  });

  it('returns undefined for unknown types', () => {
    expect(getWidget('not_a_widget')).toBeUndefined();
  });
});
